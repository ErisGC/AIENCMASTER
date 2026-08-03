import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../models/domain.dart';
import '../services/auth_service.dart';
import '../services/local_auth_service.dart';

/// Estado global de autenticación.
///
/// La fuente de verdad para "estoy logueado" es la cookie HttpOnly que el
/// backend setea en /admin/auth/login. Cuando arranca la app, llamamos a
/// /admin/auth/session para saber si la cookie sigue siendo válida.
///
/// `locked` indica que tenemos sesión válida pero el usuario debe pasar
/// el bloqueo local (biometría / PIN) antes de ver el panel.
enum AuthPhase {
  /// Aún no sabemos qué hacer (esperando /admin/auth/session).
  loading,

  /// No hay sesión, hay que loguear o aceptar invitación.
  signedOut,

  /// Hay cookies válidas pero el usuario tiene biometría/PIN activos
  /// y todavía no ha desbloqueado en este arranque.
  locked,

  /// Sabemos QUIÉN es (hay bloqueo local configurado y usuario recordado) pero
  /// hace falta su contraseña: o la sesión del servidor caducó, o toca el
  /// control periódico. No es un signedOut: no se pierde la configuración ni
  /// hay que escribir el usuario de nuevo.
  needsPassword,

  /// Listo: pantallas de la app son accesibles.
  authenticated,
}

/// Resultado de un intento de desbloqueo local (ver [AuthState.unlock]).
enum UnlockOutcome {
  /// Desbloqueado y con sesión válida.
  authenticated,

  /// La sesión ya no es válida: se limpió y hay que iniciar sesión de nuevo.
  sessionEnded,

  /// No se pudo contactar el servidor: la sesión se conserva; reintentar.
  networkError,
}

class AuthState extends ChangeNotifier {
  AuthState({required AuthService auth, required LocalAuthService localAuth})
      : _auth = auth,
        _localAuth = localAuth;

  final AuthService _auth;
  final LocalAuthService _localAuth;

  AuthPhase _phase = AuthPhase.loading;
  AuthPhase get phase => _phase;

  AdminAccount? _account;
  AdminAccount? get account => _account;

  String? _activeChurchId;
  String? get activeChurchId => _activeChurchId;
  set activeChurchId(String? id) {
    _activeChurchId = id;
    notifyListeners();
  }

  /// Llamado al arrancar la app. El camino depende del modo de bloqueo:
  ///
  ///   - [LockMode.pin]: el jar está cifrado con la llave del PIN, así que no
  ///     podemos leer la sesión todavía → pantalla de bloqueo; la validación
  ///     ocurre en [unlock].
  ///   - [LockMode.bio]: el jar está en claro → validamos la sesión y pedimos
  ///     la huella antes de mostrar el panel.
  ///   - [LockMode.none]: validamos y entramos directo.
  ///
  /// Si la sesión del servidor ya no vale pero SÍ hay bloqueo configurado y un
  /// usuario recordado, no se cae a signedOut: se pide sólo la contraseña
  /// ([AuthPhase.needsPassword]) conservando toda la configuración.
  Future<void> bootstrap() async {
    _phase = AuthPhase.loading;
    notifyListeners();

    final mode = await _localAuth.lockMode();

    if (mode == LockMode.pin) {
      // Marcar el store como sellado evita que una lectura interprete bytes
      // cifrados como texto plano (corrompería el índice del jar).
      ApiClient.I.markCookiesSealed();
      _account = null;
      _phase = AuthPhase.locked;
      notifyListeners();
      return;
    }

    try {
      final session = await _auth.getSession();
      if (session.status == 'ACTIVE' && session.account != null) {
        _account = session.account;
        _selectDefaultChurch();
        // Control periódico: aunque la sesión siga viva, cada cierto tiempo se
        // vuelve a pedir la contraseña de la cuenta.
        if (await _localAuth.passwordDue()) {
          _phase = AuthPhase.needsPassword;
        } else {
          _phase =
              mode == LockMode.bio ? AuthPhase.locked : AuthPhase.authenticated;
        }
      } else {
        await _askPasswordOrSignOut(mode);
      }
    } catch (_) {
      // Sin conexión tampoco echamos al usuario: si tiene bloqueo configurado
      // le pedimos su contraseña (podrá reintentar cuando haya red).
      await _askPasswordOrSignOut(mode);
    }
    notifyListeners();
  }

  /// No hay sesión utilizable. Si el usuario tiene bloqueo local configurado y
  /// lo recordamos, sólo pedimos la contraseña; si no, sesión cerrada.
  Future<void> _askPasswordOrSignOut(LockMode mode) async {
    _account = null;
    _activeChurchId = null;
    final user = await _localAuth.lastUser();
    _phase = (mode != LockMode.none && user != null)
        ? AuthPhase.needsPassword
        : AuthPhase.signedOut;
  }

  /// Tras login exitoso. Si el dispositivo tiene biometría disponible o el
  /// usuario ya configuró un PIN, queda autenticado de inmediato (acaba de
  /// pasar contraseña). El opt-in al re-login local lo configura aparte.
  Future<void> onLoginSuccess(AdminAccount account) async {
    _account = account;
    _selectDefaultChurch();
    await _localAuth.setLastUser(account.username);
    // Acaba de escribir su contraseña: reinicia el reloj del control periódico.
    await _localAuth.markPasswordVerified();
    _phase = AuthPhase.authenticated;
    notifyListeners();
  }

