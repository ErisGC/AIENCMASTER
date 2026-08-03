import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:showcaseview/showcaseview.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/services/update_service.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/coach_card.dart';
import '../dashboard/dashboard_screen.dart';
import '../announcements/announcements_screen.dart';
import '../churches/churches_screen.dart';
import '../reports/reports_screen.dart';
import '../security/security_screen.dart';

/// Shell con barra inferior. Las cinco secciones se mantienen montadas
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

class _HomeShellState extends State<HomeShell> {
  static const _kTutorialSeen = 'aienc_tutorial_seen_v1';

  final _updateService = UpdateService();

  // Objetivos del tutorial. Ambos son visibles en la pestaña 0 (Métricas),
  // así que el recorrido siempre arranca con la app en esa pestaña.
  final _dashKey = GlobalKey();
  final _navKey = GlobalKey();

  // Contexto descendiente del ShowCaseWidget. Lo necesitamos para arrancar el
  // recorrido desde initState/replay (el context del State queda por encima).
  BuildContext? _scCtx;

  int _idx = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _runStartupChecks());
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
    return false;
  }

  // ── Tutorial guiado ────────────────────────────────────────────────────────

  Future<void> _maybeAutoTutorial() async {
    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getBool(_kTutorialSeen) ?? false;
    if (seen || !mounted) return;
    _startTutorial();
  }

  /// Marca el tutorial como visto. Basta con que lo omita o lo termine una vez.
  Future<void> _markTutorialSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kTutorialSeen, true);
  }

  /// Arranca (o reinicia) el recorrido. Vuelve a la pestaña Métricas para que
  /// ambos puntos del spotlight estén montados y visibles.
  void _startTutorial() {
    if (_scCtx == null || !mounted) return;
    if (_idx != 0) setState(() => _idx = 0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _scCtx;
      if (!mounted || c == null) return;
      ShowCaseWidget.of(c).startShowCase([_dashKey, _navKey]);
    });
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return ShowCaseWidget(
      onFinish: _markTutorialSeen,
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
      if (isRoot)
        _NavTab(
          icon: Icons.shield_outlined,
          activeIcon: Icons.shield,
          label: 'Seguridad',
          child: const SecurityScreen(),
        ),
    ];

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _idx,
          children: tabs.map((t) => t.child).toList(),
        ),
      ),
      bottomNavigationBar: Showcase.withWidget(
        key: _navKey,
        height: coachHeight(ctx),
        width: coachWidth(ctx),
        container: _navCoach(ctx, account, isRoot),
        child: Container(
          decoration: const BoxDecoration(
            color: GemPalette.surfaceElevated,
            border: Border(
              top: BorderSide(color: GemPalette.borderSoft),
            ),
          ),
          child: SafeArea(
            top: false,
            child: NavigationBarTheme(
              data: NavigationBarThemeData(
                backgroundColor: Colors.transparent,
                indicatorColor: GemPalette.sapphire.withValues(alpha: 0.25),
                labelTextStyle: WidgetStateProperty.all(
                  const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w600),
                ),
              ),
              child: NavigationBar(
                selectedIndex: _idx < tabs.length ? _idx : 0,
                onDestinationSelected: (i) => setState(() => _idx = i),
                destinations: [
                  for (final t in tabs)
                    NavigationDestination(
                      icon: Icon(t.icon),
                      selectedIcon: Icon(t.activeIcon),
                      label: t.label,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: _idx == 3
          ? FloatingActionButton.extended(
              backgroundColor: GemPalette.emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Nuevo informe'),
              onPressed: () => context.push('/reports/new'),
            )
          : null,
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
          'egresos, balance y asistencia del período. Toca el ícono de filtro '
          'de la esquina superior derecha para cambiar el rango de fechas.';
    } else if ((account?.churchAssignments as List?)?.isEmpty ?? true) {
      body =
          'Aquí verás el resumen económico y de asistencia en cuanto tengas una '
          'iglesia asignada. Si aún no la ves, pídele a un administrador ROOT '
          'que te asigne una.';
    } else {
      final c = _churchLabel(account);
      body =
          'Aquí ves el resumen de $c: ofrendas, egresos, balance y asistencia '
          'del período. Toca el ícono de filtro de la esquina superior derecha '
          'para cambiar el rango de fechas.';
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
          '•  Iglesias: gestiona los datos, el logo y el mapa de cada iglesia.\n'
          '•  Informes: registra ofrendas, egresos y asistencia.\n'
          '•  Seguridad: revisa el historial de auditoría, configura tu PIN o '
          'huella y cierra sesión.\n\n'
          'Crear o eliminar iglesias se hace solo desde la web, por control.';
    } else {
      final c = _churchLabel(account);
      body =
          'Desde esta barra te mueves por toda la app:\n\n'
          '•  Métricas: el resumen de $c.\n'
          '•  Anuncios: consulta los anuncios; podrás gestionarlos si tienes el '
          'permiso.\n'
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
  _NavTab({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.child,
  });
}
