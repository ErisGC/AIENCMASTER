import 'dart:convert';
import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import '../config/app_config.dart';
import '../security/cookie_crypto.dart';

/// Contenedor mutable del estado de cifrado del cookie jar. Los pre-handlers
/// del FileStorage lo leen en cada lectura/escritura, de modo que la llave se
/// puede fijar DESPUÉS de crear el jar (al desbloquear con PIN) sin recrearlo.
///   - `key != null`         → cookies cifradas AES-256-GCM con esa llave.
///   - `key == null && !sealed` → cookies en claro (sin PIN configurado).
///   - `key == null && sealed`  → store cifrado pero aún BLOQUEADO (hay PIN y
///     todavía no se desbloquea). En este estado NO debemos interpretar los
///     bytes cifrados como texto plano: devolvemos null (ausente) para no
///     corromper el índice del jar. En la práctica no se leen cookies en este
///     estado, pero el flag lo garantiza ante cualquier acceso inesperado.
class _CookieKeyHolder {
  List<int>? key;
  bool sealed = false;
}

/// Wrapper sobre Dio con:
///   - cookie jar persistente en disco (las cookies HttpOnly admin_session
///     y admin_device sobreviven a reinicios de la app).
///   - header Origin obligatorio para pasar AdminOriginGuard.
///   - timeouts razonables y mapping uniforme de errores.
///
/// Una sola instancia singleton se crea en [ApiClient.init] al arrancar.
class ApiClient {
  ApiClient._(this._dio);

  static ApiClient? _instance;
  static ApiClient get I {
    final v = _instance;
    if (v == null) {
      throw StateError('ApiClient.init() no ha sido llamado todavía');
    }
    return v;
  }

  final Dio _dio;
  Dio get dio => _dio;

  static Future<void> init() async {
    if (_instance != null) return;

    final cookiesDir = await _cookieDir();
    final holder = _CookieKeyHolder();

    // Cifrado transparente del cookie jar en reposo. Reutilizamos el
    // FileStorage probado e inyectamos cifrado/descifrado por sus pre-handlers.
    // Con la llave en null (sin PIN) se comporta como texto plano, idéntico al
    // comportamiento anterior.
    final storage = FileStorage(cookiesDir)
      ..writePreHandler = (String value) {
        final key = holder.key;
        if (key == null) return utf8.encode(value);
        return CookieCrypto.encryptString(value, key);
      }
      ..readPreHandler = (bytes) {
        final key = holder.key;
        if (key != null) {
          // Descifrado fallido → null → el jar lo trata como "sin cookie".
          return CookieCrypto.decryptToString(bytes, key);
        }
        // Sin llave y store cifrado-pero-bloqueado: no interpretar como texto
        // plano (serían bytes cifrados → basura → corromperían el índice).
        if (holder.sealed) return null;
        // Sin PIN: cookies en claro.
        return utf8.decode(bytes, allowMalformed: true);
      };

    final jar = PersistCookieJar(
      ignoreExpires: false,
      storage: storage,
    );

    final dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      sendTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
      headers: <String, dynamic>{
        HttpHeaders.acceptHeader: 'application/json',
        HttpHeaders.contentTypeHeader: 'application/json',
        // Origin que el AdminOriginGuard espera para mutaciones.
        'Origin': AppConfig.mobileOrigin,
        HttpHeaders.userAgentHeader: AppConfig.userAgentTag,
      },
      validateStatus: (s) => s != null && s >= 200 && s < 600,
    ));

    dio.interceptors.add(CookieManager(jar));
    dio.interceptors.add(_ErrorMappingInterceptor());

    _instance = ApiClient._(dio);
    _instance!._jar = jar;
    _instance!._keyHolder = holder;
    _instance!._cookiesDir = cookiesDir;
  }

  late final PersistCookieJar _jar;
  late final _CookieKeyHolder _keyHolder;
  late final String _cookiesDir;

  /// Marca el store como cifrado-pero-bloqueado: hay un PIN configurado y aún
  /// no se ha desbloqueado. Se llama en el arranque (bootstrap) antes de que
  /// cualquier lectura del jar pueda interpretar bytes cifrados como texto
  /// plano. La llave se fija luego con [setCookieKey] al desbloquear.
  void markCookiesSealed() {
    _keyHolder.sealed = true;
  }

  /// Fija la llave de descifrado del cookie jar (al desbloquear con PIN).
  /// Debe llamarse ANTES de la primera petición que use cookies.
  void setCookieKey(List<int> key) {
    _keyHolder.key = key;
  }

  /// Re-cifra en disco todas las cookies existentes de la llave actual a
  /// [newKey] y adopta [newKey]. Se usa al configurar el PIN por primera vez
  /// (de texto plano a cifrado) sin perder la sesión activa.
  Future<void> rekeyCookies(List<int> newKey) async {
    final oldKey = _keyHolder.key; // null = texto plano actual
    final dir = Directory(_cookiesDir);
    if (dir.existsSync()) {
      for (final entity in dir.listSync(recursive: true)) {
        if (entity is! File) continue;
        try {
          final bytes = await entity.readAsBytes();
          if (bytes.isEmpty) continue;
          final String? plain = oldKey == null
              ? utf8.decode(bytes, allowMalformed: true)
              : CookieCrypto.decryptToString(bytes, oldKey);
          if (plain == null) continue; // ilegible: se deja como está
          await entity.writeAsBytes(CookieCrypto.encryptString(plain, newKey));
        } catch (_) {
          // Un archivo problemático no debe abortar el re-cifrado del resto.
        }
      }
    }
    _keyHolder.key = newKey;
  }

  /// Borra todas las cookies persistentes (logout local).
  Future<void> clearCookies() async {
    await _jar.deleteAll();
  }

  static Future<String> _cookieDir() async {
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}/aienc_cookies');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir.path;
  }

  /// Helper GET tipado.
  Future<T> getJson<T>(String path, {Map<String, dynamic>? query}) async {
    final res =
        await _dio.get(path, queryParameters: query);
    _ensureOk(res);
    return res.data as T;
  }

  /// Helper POST tipado.
  Future<T> postJson<T>(String path, {Object? body}) async {
    final res = await _dio.post(path, data: body);
    _ensureOk(res);
    return res.data as T;
  }

  Future<T> patchJson<T>(String path, {Object? body}) async {
    final res = await _dio.patch(path, data: body);
    _ensureOk(res);
    return res.data as T;
  }

  Future<T> putJson<T>(String path, {Object? body}) async {
    final res = await _dio.put(path, data: body);
    _ensureOk(res);
    return res.data as T;
  }

  Future<T> deleteJson<T>(String path) async {
    final res = await _dio.delete(path);
    _ensureOk(res);
    return res.data as T;
  }

  void _ensureOk(Response res) {
    final code = res.statusCode ?? 0;
    if (code >= 200 && code < 300) return;
    throw ApiException.fromResponse(res);
  }
}

