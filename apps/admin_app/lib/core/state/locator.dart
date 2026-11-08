import 'package:package_info_plus/package_info_plus.dart';

import '../api/api_client.dart';
import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../services/data_services.dart';
import '../services/device_identity_service.dart';
import '../services/linked_devices_service.dart';
import '../services/local_auth_service.dart';
import '../theme/theme_controller.dart';
import 'auth_state.dart';

/// Locator manual. Suficiente para un MVP — evita añadir get_it/riverpod.
class Locator {
  Locator._();

  static late final AuthService auth;
  static late final DeviceIdentityService device;
  static late final LocalAuthService localAuth;
  static late final ChurchService churches;
  static late final DirectorService directors;
  static late final StudyService studies;
  static late final AnnouncementService announcements;
  static late final ReportService reports;
  static late final SecurityService security;
  static late final InvitationService invitations;
  static late final SupportService support;
  static late final EventService events;
  static late final LinkedDevicesService linkedDevices;
  static late final AuthState authState;

  /// Tonalidad clara u oscura. Se crea y carga antes que todo lo demás para
  /// que la primera pantalla ya salga con la tonalidad guardada.
  static final ThemeController theme = ThemeController();

  static Future<void> init() async {
    // La versión real se resuelve ANTES de crear el cliente HTTP, que la usa
    // en su user-agent. Antes iba escrita a mano y se quedó en 0.1 mientras la
    // app iba por la 0.3, de modo que los registros del servidor mentían sobre
    // qué versión usaba cada administrador — justo el dato que hace falta
    // cuando alguien reporta un fallo. Si la lectura falla, se sigue adelante
    // con el valor de respaldo.
    try {
      final info = await PackageInfo.fromPlatform();
      AppConfig.establecerVersion('${info.version}+${info.buildNumber}');
    } catch (_) {
      // Sin versión legible: no es motivo para impedir el arranque.
    }

    await theme.load();

    await ApiClient.init();
    device = DeviceIdentityService();
    auth = AuthService(ApiClient.I, device);
    localAuth = LocalAuthService();
    churches = ChurchService(ApiClient.I);
    directors = DirectorService(ApiClient.I);
    studies = StudyService(ApiClient.I);
    announcements = AnnouncementService(ApiClient.I);
    reports = ReportService(ApiClient.I);
    security = SecurityService(ApiClient.I);
    invitations = InvitationService(ApiClient.I);
    support = SupportService(ApiClient.I);
    events = EventService(ApiClient.I);
    linkedDevices = LinkedDevicesService(ApiClient.I);
    authState = AuthState(auth: auth, localAuth: localAuth);
    onAdminSessionExpired = () => authState.sessionExpired();
  }
}