  /// Desbloqueo local. Tres desenlaces posibles ([UnlockOutcome]):
  ///   - Re-bloqueo por inactividad (ya teníamos [_account] y el jar en
  ///     memoria): volvemos a authenticated de inmediato.
  ///   - Arranque en frío con PIN ([_account] == null): derivamos la llave del
  ///     PIN, la fijamos en el cookie jar y validamos la sesión.
  ///       · Sesión ACTIVA → authenticated.
  ///       · Servidor accesible pero sesión inválida/expirada (o cookie que no
  ///         descifra) → re-login limpio conservando el PIN.
  ///       · Servidor inaccesible o con fallo transitorio → NO se destruye la
  ///         sesión; seguimos bloqueados para reintentar. `getSession` lanza en
  ///         error de red o 5xx, y devuelve UNAUTHENTICATED sólo en 401/403;
  ///         así "lanza" equivale a "no se pudo determinar" (reintentar).
  Future<UnlockOutcome> unlock({String? pin}) async {
    if (_account != null) {
      _phase = AuthPhase.authenticated;
      notifyListeners();
      return UnlockOutcome.authenticated;
    }

    if (pin == null) {
      await _requireFreshLogin();
      return UnlockOutcome.sessionEnded;
    }

    final key = await _localAuth.deriveCookieKey(pin);
    // key == null → PIN heredado sin sal: el jar sigue en claro (sin llave).
    if (key != null) {
      ApiClient.I.setCookieKey(key);
    }

    try {
      final session = await _auth.getSession();
      if (session.status == 'ACTIVE' && session.account != null) {
        _account = session.account;
        _selectDefaultChurch();
        // Ya tenemos la llave del PIN: si el usuario había elegido huella en
        // una versión anterior (y el PIN se quedó pegado), migramos ahora para
        // que a partir del próximo arranque entre con huella como pidió.
        if (await _localAuth.pendingBioMigration()) {
          await ApiClient.I.rekeyCookies(null);
          await _localAuth.clearPin();
          await _localAuth.setLockMode(LockMode.bio);
        }
        // El PIN fue correcto, pero puede tocar el control periódico.
        _phase = await _localAuth.passwordDue()
            ? AuthPhase.needsPassword
            : AuthPhase.authenticated;
        notifyListeners();
        return UnlockOutcome.authenticated;
      }
      // Servidor accesible pero la sesión ya no vale: NO se pierde el PIN ni la
      // configuración, sólo se pide la contraseña de la cuenta.
      await _requireFreshLogin();
      return UnlockOutcome.sessionEnded;
    } catch (_) {
      // Sin conexión: no destruimos la sesión, seguimos bloqueados. La fase no
      // cambia; el llamador muestra un aviso para reintentar.
      return UnlockOutcome.networkError;
    }
  }

  /// Limpia SÓLO las cookies (no el PIN ni el modo de bloqueo). Si sabemos
  /// quién es el usuario, basta con que confirme su contraseña; si no, sesión
  /// cerrada. Al re-loguear, las cookies se vuelven a guardar con la protección
  /// que tuviera configurada.
  Future<void> _requireFreshLogin() async {
    try {
      await _auth.logout();
    } catch (_) {
      /* logout local ya limpia cookies aunque el servidor falle */
    }
    await _askPasswordOrSignOut(await _localAuth.lockMode());
    notifyListeners();
  }

  Future<void> lock() async {
    if (_account == null) return;
    _phase = AuthPhase.locked;
    notifyListeners();
  }

  /// Bloqueo por inactividad: la app estuvo en segundo plano más del umbral
  /// (2 min) y al volver se exige re-autenticación LOCAL.
  ///   - Con PIN o huella configurados → pantalla de bloqueo.
  ///   - Sin ninguno → NO se hace nada: el usuario eligió expresamente no
  ///     proteger la app, así que cerrarle la sesión sería castigarlo por su
  ///     elección (además le forzaba a re-loguear y a reconfigurar el PIN en
  ///     cada regreso). La sesión sigue protegida por su TTL en el servidor y
  ///     todas sus acciones quedan en la auditoría.
  /// Sólo aplica si estábamos autenticados (no molesta en login/lock/loading).
  Future<void> lockForInactivity() async {
    if (_account == null || _phase != AuthPhase.authenticated) return;
    if (await _localAuth.lockMode() != LockMode.none) {
      _phase = AuthPhase.locked;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    await _auth.logout();
    await _localAuth.clearAll();
    _account = null;
    _activeChurchId = null;
    _phase = AuthPhase.signedOut;
    notifyListeners();
  }

  void _selectDefaultChurch() {
    final a = _account;
    if (a == null) return;
    if (a.churchAssignments.isNotEmpty) {
      _activeChurchId ??= a.churchAssignments.first.churchId;
    } else if (a.isRoot) {
      _activeChurchId = null; // ROOT puede ver todo
    }
  }
}
