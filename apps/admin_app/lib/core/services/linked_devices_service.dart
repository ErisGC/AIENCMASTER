import '../api/api_client.dart';
import '../models/domain.dart';

/// Sesiones y dispositivos vinculados de la propia cuenta.
///
/// La app del teléfono es la llave: aprueba los ingresos web de su cuenta
/// eligiendo el número que muestra la web, y desde aquí se ven, nombran,
/// pausan, cierran o quitan las sesiones.
class LinkedDevicesService {
  LinkedDevicesService(this._api);
  final ApiClient _api;

  static const _base = '/admin/me/devices';

  Future<LinkedOverview> overview() async {
    final data = await _api.getJson<Map<String, dynamic>>(_base);
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> approve(String requestId, String code) async {
    final data = await _api.postJson<Map<String, dynamic>>(
      '$_base/requests/$requestId/approve',
      body: {'code': code},
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> reject(String requestId) async {
    final data = await _api.postJson<Map<String, dynamic>>(
      '$_base/requests/$requestId/reject',
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> rename(String deviceId, String name) async {
    final data = await _api.patchJson<Map<String, dynamic>>(
      '$_base/$deviceId',
      body: {'name': name},
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> pause(String deviceId) async {
    final data = await _api.postJson<Map<String, dynamic>>(
      '$_base/$deviceId/pause',
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> resume(String deviceId) async {
    final data = await _api.postJson<Map<String, dynamic>>(
      '$_base/$deviceId/resume',
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> signOut(String deviceId) async {
    final data = await _api.postJson<Map<String, dynamic>>(
      '$_base/$deviceId/sign-out',
    );
    return LinkedOverview.fromJson(data);
  }

  Future<LinkedOverview> remove(String deviceId) async {
    final data = await _api.deleteJson<Map<String, dynamic>>(
      '$_base/$deviceId',
    );
    return LinkedOverview.fromJson(data);
  }

  // ── Respaldo de la cuenta principal: solicitudes de cualquier cuenta ──

  Future<List<PanelAccessRequest>> panelRequests() {
    return _api.getList(
      '/admin/security/access-requests',
      PanelAccessRequest.fromJson,
    );
  }

  Future<void> panelApprove(String requestId) async {
    await _api.postJson<Map<String, dynamic>>(
      '/admin/security/access-requests/$requestId/approve',
      body: const <String, dynamic>{},
    );
  }

  Future<void> panelReject(String requestId) async {
    await _api.postJson<Map<String, dynamic>>(
      '/admin/security/access-requests/$requestId/reject',
      body: const <String, dynamic>{},
    );
  }
}
