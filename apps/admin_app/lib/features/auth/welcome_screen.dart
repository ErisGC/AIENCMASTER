import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';
import '../../core/widgets/version_chip.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: GemPalette.welcomeGradient),
        child: SafeArea(
          // Con letra grande del sistema o pantallas bajas, se desplaza en vez
          // de desbordarse.
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Align(
                          alignment: Alignment.centerRight,
                          child: ThemeToggleButton(),
                        ),
                        const SizedBox(height: 12),
                        // Emblema cuadrado (en una columna estirada se volvía una barra).
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            width: 84,
                            height: 84,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(24),
                              gradient: GemPalette.primaryGradient,
                              boxShadow: [
                                BoxShadow(
                                  color: GemPalette.sapphire.withValues(
                                    alpha: 0.5,
                                  ),
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
                        ),
                        const SizedBox(height: 28),
                        Text(
                          'AIENC Admin',
                          style: Theme.of(context).textTheme.displayLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
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
                          // push: con "atrás" se vuelve a esta pantalla en vez de
                          // cerrar la app.
                          onPressed: () => context.push('/login'),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.mail_outline_rounded),
                          label: const Text('Activar con invitación'),
                          onPressed: () => context.push('/invite'),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Si te enviaron un enlace de invitación, ábrelo en este '
                          'teléfono o pégalo en Activar con invitación.',
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
            ),
          ),
        ),
      ),
    );
  }
}
