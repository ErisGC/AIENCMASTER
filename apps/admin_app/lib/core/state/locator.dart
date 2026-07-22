import '../api/api_client.dart';
import '../services/auth_service.dart';
import '../services/data_services.dart';
import '../services/device_identity_service.dart';
import '../services/local_auth_service.dart';
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
  static late final AuthState authState;

  static Future<void> init() async {
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
    authState = AuthState(auth: auth, localAuth: localAuth);
  }
}
