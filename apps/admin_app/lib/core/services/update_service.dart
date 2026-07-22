import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Resultado de un chequeo de actualización.
class UpdateInfo {
  final bool hasUpdate;
  final String currentVersion;
  final String latestVersion;
  final String apkUrl;

  const UpdateInfo({
    required this.hasUpdate,
    required this.currentVersion,
    required this.latestVersion,
    required this.apkUrl,
  });
}

/// Comprueba si hay una versión más nueva del APK publicada en GitHub
/// Releases y, de haberla, expone la URL de descarga directa.
///
/// No depende del backend: consulta el "latest release" público del repo.
/// La instalación final la confirma el usuario (Android lo exige para apps
/// fuera de Play Store).
class UpdateService {
  UpdateService({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  static const _latestApiUrl =
      'https://api.github.com/repos/ErisGC/AIENCMASTER/releases/latest';
  static const apkUrl =
      'https://github.com/ErisGC/AIENCMASTER/releases/latest/download/aienc-admin.apk';

  Future<UpdateInfo?> check() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final current = info.version; // p.ej. "0.1.3"

      final res = await _dio.get<Map<String, dynamic>>(
        _latestApiUrl,
        options: Options(
          responseType: ResponseType.json,
          headers: {
            'Accept': 'application/vnd.github+json',
            // GitHub RECHAZA (403) cualquier petición sin User-Agent. No basta
            // con el default implícito del cliente HTTP; lo fijamos explícito.
            'User-Agent': 'AIENC-Admin-App',
          },
          // No fallar si GitHub responde 4xx; lo tratamos como "sin update".
          validateStatus: (s) => s != null && s < 500,
        ),
      );

      final data = res.data;
      if (data == null) return null;

      // tag_name viene como "admin-app-v0.1.3" -> extraemos "0.1.3".
      final tag = (data['tag_name'] as String?) ?? '';
      final latest = _extractVersion(tag);
      if (latest.isEmpty) return null;

      return UpdateInfo(
        hasUpdate: _isNewer(latest, current),
        currentVersion: current,
        latestVersion: latest,
        apkUrl: apkUrl,
      );
    } catch (_) {
      // Sin conexión / rate limit / formato inesperado: silencioso.
      return null;
    }
  }

  String _extractVersion(String tag) {
    final m = RegExp(r'(\d+)\.(\d+)\.(\d+)').firstMatch(tag);
    return m?.group(0) ?? '';
  }

  /// Compara "x.y.z" semánticamente. true si [a] es mayor que [b].
  bool _isNewer(String a, String b) {
    final pa = _parts(a);
    final pb = _parts(b);
    for (var i = 0; i < 3; i++) {
      if (pa[i] != pb[i]) return pa[i] > pb[i];
    }
    return false;
  }

  List<int> _parts(String v) {
    final nums = v.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    while (nums.length < 3) {
      nums.add(0);
    }
    return nums.sublist(0, 3);
  }
}
