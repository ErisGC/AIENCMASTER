import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../models/domain.dart';

/// Iglesias
class ChurchService {
  ChurchService(this._api);
  final ApiClient _api;

  Future<List<Church>> list() async {
    return _api.getList('/admin/churches', Church.fromJson);
  }

  Future<Church> get(String id) async {
    final res = await _api.dio.get('/admin/churches/$id');
    _api.ensureOk(res);
    return Church.fromJson(res.data as Map<String, dynamic>);
  }

  /// El endpoint PATCH de iglesias en el backend procesa `req.parts()` —
  /// debemos enviar multipart/form-data. Soporta:
  ///   - Campos de texto (name, city, address, avgAttendance)
  ///   - Estado activa (isActive)
  ///   - Ubicación (mapsLat, mapsLng, mapsUrl) — strings vacíos = quitar
  ///   - Imágenes (mainImage, coverImage) como MultipartFile
  Future<Church> update(
    String id, {
    String? name,
    String? city,
    String? address,
    int? avgAttendance,
    bool? isActive,
    double? mapsLat,
    double? mapsLng,
    String? mapsUrl,
    bool clearLocation = false,
    MultipartFile? mainImage,
    MultipartFile? coverImage,
  }) async {
    final fields = <String, dynamic>{};
    if (name != null) fields['name'] = name.trim();
    if (city != null) fields['city'] = city.trim();
    if (address != null) fields['address'] = address.trim();
    if (avgAttendance != null) {
      fields['avgAttendance'] = avgAttendance.toString();
    }
    if (isActive != null) fields['isActive'] = isActive ? 'true' : 'false';

    if (clearLocation) {
      fields['mapsLat'] = '';
      fields['mapsLng'] = '';
      fields['mapsUrl'] = '';
    } else if (mapsLat != null && mapsLng != null) {
      fields['mapsLat'] = mapsLat.toString();
      fields['mapsLng'] = mapsLng.toString();
      fields['mapsUrl'] =
          mapsUrl ?? 'https://www.google.com/maps?q=$mapsLat,$mapsLng';
    }

    if (mainImage != null) fields['mainImage'] = mainImage;
    if (coverImage != null) fields['coverImage'] = coverImage;

    final form = FormData.fromMap(fields);
    final res = await _api.dio.patch(
      '/admin/churches/$id',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return Church.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Church> toggleActive(String id) async {
    final res = await _api.dio.patch('/admin/churches/$id/toggle');
    _api.ensureOk(res);
    return Church.fromJson(res.data as Map<String, dynamic>);
  }
}

/// Anuncios — globales y por iglesia.
class AnnouncementService {
  AnnouncementService(this._api);
  final ApiClient _api;

  Future<List<Announcement>> listGlobal() async {
    return _api.getList('/admin/announcements', Announcement.fromJson);
  }

  Future<List<Announcement>> listForChurch(String churchId) async {
    return _api.getList(
      '/admin/churches/$churchId/announcements',
      Announcement.fromJson,
    );
  }

  /// Crear anuncio global (sólo ROOT con MANAGE_GLOBAL_ANNOUNCEMENTS).
  /// El backend acepta multipart/form-data con campo `attachments` repetido
  /// (uno por archivo). Si `attachments` viene vacío, se crea sin adjuntos.
  Future<Announcement> createGlobal({
    required String title,
    required String description,
    required String author,
    List<MultipartFile> attachments = const [],
  }) async {
    final form = FormData.fromMap({
      'title': title.trim(),
      'description': description.trim(),
      'author': author.trim(),
      if (attachments.isNotEmpty)
        'attachments': attachments, // dio expande la lista a múltiples partes
    });
    final res = await _api.dio.post(
      '/admin/announcements',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return Announcement.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Announcement> updateGlobal(
    String id, {
    required String title,
    required String description,
    required String author,
  }) async {
    final data = await _api.patchJson<Map<String, dynamic>>(
      '/admin/announcements/$id',
      body: {
        'title': title.trim(),
        'description': description.trim(),
        'author': author.trim(),
      },
    );
    return Announcement.fromJson(data);
  }

  Future<void> deleteGlobal(String id) async {
    await _api.deleteVoid('/admin/announcements/$id');
  }

  Future<Announcement> createForChurch({
    required String churchId,
    required String title,
    required String description,
    required String author,
    List<MultipartFile> attachments = const [],
  }) async {
    final form = FormData.fromMap({
      'title': title.trim(),
      'description': description.trim(),
      'author': author.trim(),
      if (attachments.isNotEmpty) 'attachments': attachments,
    });
    final res = await _api.dio.post(
      '/admin/churches/$churchId/announcements',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return Announcement.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Announcement> updateForChurch({
    required String churchId,
    required String id,
    required String title,
    required String description,
    required String author,
  }) async {
    final data = await _api.patchJson<Map<String, dynamic>>(
      '/admin/churches/$churchId/announcements/$id',
      body: {
        'title': title.trim(),
        'description': description.trim(),
        'author': author.trim(),
      },
    );
    return Announcement.fromJson(data);
  }

  Future<void> deleteFromChurch(String churchId, String id) async {
    await _api.deleteVoid('/admin/churches/$churchId/announcements/$id');
  }
}

/// Representantes / directores de una iglesia.
class DirectorService {
  DirectorService(this._api);
  final ApiClient _api;

  Future<List<ChurchDirector>> list(String churchId) async {
    return _api.getList(
      '/admin/churches/$churchId/directors',
      ChurchDirector.fromJson,
    );
  }

  Future<ChurchDirector> create(
    String churchId, {
    required String displayName,
    String role = '',
    String phone = '',
    String email = '',
    MultipartFile? photo,
  }) async {
    final form = FormData.fromMap({
      'displayName': displayName.trim(),
      if (role.trim().isNotEmpty) 'role': role.trim(),
      if (phone.trim().isNotEmpty) 'phone': phone.trim(),
      if (email.trim().isNotEmpty) 'email': email.trim(),
      if (photo != null) 'photo': photo,
    });
    final res = await _api.dio.post(
      '/admin/churches/$churchId/directors',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return ChurchDirector.fromJson(res.data as Map<String, dynamic>);
  }

  Future<ChurchDirector> update(
    String id, {
    required String displayName,
    String role = '',
    String phone = '',
    String email = '',
    MultipartFile? photo,
  }) async {
    final form = FormData.fromMap({
      'displayName': displayName.trim(),
      'role': role.trim(),
      // Se envían siempre (aunque vacíos) para permitir limpiar el campo.
      'phone': phone.trim(),
      'email': email.trim(),
      if (photo != null) 'photo': photo,
    });
    final res = await _api.dio.patch(
      '/admin/directors/$id',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return ChurchDirector.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _api.deleteVoid('/admin/directors/$id');
  }
}

/// Estudios / mensajes en audio de una iglesia.
class StudyService {
  StudyService(this._api);
  final ApiClient _api;

  Future<List<ChurchStudy>> list(String churchId) async {
    return _api.getList(
      '/admin/churches/$churchId/studies',
      ChurchStudy.fromJson,
    );
  }

  Future<ChurchStudy> create(
    String churchId, {
    required String teacherName,
    required String topic,
    String outline = '',
    required MultipartFile audio,
  }) async {
    final form = FormData.fromMap({
      'teacherName': teacherName.trim(),
      'topic': topic.trim(),
      if (outline.trim().isNotEmpty) 'outline': outline.trim(),
      'audio': audio,
    });
    final res = await _api.dio.post(
      '/admin/churches/$churchId/studies',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return ChurchStudy.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> delete(String churchId, String id) async {
    await _api.deleteVoid('/admin/churches/$churchId/studies/$id');
  }
}

/// Reportes
class ReportService {
  ReportService(this._api);
  final ApiClient _api;

  Future<ReportListResponse> list({
    String? churchId,
    ReportType? type,
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final query = <String, dynamic>{};
    if (churchId != null && churchId.isNotEmpty) query['churchId'] = churchId;
    if (type != null) query['reportType'] = type.name;
    if (fromDate != null) {
      query['fromDate'] = fromDate.toIso8601String().substring(0, 10);
    }
    if (toDate != null) {
      query['toDate'] = toDate.toIso8601String().substring(0, 10);
    }
    final res = await _api.dio.get('/admin/reports', queryParameters: query);
    _api.ensureOk(res);
    return ReportListResponse.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Report> create({
    required String churchId,
    required ReportType type,
    required String title,
    String? notes,
    required DateTime periodStart,
    required DateTime periodEnd,
    required Map<String, dynamic> data,
  }) async {
    final body = {
      'churchId': churchId,
      'reportType': type.name,
      'title': title,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      'periodStart': periodStart.toIso8601String(),
      'periodEnd': periodEnd.toIso8601String(),
      'data': data,
    };
    final res = await _api.postJson<Map<String, dynamic>>(
      '/admin/reports',
      body: body,
    );
    return Report.fromJson(res);
  }

  Future<MetricsTimeline> metrics({
    String? churchId,
    DateTime? fromDate,
    DateTime? toDate,
  }) async {
    final q = <String, dynamic>{};
    if (churchId != null && churchId.isNotEmpty) q['churchId'] = churchId;
    if (fromDate != null) {
      q['fromDate'] = fromDate.toIso8601String().substring(0, 10);
    }
    if (toDate != null) {
      q['toDate'] = toDate.toIso8601String().substring(0, 10);
    }
    final res = await _api.dio.get(
      '/admin/reports/metrics/timeline',
      queryParameters: q,
    );
    return MetricsTimeline.fromJson(res.data as Map<String, dynamic>);
  }
}

/// Catálogo de permisos / gestión de cuentas (solo ROOT)
class SecurityService {
  SecurityService(this._api);
  final ApiClient _api;

  Future<PermissionsCatalog> catalog() async {
    final res = await _api.dio.get('/admin/security/permissions/catalog');
    _api.ensureOk(res);
    return PermissionsCatalog.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<AdminAccount>> listAccounts() async {
    return _api.getList('/admin/security/accounts', AdminAccount.fromJson);
  }

  Future<AccountHistoryResponse> accountHistory(String id) async {
    final res = await _api.dio.get('/admin/security/accounts/$id/history');
    _api.ensureOk(res);
    return AccountHistoryResponse.fromJson(res.data as Map<String, dynamic>);
  }

  /// Registro de auditoría GLOBAL (todas las acciones del sistema).
  Future<List<AuditLogEntry>> auditLogs() async {
    return _api.getList('/admin/security/audit-logs', AuditLogEntry.fromJson);
  }

  /// Actualiza los permisos globales de una cuenta no-ROOT.
  Future<void> updateGlobalPermissions(
    String accountId,
    List<GlobalPermission> permissions,
  ) async {
    await _api.patchJson<Map<String, dynamic>>(
      '/admin/security/accounts/$accountId/permissions',
      body: {'globalPermissions': permissions.map((e) => e.name).toList()},
    );
  }

  /// Asigna una iglesia con un set inicial de permisos.
  Future<void> assignChurch(
    String accountId, {
    required String churchId,
    required List<ChurchPermission> permissions,
  }) async {
    await _api.postJson<Map<String, dynamic>>(
      '/admin/security/accounts/$accountId/churches',
      body: {
        'churchId': churchId,
        'permissions': permissions.map((e) => e.name).toList(),
      },
    );
  }

  /// Cambia los permisos sobre una iglesia ya asignada.
  Future<void> updateChurchPermissions(
    String accountId, {
    required String churchId,
    required List<ChurchPermission> permissions,
  }) async {
    await _api.patchJson<Map<String, dynamic>>(
      '/admin/security/accounts/$accountId/churches/$churchId/permissions',
      body: {'permissions': permissions.map((e) => e.name).toList()},
    );
  }

  /// Quita la asignación de una iglesia.
  Future<void> removeChurchAssignment(
    String accountId, {
    required String churchId,
  }) async {
    await _api.postJson<Map<String, dynamic>>(
      '/admin/security/accounts/$accountId/churches/$churchId/remove',
    );
  }
}

/// Invitaciones (solo ROOT).
class InvitationService {
  InvitationService(this._api);
  final ApiClient _api;

  Future<List<AdminInvitation>> list() async {
    return _api.getList(
      '/admin/security/invitations',
      AdminInvitation.fromJson,
    );
  }

  /// Crea una invitación para una nueva cuenta administrativa.
  ///
  /// Para invitaciones ADMIN se requiere `assignedChurchId`. Para
  /// invitaciones ROOT (`targetRole = 'ROOT'`) la iglesia y los permisos
  /// se ignoran; el backend valida que el actor también sea ROOT.
  Future<CreatedInvitation> create({
    required String username,
    required String displayName,
    String? assignedChurchId,
    String targetRole = 'ADMIN',
    List<ChurchPermission> churchPermissions = const [],
    List<GlobalPermission> globalPermissions = const [],
  }) async {
    final body = <String, dynamic>{
      'username': username.trim(),
      'displayName': displayName.trim(),
      'targetRole': targetRole,
    };
    if (targetRole == 'ADMIN') {
      if (assignedChurchId == null) {
        throw ArgumentError(
          'assignedChurchId es obligatorio para invitaciones ADMIN',
        );
      }
      body['assignedChurchId'] = assignedChurchId;
      body['churchPermissions'] = churchPermissions.map((e) => e.name).toList();
      if (globalPermissions.isNotEmpty) {
        body['globalPermissions'] = globalPermissions
            .map((e) => e.name)
            .toList();
      }
    }
    final res = await _api.postJson<Map<String, dynamic>>(
      '/admin/security/invitations',
      body: body,
    );
    return CreatedInvitation.fromJson(res);
  }

  Future<void> revoke(String id) async {
    await _api.deleteVoid('/admin/security/invitations/$id');
  }
}

/// Canal de soporte con el administrador principal.
class SupportService {
  SupportService(this._api);
  final ApiClient _api;

  /// Hilos propios del administrador autenticado.
  Future<List<SupportConversation>> mine() async {
    return _api.getList(
      '/admin/support/conversations',
      SupportConversation.fromJson,
    );
  }

  /// Bandeja completa (sólo administrador principal).
  Future<List<SupportConversation>> inbox() async {
    return _api.getList('/admin/support/inbox', SupportConversation.fromJson);
  }

  /// Número de hilos con mensajes sin leer (para el aviso).
  Future<int> unread() async {
    final res = await _api.dio.get('/admin/support/inbox/unread');
    _api.ensureOk(res);
    final data = res.data;
    if (data is Map && data['unread'] is num) {
      return (data['unread'] as num).toInt();
    }
    return 0;
  }

  Future<SupportThread> thread(String id, {required bool asRoot}) async {
    final path = asRoot
        ? '/admin/support/inbox/$id'
        : '/admin/support/conversations/$id';
    final res = await _api.dio.get(path);
    _api.ensureOk(res);
    return SupportThread.fromJson(res.data as Map<String, dynamic>);
  }

  Future<SupportConversation> start({
    required String subject,
    required String body,
    List<MultipartFile> files = const [],
  }) async {
    final form = FormData.fromMap({
      'subject': subject.trim(),
      'body': body.trim(),
      if (files.isNotEmpty) 'files': files,
    });
    final res = await _api.dio.post(
      '/admin/support/conversations',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return SupportConversation.fromJson(res.data as Map<String, dynamic>);
  }

  Future<SupportMessage> reply(
    String id, {
    required String body,
    required bool asRoot,
    List<MultipartFile> files = const [],
  }) async {
    final form = FormData.fromMap({
      'body': body.trim(),
      if (files.isNotEmpty) 'files': files,
    });
    final path = asRoot
        ? '/admin/support/inbox/$id/messages'
        : '/admin/support/conversations/$id/messages';
    final res = await _api.dio.post(
      path,
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    _api.ensureOk(res);
    return SupportMessage.fromJson(res.data as Map<String, dynamic>);
  }
}
