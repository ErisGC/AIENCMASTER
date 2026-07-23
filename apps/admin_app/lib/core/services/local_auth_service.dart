import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Protección local de la app: huella (biometría del teléfono) y/o PIN.
///
/// El bloqueo local es OPCIONAL y la elección del usuario se recuerda: si
/// decide no proteger la app, entra directo y no se le vuelve a preguntar ni
/// se le cierra la sesión por inactividad. La trazabilidad de quién hace qué
/// la cubre la auditoría del servidor, no el bloqueo local.
///
/// Endurecimiento del PIN:
///   - Se guarda como SHA-256 salado e iterado (no en claro, no FNV débil).
///   - Throttling local: tras varios fallos se bloquea con espera escalada,
///     para frenar fuerza bruta sobre el dispositivo.
///   - Las cookies HttpOnly están en cookie_jar (archivos dentro del sandbox
///     del app), inaccesibles para otras apps.
class LocalAuthService {
  LocalAuthService();

  static const _kPinHash = 'local_pin_hash';
  static const _kPinSalt = 'local_pin_salt';
  static const _kPinFails = 'local_pin_fails';
  static const _kPinLockUntil = 'local_pin_lock_until';
  static const _kLastUser = 'local_last_user';
  static const _kBiometricEnabled = 'local_biometric_enabled';

  /// Marca que el usuario YA decidió cómo quiere proteger la app (con huella,
  /// con PIN, o sin nada). Mientras esté puesta no se le vuelve a preguntar:
  /// antes se le forzaba la pantalla de configuración en cada inicio de sesión.
  static const _kLockChoiceMade = 'local_lock_choice_made';

  final LocalAuthentication _bio = LocalAuthentication();

  /// Iteraciones del KDF. Suficiente para encarecer la fuerza bruta sin
  /// retrasar perceptiblemente el desbloqueo legítimo.
  static const _iterations = 20000;

  /// A partir de este número de fallos consecutivos empieza el bloqueo.
  static const _failThreshold = 5;

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  /// ¿El teléfono tiene huella/rostro configurado y utilizable?
  Future<bool> biometricsAvailable() async {
    try {
      if (!await _bio.isDeviceSupported()) return false;
      return await _bio.canCheckBiometrics;
    } catch (_) {
      return false;
    }
  }

  /// ¿El usuario activó el desbloqueo por huella para esta app?
  Future<bool> isBiometricEnabled() async {
    final p = await _prefs;
    if (!(p.getBool(_kBiometricEnabled) ?? false)) return false;
    // Si el usuario quitó la huella del teléfono, dejamos de exigirla para no
    // dejarlo encerrado fuera de la app.
    return biometricsAvailable();
  }

  Future<void> setBiometricEnabled(bool value) async {
    final p = await _prefs;
    await p.setBool(_kBiometricEnabled, value);
  }

