import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/welcome_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/invite_screen.dart';
import '../features/auth/lock_screen.dart';
import '../features/auth/reauth_screen.dart';
import '../features/auth/setup_lock_screen.dart';
import '../features/churches/church_edit_screen.dart';
import '../features/reports/new_report_screen.dart';
import '../features/shell/home_shell.dart';
import 'theme/gem_palette.dart';
import 'state/auth_state.dart';
import 'state/locator.dart';

/// Página con transición fade + slide-up suave. Da el "flujo" cinematográfico
/// al moverse entre pantallas sin alterar el destino ni la lógica del router.
/// Respeta MediaQuery.disableAnimations (accesibilidad).
CustomTransitionPage<void> _page(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 320),
    reverseTransitionDuration: const Duration(milliseconds: 220),
    transitionsBuilder: (context, animation, secondary, child) {
      final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
      if (reduce) return child;

      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.018),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}

GoRouter buildRouter() {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: Locator.authState,
    redirect: (context, state) {
      final phase = Locator.authState.phase;
      final loc = state.matchedLocation;

      // Splash mientras bootstrap corre.
      if (phase == AuthPhase.loading) return '/splash';

      // Sin sesión: sólo accesibles welcome/login/invite/splash.
      if (phase == AuthPhase.signedOut) {
        final allowed = {'/welcome', '/login', '/invite', '/splash'};
        if (allowed.contains(loc)) return null;
        return '/welcome';
      }

      // Locked: forzar /lock.
      if (phase == AuthPhase.locked) {
        if (loc == '/lock') return null;
        return '/lock';
      }

      // Falta confirmar la contraseña de la cuenta: forzar /reauth.
      if (phase == AuthPhase.needsPassword) {
        if (loc == '/reauth') return null;
        return '/reauth';
      }

      // Authenticated: prohibir pantallas de auth.
      final authPaths = {
        '/welcome',
        '/login',
        '/invite',
        '/splash',
        '/lock',
        '/reauth',
      };
      if (authPaths.contains(loc)) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        pageBuilder: (_, state) => _page(state, const _Splash()),
      ),
      GoRoute(
        path: '/welcome',
        pageBuilder: (_, state) => _page(state, const WelcomeScreen()),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (_, state) => _page(state, const LoginScreen()),
      ),
      GoRoute(
        path: '/invite',
        pageBuilder: (context, state) {
          final token = state.uri.queryParameters['token'];
          return _page(state, InviteScreen(initialToken: token));
        },
      ),
      GoRoute(
        path: '/lock',
        pageBuilder: (_, state) => _page(state, const LockScreen()),
      ),
      GoRoute(
        path: '/reauth',
        pageBuilder: (_, state) => _page(state, const ReauthScreen()),
      ),
      GoRoute(
        path: '/setup-lock',
        pageBuilder: (_, state) => _page(state, const SetupLockScreen()),
      ),
      GoRoute(
        path: '/',
        pageBuilder: (_, state) => _page(state, const HomeShell()),
      ),
      GoRoute(
        path: '/reports/new',
        pageBuilder: (_, state) => _page(state, const NewReportScreen()),
      ),
      GoRoute(
        path: '/churches/:id/edit',
        pageBuilder: (_, state) => _page(
          state,
          ChurchEditScreen(churchId: state.pathParameters['id']!),
        ),
      ),
    ],
  );
}

/// Splash con marca: logo "A" sobre gradiente de gemas + loader sutil.
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                gradient: GemPalette.primaryGradient,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: GemPalette.sapphire.withValues(alpha: 0.4),
                    blurRadius: 28,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: const Text(
                'A',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 46,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                ),
              ),
            ),
            const SizedBox(height: 28),
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                valueColor: AlwaysStoppedAnimation(GemPalette.emerald),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
