import 'dart:io';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Identifica este dispositivo de forma estable a través de la vida del app.
///
/// El backend exige `deviceId`, `deviceName`, `platform` y `browser` en
/// `/admin/auth/login`. Si no los enviamos, el DTO devuelve 400 y el admin
/// queda bloqueado. Si el `deviceId` cambia entre instalaciones (por
/// ejemplo al reinstalar la app), el backend lo trata como un dispositivo
/// nuevo y vuelve a exigir aprobación del ROOT — eso está bien y es lo
/// esperado en mobile.
///
/// El deviceId se persiste en `shared_preferences`. Cuando el admin
/// desinstale la app, se pierde y queda un device "huérfano" en el backend
/// (sin riesgo porque no tiene sesión activa). Si reinstala, se genera uno
/// nuevo y el ROOT debe re-aprobar.
class DeviceIdentityService {
  DeviceIdentityService();

  static const _kDeviceId = 'aienc-admin-device-id';
  static const _kDeviceName = 'aienc-admin-device-name';

  String? _cachedId;
  String? _cachedName;
  String? _cachedModel;

  Future<String> getDeviceId() async {
    final cached = _cachedId;
    if (cached != null) return cached;

    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_kDeviceId);
    if (stored != null && stored.isNotEmpty) {
      _cachedId = stored;
      return stored;
    }

    final generated = _randomHex(24);
    await prefs.setString(_kDeviceId, generated);
    _cachedId = generated;
    return generated;
  }

  /// Devuelve un nombre legible que el ROOT verá al aprobar el acceso.
  /// Ejemplo: "Samsung Galaxy S21" o "Xiaomi Redmi Note 12". El usuario
  /// puede haber escogido un nombre custom alguna vez.
  Future<String> getDeviceName() async {
    final cached = _cachedName;
    if (cached != null) return cached;

    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_kDeviceName);
    if (stored != null && stored.trim().isNotEmpty) {
      _cachedName = stored;
      return stored;
    }

    final autoName = await _autoDeviceName();
    _cachedName = autoName;
    return autoName;
  }

  /// Permite al usuario sobreescribir el nombre del dispositivo
  /// (útil para "El celular de mi esposa" cuando comparten teléfono).
  Future<void> setDeviceName(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kDeviceName, trimmed);
    _cachedName = trimmed;
  }

  /// Plataforma cruda: 'Android', 'iOS', 'Windows', etc.
  String getPlatform() {
    if (Platform.isAndroid) return 'Android';
    if (Platform.isIOS) return 'iOS';
    if (Platform.isLinux) return 'Linux';
    if (Platform.isMacOS) return 'macOS';
    if (Platform.isWindows) return 'Windows';
    return 'Unknown';
  }

  /// El backend pide un campo "browser" pero en mobile no hay browser;
  /// usamos "AIENC Admin app" para que el ROOT vea claramente que vino
  /// de la app nativa, no de un navegador.
  String getBrowserOrApp() => 'AIENC Admin app';

  /// Modelo de dispositivo + marca (cacheado tras la primera lectura).
  Future<String> _autoDeviceName() async {
    final model = await _readModel();
    if (model.isNotEmpty) return model;
    // Fallback genérico si la API nativa falla.
    if (Platform.isAndroid) return 'Teléfono Android';
    if (Platform.isIOS) return 'iPhone / iPad';
    return getPlatform();
  }

  Future<String> _readModel() async {
    final cached = _cachedModel;
    if (cached != null) return cached;
    try {
      final info = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final a = await info.androidInfo;
        final manufacturer = a.manufacturer.trim();
        final model = a.model.trim();
        if (manufacturer.isEmpty ||
            model.toLowerCase().contains(manufacturer.toLowerCase())) {
          _cachedModel = model;
        } else {
          _cachedModel = '$manufacturer $model'.trim();
        }
      } else if (Platform.isIOS) {
        final i = await info.iosInfo;
        _cachedModel = i.utsname.machine;
      } else {
        _cachedModel = '';
      }
    } on PlatformException {
      _cachedModel = '';
    } catch (_) {
      _cachedModel = '';
    }
    return _cachedModel ?? '';
  }

  /// Identidad de este teléfono para esa cuenta. Un teléfono puede usarlo
  /// más de una cuenta (quien prueba una invitación en el suyo, por ejemplo)
  /// y el servidor ata cada identidad a una sola: la primera cuenta conserva
  /// la de siempre y las demás reciben una propia, guardada aparte.
  Future<String> getDeviceIdFor(String username) async {
    final prefs = await SharedPreferences.getInstance();
    final propia = prefs.getString(_accountKey(username));
    if (propia != null && propia.isNotEmpty) return propia;
    return getDeviceId();
  }

  /// Crea y guarda una identidad propia de esa cuenta en este teléfono.
  Future<String> newDeviceIdFor(String username) async {
    final prefs = await SharedPreferences.getInstance();
    final id = _randomHex(24);
    await prefs.setString(_accountKey(username), id);
    return id;
  }

  String _accountKey(String username) =>
      '$_kDeviceId@${username.trim().toLowerCase()}';

  /// Limpia el deviceId persistido. Sólo se usa en flujos de "olvidar este
  /// dispositivo" — el caso típico es nunca llamarlo. Conserva el deviceName
  /// como conveniencia para mostrar al usuario en futuros logins.
  Future<void> clearDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kDeviceId);
    _cachedId = null;
  }

  String _randomHex(int byteCount) {
    final rand = Random.secure();
    final bytes = List<int>.generate(byteCount, (_) => rand.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
