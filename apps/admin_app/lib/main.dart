import 'dart:async';

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
import 'core/theme/gem_palette.dart';
import 'core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');
  // Locator.init carga primero la tonalidad guardada y ajusta las barras del
  // sistema (ver ThemeController), así la app no arranca con la otra.
  await Locator.init();
  SystemChrome.setSystemUIOverlayStyle(
    ThemeController.overlayStyleFor(GemPalette.current),
  );
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
  StreamSubscription<Uri>? _linkSub;

  /// Momento en que la app pasó a segundo plano. Se usa para exigir
  /// re-autenticación local si vuelve tras más de [_inactivityThreshold].
  DateTime? _pausedAt;
  static const Duration _inactivityThreshold = Duration(minutes: 2);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Locator.theme.addListener(_onThemeChanged);
    Locator.authState.addListener(_onAuthChanged);
    _router = buildRouter();
    _appLinks = AppLinks();

    // Deep link inicial (app abierta vía aiencadmin://invite?token=...).
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleDeepLink(uri);
    });
    // Deep link entrante mientras la app está corriendo. Se guarda la
    // suscripción para poder cancelarla: sin eso, un remontaje del widget raíz
    // dejaría dos escuchas activas y cada enlace se procesaría por duplicado.
    _linkSub = _appLinks.uriLinkStream.listen(_handleDeepLink);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    Locator.theme.removeListener(_onThemeChanged);
    Locator.authState.removeListener(_onAuthChanged);
    Locator.authState.removeListener(_consumePendingLink);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      // Se guarda solo la PRIMERA salida. Al volver, Android pasa otra vez
      // por "hidden" justo antes de "resumed"; antes eso reiniciaba la hora
      // y el bloqueo por inactividad nunca llegaba a activarse.
      _pausedAt ??= DateTime.now();
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

  /// Si la pantalla de bloqueo "encima" ya está abierta.
  bool _lockOverlayShown = false;

  /// Bloqueo por inactividad: se abre la pantalla de bloqueo encima de lo que
  /// esté abierto, en vez de reemplazar la navegación (antes se perdía el
  /// formulario a medio llenar y se volvía a Métricas).
  void _onAuthChanged() {
    final locked = Locator.authState.lockedInPlace;
    if (locked && !_lockOverlayShown) {
      _lockOverlayShown = true;
      _router.push('/locked');
    } else if (!locked) {
      _lockOverlayShown = false;
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
    // Tampoco se navega con la app bloqueada: el enlace cambiaría la pantalla
    // de debajo y podría quitar el bloqueo de en medio. Se aplica al desbloquear.
    final fase = Locator.authState.phase;
    if (fase == AuthPhase.loading || fase == AuthPhase.locked) {
      _pendingLink = uri;
      Locator.authState.addListener(_consumePendingLink);
      return;
    }
    _navigateForLink(uri);
  }

  void _consumePendingLink() {
    final fase = Locator.authState.phase;
    if (fase == AuthPhase.loading || fase == AuthPhase.locked) return;
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

  /// Cambio de tonalidad. Los colores de GemPalette no son constantes ni
  /// dependen del Theme, así que se marca para reconstruir todo el árbol
  /// (como hace un hot reload): cada pantalla se vuelve a pintar con la nueva
  /// tonalidad sin perder su estado ni la navegación.
  void _onThemeChanged() {
    setState(() {});
    void reconstruir(Element el) {
      el.markNeedsBuild();
      el.visitChildren(reconstruir);
    }

    (context as Element).visitChildren(reconstruir);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'AIENC Admin',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(GemColors.light),
      darkTheme: AppTheme.build(GemColors.dark),
      themeMode: Locator.theme.mode,
      // El cambio es inmediato: si el Theme se animara, una parte de la
      // pantalla fundiría colores y otra (GemPalette) saltaría de golpe.
      themeAnimationDuration: Duration.zero,
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
