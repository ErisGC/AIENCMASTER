/// Configuración inyectada en tiempo de compilación con --dart-define.
///
///   flutter build apk --dart-define=AIENC_API_BASE_URL=https://api.aienc.co
///                     --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app
class AppConfig {
  AppConfig._();

  /// URL base del backend NestJS.
  /// En dev (sin --dart-define) cae a localhost:3001 que es el default del API.
  static const String apiBaseUrl = String.fromEnvironment(
    'AIENC_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );

  /// Valor que enviamos como header `Origin` en las requests. El backend lo
  /// valida con `AdminOriginGuard` contra la lista WEB_ORIGIN +
  /// MOBILE_APP_ORIGIN. Debe coincidir exactamente con MOBILE_APP_ORIGIN del
  /// servidor.
  static const String mobileOrigin = String.fromEnvironment(
    'AIENC_MOBILE_ORIGIN',
    defaultValue: 'aiencadmin://app',
  );

  /// Identificador que enviamos como user-agent para que el backend pueda
  /// distinguir la app de un navegador.
  ///
  /// La versión se rellena al arrancar con la real del paquete
  /// ([establecerVersion]). El valor de aquí es sólo el respaldo por si esa
  /// lectura fallara: cuando estaba escrito a mano se quedó en 0.1 mientras la
  /// app iba por la 0.3, así que los registros del servidor mentían sobre qué
  /// versión estaba usando cada administrador — justo el dato que se necesita
  /// cuando alguien reporta un fallo.
  static String userAgentTag = 'AIENCAdmin/desconocida (Android; Flutter)';

  /// La llama el arranque con la versión leída del paquete.
  static void establecerVersion(String version) {
    final limpia = version.trim();
    if (limpia.isEmpty) return;
    userAgentTag = 'AIENCAdmin/$limpia (Android; Flutter)';
  }
}