  /// Lanza el diálogo biométrico del sistema. Devuelve true si autenticó.
  Future<bool> authenticate({String? reason}) async {
    try {
      return await _bio.authenticate(
        localizedReason: reason ?? 'Confirma tu identidad para entrar a AIENC',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }

  /// ¿Ya eligió el usuario cómo proteger la app? (para no volver a preguntar)
  Future<bool> lockChoiceMade() async {
    final p = await _prefs;
    return p.getBool(_kLockChoiceMade) ?? false;
  }

  Future<void> markLockChoiceMade() async {
    final p = await _prefs;
    await p.setBool(_kLockChoiceMade, true);
  }

  Future<void> setPin(String pin) async {
    final p = await _prefs;
    final salt = _generateSalt();
    await p.setString(_kPinSalt, salt);
    await p.setString(_kPinHash, _kdf(pin, salt));
    await p.remove(_kPinFails);
    await p.remove(_kPinLockUntil);
  }

  /// Verifica el PIN aplicando throttling. Devuelve false si el PIN es
  /// incorrecto O si el dispositivo está temporalmente bloqueado por
  /// demasiados intentos.
  Future<bool> verifyPin(String pin) async {
    final p = await _prefs;
    if (await _isLocked(p)) return false;

    final stored = p.getString(_kPinHash);
    if (stored == null) return false;

    final salt = p.getString(_kPinSalt);
    final matches = salt == null
        // Migración: PIN antiguo guardado con FNV-1a sin sal.
        ? stored == _legacyHash(pin)
        : _constantTimeEquals(stored, _kdf(pin, salt));

    if (matches) {
      // Éxito: si venía del formato viejo, re-hashea con sal.
      if (salt == null) await setPin(pin);
      await p.remove(_kPinFails);
      await p.remove(_kPinLockUntil);
      return true;
    }

    await _registerFailure(p);
    return false;
  }

  Future<bool> hasPin() async {
    final p = await _prefs;
    return p.getString(_kPinHash) != null;
  }

  /// Deriva una llave AES-256 (32 bytes) a partir del PIN para cifrar el
  /// cookie jar en reposo. Usa un prefijo de dominio distinto al del hash de
  /// autenticación, de modo que la llave de cifrado y el verificador del PIN
  /// nunca coinciden aunque compartan la sal.
  ///
  /// Devuelve `null` si no hay sal guardada (PIN heredado sin sal): en ese
  /// caso el cookie jar se mantiene en claro hasta que el PIN se re-guarde
  /// con sal (lo hace [verifyPin] al migrar) o el usuario reconfigure el PIN.
  Future<List<int>?> deriveCookieKey(String pin) async {
    final p = await _prefs;
    final salt = p.getString(_kPinSalt);
    if (salt == null) return null;
    List<int> data = utf8.encode('aienc-cookie-key:$salt:$pin');
    for (var i = 0; i < _iterations; i++) {
      data = sha256.convert(data).bytes;
    }
    return data; // 32 bytes (SHA-256)
  }

  /// True si el desbloqueo está bloqueado temporalmente por intentos fallidos.
  Future<bool> isLocked() async => _isLocked(await _prefs);

  /// Segundos restantes de bloqueo (0 si no está bloqueado).
  Future<int> secondsUntilUnlock() async {
    final p = await _prefs;
    final until = p.getInt(_kPinLockUntil) ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch;
    if (until <= now) return 0;
    return ((until - now) / 1000).ceil();
  }

  Future<void> setLastUser(String username) async {
    final p = await _prefs;
    await p.setString(_kLastUser, username);
  }

  Future<String?> lastUser() async {
    final p = await _prefs;
    return p.getString(_kLastUser);
  }

  /// Borra la protección local. Se usa al CERRAR SESIÓN explícitamente: en ese
  /// dispositivo puede entrar otro admin, así que su protección debe ser suya
  /// (y por eso también se olvida la elección previa).
  Future<void> clearAll() async {
    final p = await _prefs;
    await p.remove(_kPinHash);
    await p.remove(_kPinSalt);
    await p.remove(_kPinFails);
    await p.remove(_kPinLockUntil);
    await p.remove(_kLastUser);
    await p.remove(_kBiometricEnabled);
    await p.remove(_kLockChoiceMade);
  }

  /* ── internos ── */

  Future<bool> _isLocked(SharedPreferences p) async {
    final until = p.getInt(_kPinLockUntil) ?? 0;
    return DateTime.now().millisecondsSinceEpoch < until;
  }

  Future<void> _registerFailure(SharedPreferences p) async {
    final fails = (p.getInt(_kPinFails) ?? 0) + 1;
    await p.setInt(_kPinFails, fails);

    if (fails >= _failThreshold) {
      // Espera escalada: 30s, 60s, 120s... con tope de 5 minutos.
      final over = fails - _failThreshold;
      final seconds = (30 * (1 << over)).clamp(30, 300);
      final until =
          DateTime.now().millisecondsSinceEpoch + seconds * 1000;
      await p.setInt(_kPinLockUntil, until);
    }
  }

  String _generateSalt() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return base64Url.encode(bytes);
  }

  /// SHA-256 salado e iterado. Encadena hashes (sal + pin) _iterations veces.
  String _kdf(String pin, String salt) {
    List<int> data = utf8.encode('$salt:$pin');
    for (var i = 0; i < _iterations; i++) {
      data = sha256.convert(data).bytes;
    }
    return base64Url.encode(data);
  }

  /// Hash legacy (FNV-1a) sólo para migrar PINs guardados con el formato viejo.
  String _legacyHash(String pin) {
    var h = 0x811c9dc5;
    for (final c in pin.codeUnits) {
      h ^= c;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    return h.toRadixString(16).padLeft(8, '0');
  }

  bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }
}