/// Excepción tipada que mapea los códigos HTTP a mensajes legibles en
/// español, igual que la web (`apps/web/app/lib/admin-*.ts`).
class ApiException implements Exception {
  final int statusCode;
  final String message;
  final dynamic raw;

  ApiException(this.statusCode, this.message, {this.raw});

  factory ApiException.fromResponse(Response res) {
    final code = res.statusCode ?? 0;
    final body = res.data;

    // No usamos body.message porque el backend NestJS devuelve los mensajes
    // de validación en inglés ("Invalid request origin", "must be a UUID",
    // etc.). El usuario final ve solo el mensaje friendly en español.
    // Si quieres debug, raw queda disponible para logging.
    final friendly = switch (code) {
      400 => 'Datos inválidos.',
      401 => 'Sesión no válida. Inicia sesión de nuevo.',
      403 => 'No tienes permisos para esta acción.',
      404 => 'No encontrado.',
      409 => 'Ya existe o el estado actual no lo permite.',
      413 => 'Archivo demasiado grande.',
      _ when code >= 500 => 'Error del servidor. Intenta más tarde.',
      _ => 'No se pudo completar la solicitud.',
    };
    return ApiException(code, friendly, raw: body);
  }

  /// Para `toString()` mostramos solo el mensaje legible — sin el código
  /// HTTP ni el nombre de la clase, porque este string puede acabar en
  /// banners de error visibles al usuario final.
  @override
  String toString() => message;
}

/// Extrae un mensaje legible para el usuario de cualquier error. Si es
/// `ApiException` devuelve su `message` (ya en español); de lo contrario
/// devuelve un fallback genérico — NO el `e.toString()` crudo, que puede
/// exponer stack traces o mensajes en inglés del Dart SDK.
String userMessageFor(Object e) {
  if (e is ApiException) return e.message;
  return 'No se pudo completar la operación. Intenta de nuevo.';
}

class _ErrorMappingInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response != null) {
      handler.reject(DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: ApiException.fromResponse(err.response!),
      ));
      return;
    }
    handler.reject(DioException(
      requestOptions: err.requestOptions,
      error: ApiException(
        0,
        'Sin conexión con el servidor. Revisa tu red.',
      ),
      type: err.type,
    ));
  }
}
