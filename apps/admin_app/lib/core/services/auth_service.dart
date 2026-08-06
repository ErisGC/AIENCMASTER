import '../api/api_client.dart';
import '../models/domain.dart';
import 'device_identity_service.dart';

/// Endpoints de autenticación que la app necesita.
/// Espejo de apps/web/app/lib/admin-auth.ts y admin-invitations.ts.
class AuthService {
  AuthService(this._api, this._device);
  final ApiClient _api;
  final DeviceIdentityService _device;

  Future<SessionResponse> getSession() async {
    final res = await _api.dio.get('/admin/auth/session');
    final code = res.statusCode ?? 0;
    if (code == 200) {
      return SessionResponse.fromJson(res.data as Map<String, dynamic>);
    }
    // 401/403 → definitivamente sin sesión válida.
    if (code == 401 || code == 403) {
      return SessionResponse(status: 'UNAUTHENTICATED', account: null);
    }
    // 5xx u otros: el servidor responde pero con problemas. Lo tratamos como
    // error transitorio (lanza) en vez de "sin sesión", para no cerrar la
    // sesión del usuario por un blip del backend. El llamador (bootstrap /
    // unlock) decide: bootstrap cae a signedOut; unlock se mantiene bloqueado.
    throw ApiException(code, 'Servicio no disponible temporalmente.');
  }

  /// Login con todos los campos que el backend requiere.
  ///
  /// El backend usa `deviceId` como identidad estable del dispositivo. La
  /// primera vez que un admin se loguea desde un teléfono nuevo, este
  /// método dispara la creación de una solicitud de acceso PENDING que el
  /// ROOT debe aprobar desde su panel. Logins subsecuentes desde el mismo
  /// teléfono (mismo `deviceId`) entran como ACTIVE sin más fricción.
  Future<SessionResponse> login({
    required String username,
    required String password,
  }) async {
    final deviceId = await _device.getDeviceId();
    final deviceName = await _device.getDeviceName();
    final platform = _device.getPlatform();
    final browser = _device.getBrowserOrApp();

    final data = await _api.postJson<Map<String, dynamic>>(
      '/admin/auth/login',
      body: {
        'username': username,
        'password': password,
        'deviceId': deviceId,
        'deviceName': deviceName,
        'platform': platform,
        'browser': browser,
      },
    );
    return SessionResponse.fromJson(data);
  }

  Future<void> logout() async {
    try {
      await _api.postJson<dynamic>('/admin/auth/logout');
    } catch (_) {
      // Cerrar sesión en el dispositivo no puede depender de que el servidor
      // responda: si falla, igual limpiamos las cookies locales.
    } finally {
      await _api.clearCookies();
    }
  }

  /// Consulta los datos de una invitación antes de aceptarla.
  ///
  /// Usa `getJson`, que LANZA si la respuesta no es 2xx. Antes se leía
  /// `res.data` directamente y, como el cliente no falla ante un 4xx, el
  /// cuerpo del error ("Invitación inválida", 404) se interpretaba como una
  /// invitación sin campo `status` — y el modelo asumía EXPIRED. Resultado:
  /// a un token incorrecto o incompleto se le respondía "esta invitación
  /// expiró", que es falso y desorienta.
  Future<InvitationPreview> previewInvitation(String token) async {
    final data = await _api.getJson<Map<String, dynamic>>(
      '/admin/auth/invitations/preview',
      query: {'token': token.trim()},
    );
    return InvitationPreview.fromJson(data);
  }

  Future<Map<String, dynamic>> acceptInvitation(
    String token,
    String password,
  ) async {
    return _api.postJson<Map<String, dynamic>>(
      '/admin/auth/invitations/accept',
      body: {'token': token, 'password': password},
    );
  }
}
