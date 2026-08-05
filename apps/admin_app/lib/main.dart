import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/router.dart';
import 'core/state/auth_state.dart';
import 'core/state/locator.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0B1220),
    ),
  );
  await initializeDateFormatting('es');
  await Locator.init();
  await Locator.authState.bootstrap();
  runApp(const AdminApp());
}

class AdminApp extends StatefulWidget {
  const AdminApp({super.key});

  @override
  State<AdminApp> createState() => _AdminAppState();
}

class _AdminAppState extends State<AdminApp> with WidgetsBindingObserver {
  late final GoRouter _router;
  late final AppLinks _appLinks;

  /// Momento en que la app pasó a segundo plano. Se usa para exigir
  /// re-autenticación local si vuelve tras más de [_inactivityThreshold].
  DateTime? _pausedAt;
  static const Duration _inactivityThreshold = Duration(minutes: 2);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _router = buildRouter();
    _appLinks = AppLinks();

    // Deep link inicial (app abierta vía aiencadmin://invite?token=...).
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleDeepLink(uri);
    });
    // Deep link entrante mientras la app está corriendo.
    _appLinks.uriLinkStream.listen(_handleDeepLink);
  }

  @override
  void dispose() {
    Locator.authState.removeListener(_consumePendingLink);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _pausedAt = DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final pausedAt = _pausedAt;
      _pausedAt = null;
      if (pausedAt != null &&
          DateTime.now().difference(pausedAt) >= _inactivityThreshold) {
        // Volvió tras >2 min fuera: exigir re-autenticación local.
        Locator.authState.lockForInactivity();
      }
    }
  }

  /// Enlace recibido antes de que terminara el arranque. Ver [_handleDeepLink].
  Uri? _pendingLink;

  void _handleDeepLink(Uri uri) {
    if (uri.scheme != 'aiencadmin') return;

    // Mientras la sesión arranca, el router manda CUALQUIER ruta a /splash.
    // Si navegáramos ahora, el destino con el token se perdería y el invitado
    // acabaría en la pantalla inicial sin su invitación (que es justo lo que
    // pasaba). Guardamos el enlace y lo aplicamos al terminar el arranque.
    if (Locator.authState.phase == AuthPhase.loading) {
      _pendingLink = uri;
      Locator.authState.addListener(_consumePendingLink);
      return;
    }
    _navigateForLink(uri);
  }

  void _consumePendingLink() {
    if (Locator.authState.phase == AuthPhase.loading) return;
    Locator.authState.removeListener(_consumePendingLink);
    final uri = _pendingLink;
    _pendingLink = null;
    if (uri != null) _navigateForLink(uri);
  }

  void _navigateForLink(Uri uri) {
    if (uri.host == 'invite') {
      final token = uri.queryParameters['token'] ?? '';
      _router.go('/invite?token=${Uri.encodeQueryComponent(token)}');
    } else {
      _router.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'AIENC Admin',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(),
      routerConfig: _router,
      // Forzamos español-Colombia en TODA la UI del sistema (date pickers,
      // diálogos, tooltips de Material, mensajes de accesibilidad, etc.).
      // Sin esto, los componentes del SDK salen en inglés cuando el idioma
      // del dispositivo es inglés u otro.
      locale: const Locale('es', 'CO'),
      supportedLocales: const [
        Locale('es', 'CO'),
        Locale('es'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
