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

  /// Listo: pantallas de la app son accesibles.
  authenticated,
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

  /// Llamado al arrancar la app — comprueba si hay cookies válidas.
  ///
  /// Si hay un PIN configurado, la cookie de sesión está cifrada en reposo con
  /// una llave derivada del PIN: no podemos validarla hasta desbloquear, así
  /// que vamos directo a la pantalla de bloqueo y la validación ocurre en
  /// [unlock]. Sin PIN, el jar está en claro y validamos como siempre.
  Future<void> bootstrap() async {
    _phase = AuthPhase.loading;
    notifyListeners();

    if (await _localAuth.hasPin()) {
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
        _phase = AuthPhase.authenticated;
      } else {
        _account = null;
        _activeChurchId = null;
        _phase = AuthPhase.signedOut;
      }
    } catch (_) {
      _account = null;
      _activeChurchId = null;
      _phase = AuthPhase.signedOut;
    }
    notifyListeners();
  }

  /// Tras login exitoso. Si el dispositivo tiene biometría disponible o el
  /// usuario ya configuró un PIN, queda autenticado de inmediato (acaba de
  /// pasar contraseña). El opt-in al re-login local lo configura aparte.
  Future<void> onLoginSuccess(AdminAccount account) async {
    _account = account;
    _selectDefaultChurch();
    await _localAuth.setLastUser(account.username);
    _phase = AuthPhase.authenticated;
    notifyListeners();
  }

  /// Desbloqueo local. Dos caminos:
  ///   - Re-bloqueo por inactividad (ya teníamos [_account] y el jar en
  ///     memoria): sólo volvemos a authenticated.
  ///   - Arranque en frío con PIN ([_account] == null): derivamos la llave del
  ///     PIN, la fijamos en el cookie jar y validamos la sesión. Si la sesión
  ///     no es válida (o la cookie no se puede descifrar) forzamos re-login
  ///     limpio, conservando el PIN.
  Future<void> unlock({String? pin}) async {
    if (_account != null) {
      _phase = AuthPhase.authenticated;
      notifyListeners();
      return;
    }

    if (pin == null) {
      await _requireFreshLogin();
      return;
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
        _phase = AuthPhase.authenticated;
        notifyListeners();
      } else {
        await _requireFreshLogin();
      }
    } catch (_) {
      await _requireFreshLogin();
    }
  }

  /// Limpia SÓLO las cookies (no el PIN) y exige iniciar sesión de nuevo. Al
  /// re-loguear, las cookies se re-guardan cifradas con la llave del PIN.
  Future<void> _requireFreshLogin() async {
    try {
      await _auth.logout();
    } catch (_) {
      /* logout local ya limpia cookies aunque el servidor falle */
    }
    _account = null;
    _activeChurchId = null;
    _phase = AuthPhase.signedOut;
    notifyListeners();
  }

  Future<void> lock() async {
    if (_account == null) return;
    _phase = AuthPhase.locked;
    notifyListeners();
  }

  /// Bloqueo por inactividad: la app estuvo en segundo plano más del umbral
  /// (2 min) y al volver se exige re-autenticación LOCAL (no re-invitación).
  ///   - Con PIN o biometría configurados → pantalla de bloqueo.
  ///   - Sin ninguno → cierra sesión y obliga a re-loguear con credenciales.
  /// Sólo aplica si estábamos autenticados (no molesta en login/lock/loading).
  Future<void> lockForInactivity() async {
    if (_account == null || _phase != AuthPhase.authenticated) return;
    final pinSet = await _localAuth.hasPin();
    final bioEnabled = await _localAuth.isBiometricEnabled();
    if (pinSet || bioEnabled) {
      _phase = AuthPhase.locked;
      notifyListeners();
    } else {
      await signOut();
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
