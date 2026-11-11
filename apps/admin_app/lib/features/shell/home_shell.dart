import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:showcaseview/showcaseview.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/domain.dart';
import '../../core/services/update_service.dart';
import '../../core/state/auth_state.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/coach_card.dart';
import '../dashboard/dashboard_screen.dart';
import '../announcements/announcements_screen.dart';
import '../churches/churches_screen.dart';
import '../events/events_screen.dart';
import '../reports/reports_screen.dart';
import '../security/approval_sheet.dart';
import '../security/security_screen.dart';

/// Shell con barra inferior. Las seis secciones se mantienen montadas
/// vía IndexedStack para preservar scroll y estado de cada feature.
///
/// Al abrir por primera vez dispara dos ayudas, en orden:
///   1. Aviso de actualización in-app (si hay un APK más nuevo publicado).
///   2. Tutorial guiado con spotlight (solo la primera vez; luego se puede
///      reinvocar con el botón de ayuda del panel).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  /// Cada cuánto se mira si hay un ingreso web esperando aprobación mientras
  /// la app está abierta.
  static const _cadaCuanto = Duration(seconds: 4);
  Timer? _vigia;
  bool _hojaAbierta = false;

  /// Solicitudes que la persona dejó para después ("Ahora no"): no se le
  /// vuelven a poner encima; siguen en Seguridad, Sesiones.
  final Set<String> _postergadas = {};

  /// Vueltas del vigía: los accesos de otras cuentas (solo la principal) se
  /// miran una vuelta sí y otra no.
  int _vuelta = 0;
  static const _kTutorialSeen = 'aienc_tutorial_seen_v1';

  /// Versión de la actualización a la que el usuario ya dijo "Ahora no": no
  /// se le vuelve a preguntar por esa misma versión en cada arranque.
  static const _kUpdateSkipped = 'aienc_update_skipped';

  /// Fundido al cambiar de pestaña (las pestañas siguen montadas).
  late final AnimationController _tabFade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
    value: 1,
  );

  /// Paso por el que va el tutorial (índice del punto que se está mostrando).
  /// Permite reanudarlo justo donde se quedó, no sólo repetirlo entero.
  static const _kTutorialStep = 'aienc_tutorial_step_v1';

  /// Total de puntos del recorrido (panel + barra de navegación).
  static const _tutorialTotal = 2;

  int _tutorialStep = 0;

  /// Desde qué paso se lanzó el recorrido en curso. showcaseview numera los
  /// pasos según la lista que recibe, así que al reanudar hay que sumarle este
  /// desplazamiento para saber el paso real.
  int _tutorialOffset = 0;

  final _updateService = UpdateService();

  // Objetivos del tutorial. Ambos son visibles en la pestaña 0 (Métricas),
  // así que el recorrido siempre arranca con la app en esa pestaña.
  final _dashKey = GlobalKey();
  final _navKey = GlobalKey();

  // Contexto descendiente del ShowCaseWidget. Lo necesitamos para arrancar el
  // recorrido desde initState/replay (el context del State queda por encima).
  BuildContext? _scCtx;

  int _idx = 0;

  /// Posición de la pestaña Informes en la barra (su botón de "nuevo informe"
  /// vive en el Scaffold, no dentro de la pantalla).
  static const _idxInformes = 4;

  /// Eventos próximos con cruce de horario: insignia en la pestaña Eventos.
  int _eventAlerts = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _runStartupChecks());
    _vigia = Timer.periodic(_cadaCuanto, (_) => _revisarAprobaciones());
  }

  @override
  void dispose() {
    _vigia?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _tabFade.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Al volver a la app se revisa de inmediato: lo normal es que la persona
    // acabe de intentar entrar en el computador y abra el teléfono.
    if (state == AppLifecycleState.resumed) _revisarAprobaciones();
  }

  /// Si hay un ingreso web de esta cuenta esperando, se muestra "¿Eres tú?".
  Future<void> _revisarAprobaciones() async {
    if (_hojaAbierta || !mounted) return;
    final auth = Locator.authState;
    if (auth.phase != AuthPhase.authenticated || auth.account == null) return;
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      return;
    }
    // El aviso sale sobre cualquier pantalla (va en el navegador raíz): una
    // hoja inferior no borra lo que haya abierto debajo.
    try {
      final data = await Locator.linkedDevices.overview();
      final nuevas = data.pending
          .where((r) => !_postergadas.contains(r.id))
          .toList();
      if (nuevas.isEmpty) {
        // Nada propio: la principal revisa si alguien más espera aprobación
        // (por ejemplo, quien acaba de aceptar una invitación).
        if (auth.isRootDevice && (_vuelta++).isEven) {
          await _revisarAccesosDeOtros();
        }
        return;
      }
      if (!mounted || _hojaAbierta) return;
      _hojaAbierta = true;
      final res = await showApprovalSheet(context, nuevas.first);
      _hojaAbierta = false;
      if (!mounted) return;
      final aviso = switch (res) {
        ApprovalOutcome.approved => 'Listo: ese equipo ya entró al panel.',
        ApprovalOutcome.rejected => 'Ingreso rechazado.',
        ApprovalOutcome.dismissed => null,
      };
      if (res == ApprovalOutcome.dismissed) _postergadas.add(nuevas.first.id);
      if (aviso != null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(aviso)));
      }
    } catch (_) {
      // Sin red o sin permiso: se vuelve a intentar en la próxima vuelta.
      _hojaAbierta = false;
    }
  }

  Future<void> _revisarAccesosDeOtros() async {
    final miId = Locator.authState.account?.id;
    final otras = (await Locator.linkedDevices.panelRequests())
        // Solo los que esperan a la principal: los que tienen app propia los
        // aprueba esa app (y siguen en Sesiones como respaldo).
        .where(
          (r) =>
              r.accountId != miId &&
              r.approvalChannel != 'APP' &&
              !_postergadas.contains(r.id),
        )
        .toList();
    if (otras.isEmpty || !mounted || _hojaAbierta) return;
    _hojaAbierta = true;
    final res = await showPanelRequestSheet(context, otras.first);
    _hojaAbierta = false;
    if (!mounted) return;
    if (res == ApprovalOutcome.dismissed) _postergadas.add(otras.first.id);
    final aviso = switch (res) {
      ApprovalOutcome.approved => 'Acceso aprobado.',
      ApprovalOutcome.rejected => 'Acceso rechazado.',
      ApprovalOutcome.dismissed => null,
    };
    if (aviso != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(aviso)));
    }
  }

  void _irA(int i) {
    if (i == _idx) return;
    setState(() => _idx = i);
    if (!(MediaQuery.maybeOf(context)?.disableAnimations ?? false)) {
      _tabFade.forward(from: 0.35);
    }
  }

  /// ¿Puede enviar informes? La cuenta principal siempre; los demás, si en
  /// alguna de sus iglesias tienen ese permiso.
  bool get _puedeEnviarInformes {
    final a = Locator.authState.account;
    if (a == null) return false;
    if (a.isRoot) return true;
    return a.churchAssignments.any(
      (c) => c.permissions.contains(ChurchPermission.SUBMIT_REPORTS),
    );
  }

  // ── Arranque ─────────────────────────────────────────────────────────────

  Future<void> _runStartupChecks() async {
    final launchedDownload = await _checkForUpdate();
    // Si el usuario se fue a descargar el APK, no le encimamos el tutorial.
    if (!mounted || launchedDownload) return;
    await _maybeAutoTutorial();
  }

  /// Devuelve true si el usuario aceptó descargar (la app se va al navegador).
  Future<bool> _checkForUpdate() async {
    final info = await _updateService.check();
    if (info == null || !info.hasUpdate || !mounted) return false;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_kUpdateSkipped) == info.latestVersion) return false;
    if (!mounted) return false;

    final accept = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: GemPalette.surfaceElevated,
        title: const Text('Actualización disponible'),
        content: Text(
          'Hay una versión más nueva (${info.latestVersion}). '
          'Tú tienes la ${info.currentVersion}.\n\n'
          'Puedes descargar el paquete ahora y, cuando termine, instalarlo '
          'desde tu carpeta de descargas. La instalación la confirmas tú.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: const Text('Ahora no'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Descargar'),
          ),
        ],
      ),
    );

    if (accept == true) {
      await launchUrl(
        Uri.parse(info.apkUrl),
        mode: LaunchMode.externalApplication,
      );
      return true;
    }
    await prefs.setString(_kUpdateSkipped, info.latestVersion);
    return false;
  }

  // ── Tutorial guiado ────────────────────────────────────────────────────────

  Future<void> _maybeAutoTutorial() async {
    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getBool(_kTutorialSeen) ?? false;
    final step = prefs.getInt(_kTutorialStep) ?? 0;
    if (mounted && step != _tutorialStep) setState(() => _tutorialStep = step);
    if (seen || !mounted) return;
    // Primera vez: si quedó a medias por cerrar la app, se reanuda ahí.
    _startTutorial(from: step);
  }

  /// Marca el tutorial como visto. Basta con que lo omita o lo termine una vez.
  Future<void> _markTutorialSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kTutorialSeen, true);
  }

  /// Al terminar el recorrido completo el progreso vuelve a cero, para que
  /// "repetir" siempre empiece limpio.
  Future<void> _onTutorialFinished() async {
    await _markTutorialSeen();
    await _saveStep(0);
  }

  Future<void> _saveStep(int step) async {
    if (mounted) setState(() => _tutorialStep = step);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kTutorialStep, step);
  }

  /// Arranca el recorrido desde [from]. Vuelve a la pestaña Métricas para que
  /// los puntos del spotlight estén montados y visibles.
  void _startTutorial({int from = 0}) {
    if (_scCtx == null || !mounted) return;
    final keys = [_dashKey, _navKey];
    final inicio = from.clamp(0, keys.length - 1);
    _tutorialOffset = inicio;
    if (_idx != 0) _irA(0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _scCtx;
      if (!mounted || c == null) return;
      ShowCaseWidget.of(c).startShowCase(keys.sublist(inicio));
    });
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return ShowCaseWidget(
      onFinish: _onTutorialFinished,
      // Guardamos el paso en curso para poder reanudar donde se quedó.
      onStart: (index, _) => _saveStep(_tutorialOffset + (index ?? 0)),
      builder: (ctx) {
        _scCtx = ctx;
        return _buildScaffold(ctx);
      },
    );
  }

  Widget _buildScaffold(BuildContext ctx) {
    final account = Locator.authState.account;
    final isRoot = account?.isRoot ?? false;

    final tabs = <_NavTab>[
      _NavTab(
        icon: Icons.insights_outlined,
        activeIcon: Icons.insights,
        label: 'Métricas',
        child: DashboardScreen(
          showcaseKey: _dashKey,
          coachCard: _dashCoach(ctx, account, isRoot),
          onReplayTutorial: _startTutorial,
        ),
      ),
      _NavTab(
        icon: Icons.campaign_outlined,
        activeIcon: Icons.campaign,
        label: 'Anuncios',
        child: const AnnouncementsScreen(),
      ),
      _NavTab(
        icon: Icons.event_outlined,
        activeIcon: Icons.event,
        label: 'Eventos',
        badge: _eventAlerts,
        child: EventsScreen(
          onAlertsCount: (n) {
            if (mounted && n != _eventAlerts) setState(() => _eventAlerts = n);
          },
        ),
      ),
      _NavTab(
        icon: Icons.church_outlined,
        activeIcon: Icons.church,
        label: 'Iglesias',
        child: const ChurchesScreen(),
      ),
      _NavTab(
        icon: Icons.assignment_outlined,
        activeIcon: Icons.assignment,
        label: 'Informes',
        child: const ReportsScreen(),
      ),
      // Visible para TODOS los administradores: aquí viven la protección de la
      // app, el tutorial y el canal de soporte. El contenido exclusivo del
      // administrador principal (invitaciones, cuentas y auditoría) se oculta
      // dentro de la propia pantalla según el rol.
      _NavTab(
        icon: Icons.shield_outlined,
        activeIcon: Icons.shield,
        label: 'Seguridad',
        child: SecurityScreen(
          tutorialStep: _tutorialStep,
          tutorialTotal: _tutorialTotal,
          onRestartTutorial: () => _startTutorial(from: 0),
          onContinueTutorial: () => _startTutorial(from: _tutorialStep),
        ),
      ),
    ];

    // "Atrás" desde otra pestaña vuelve a Métricas; solo desde Métricas sale
    // de la app (antes cerraba la app desde cualquier pestaña).
    return PopScope(
      canPop: _idx == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _irA(0);
      },
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: FadeTransition(
            opacity: CurvedAnimation(parent: _tabFade, curve: Curves.easeOut),
            child: IndexedStack(
              index: _idx,
              children: tabs.map((t) => t.child).toList(),
            ),
          ),
        ),
        bottomNavigationBar: Showcase.withWidget(
          key: _navKey,
          height: coachHeight(ctx),
          width: coachWidth(ctx),
          container: _navCoach(ctx, account, isRoot),
          child: Container(
            decoration: BoxDecoration(
              color: GemPalette.surfaceElevated,
              border: Border(top: BorderSide(color: GemPalette.borderSoft)),
            ),
            child: SafeArea(
              top: false,
              child: NavigationBarTheme(
                data: NavigationBarThemeData(
                  backgroundColor: Colors.transparent,
                  indicatorColor: GemPalette.sapphire.withValues(alpha: 0.25),
                  labelTextStyle: WidgetStateProperty.all(
                    const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                child: NavigationBar(
                  selectedIndex: _idx < tabs.length ? _idx : 0,
                  onDestinationSelected: _irA,
                  destinations: [
                    for (final t in tabs)
                      NavigationDestination(
                        icon: Badge.count(
                          count: t.badge,
                          isLabelVisible: t.badge > 0,
                          backgroundColor: GemPalette.ruby,
                          child: Icon(t.icon),
                        ),
                        selectedIcon: Badge.count(
                          count: t.badge,
                          isLabelVisible: t.badge > 0,
                          backgroundColor: GemPalette.ruby,
                          child: Icon(t.activeIcon),
                        ),
                        label: t.label,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        floatingActionButton: _idx == _idxInformes && _puedeEnviarInformes
            ? FloatingActionButton.extended(
                backgroundColor: GemPalette.emerald,
                foregroundColor: Colors.white,
                icon: const Icon(Icons.add),
                label: const Text('Nuevo informe'),
                onPressed: () => context.push('/reports/new'),
              )
            : null,
      ),
    );
  }

  // ── Tarjetas del recorrido (texto consciente de rol e iglesia) ─────────────

  String _firstName(dynamic account) {
    final dn = (account?.displayName as String?)?.trim() ?? '';
    if (dn.isEmpty) return 'admin';
    return dn.split(RegExp(r'\s+')).first;
  }

  String _churchLabel(dynamic account) {
    final assigns = account?.churchAssignments as List?;
    if (assigns == null || assigns.isEmpty) return 'tu iglesia';
    final name = assigns.first.churchName as String?;
    return (name == null || name.trim().isEmpty) ? 'tu iglesia' : name.trim();
  }

  Widget _dashCoach(BuildContext ctx, dynamic account, bool isRoot) {
    final String body;
    if (isRoot) {
      body =
          'Aquí tienes el resumen consolidado de todas las iglesias: ofrendas, '
          'egresos, balance y asistencia del mes en curso. Toca el calendario '
          'de la esquina superior derecha para ver otras fechas.';
    } else if ((account?.churchAssignments as List?)?.isEmpty ?? true) {
      body =
          'Aquí verás el resumen económico y de asistencia en cuanto tengas una '
          'iglesia asignada. Si aún no la ves, pídele a un administrador ROOT '
          'que te asigne una.';
    } else {
      final c = _churchLabel(account);
      body =
          'Aquí ves el resumen de $c: ofrendas, egresos, balance y asistencia '
          'del mes en curso. Toca el calendario de la esquina superior derecha '
          'para ver otras fechas.';
    }
    return _coachCard(
      ctx,
      step: 'PASO 1 DE 2',
      title: 'Hola, ${_firstName(account)}',
      body: body,
      isLast: false,
    );
  }

  Widget _navCoach(BuildContext ctx, dynamic account, bool isRoot) {
    final String body;
    if (isRoot) {
      body =
          'Desde esta barra te mueves por toda la app:\n\n'
          '•  Métricas: el resumen que acabas de ver.\n'
          '•  Anuncios: publica, edita y elimina anuncios.\n'
          '•  Eventos: el cronograma de cultos, reuniones y actividades; '
          'avisa si dos se cruzan.\n'
          '•  Iglesias: gestiona los datos, el logo y el mapa de cada iglesia.\n'
          '•  Informes: registra ofrendas, egresos y asistencia.\n'
          '•  Seguridad: atiende la bandeja de soporte, configura tu PIN o '
          'huella y cierra sesión. Las cuentas y la auditoría se gestionan '
          'desde el dispositivo principal, en el panel web.\n\n'
          'Crear o eliminar iglesias se hace solo desde la web, por control.';
    } else {
      final c = _churchLabel(account);
      body =
          'Desde esta barra te mueves por toda la app:\n\n'
          '•  Métricas: el resumen de $c.\n'
          '•  Anuncios: consulta los anuncios; podrás gestionarlos si tienes el '
          'permiso.\n'
          '•  Eventos: el cronograma de $c y de toda la Asociación; programa '
          'los de $c si tienes el permiso.\n'
          '•  Iglesias: consulta y edita la información de $c según tus '
          'permisos.\n'
          '•  Informes: registra ofrendas, egresos y asistencia de $c.\n\n'
          'Tu acceso está limitado a $c: no verás ni administrarás otras '
          'iglesias.';
    }
    return _coachCard(
      ctx,
      step: 'PASO 2 DE 2',
      title: 'Tu menú',
      body: body,
      isLast: true,
    );
  }

  Widget _coachCard(
    BuildContext ctx, {
    required String step,
    required String title,
    required String body,
    required bool isLast,
  }) {
    return CoachCard(
      step: step,
      title: title,
      body: body,
      isLast: isLast,
      onNext: () => ShowCaseWidget.of(ctx).next(),
      onSkip: () {
        ShowCaseWidget.of(ctx).dismiss();
        _markTutorialSeen();
      },
    );
  }
}

class _NavTab {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final Widget child;

  /// Número que se muestra sobre el ícono (0 = sin insignia).
  final int badge;
  _NavTab({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.child,
    this.badge = 0,
  });
}
