import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/version_chip.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.topLeft,
            radius: 1.5,
            colors: [Color(0xFF18253D), Color(0xFF0B1220)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    gradient: GemPalette.primaryGradient,
                    boxShadow: [
                      BoxShadow(
                        color: GemPalette.sapphire.withValues(alpha: 0.5),
                        blurRadius: 28,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'A',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 44,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  'AIENC Admin',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Panel administrativo móvil para la Iglesia Asociación de '
                  'Iglesias Evangélicas del Norte de Colombia.',
                  style: TextStyle(
                    color: GemPalette.textMuted,
                    height: 1.55,
                    fontSize: 14,
                  ),
                ),
                const Spacer(),
                GemPrimaryButton(
                  label: 'Iniciar sesión',
                  icon: Icons.lock_outline_rounded,
                  onPressed: () => context.go('/login'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.mail_outline_rounded),
                  label: const Text('Activar con invitación'),
                  onPressed: () => context.go('/invite'),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Si recibiste un enlace aiencadmin://invite, la app se '
                  'abrirá automáticamente con tu invitación.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: GemPalette.textMuted,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 16),
                const Center(child: VersionChip()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
