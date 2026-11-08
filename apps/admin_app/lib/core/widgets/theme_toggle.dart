import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../state/locator.dart';
import '../theme/gem_palette.dart';

/// Botón de sol y luna para alternar entre el modo claro (Nueva Jerusalén) y
/// el oscuro. Está en la pantalla de bloqueo, en las de acceso, en el
/// encabezado de cada pestaña y en la barra de las demás pantallas.
class ThemeToggleButton extends StatelessWidget {
  const ThemeToggleButton({super.key, this.color});

  /// Color del ícono; por defecto el del texto de la tonalidad.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Locator.theme,
      builder: (context, _) {
        final dark = Locator.theme.isDark;
        final label = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
        return IconButton(
          tooltip: label,
          onPressed: () {
            HapticFeedback.selectionClick();
            Locator.theme.toggle();
          },
          icon: AnimatedSwitcher(
            duration: const Duration(milliseconds: 280),
            transitionBuilder: (child, animation) => RotationTransition(
              turns: Tween<double>(begin: 0.75, end: 1).animate(animation),
              child: FadeTransition(opacity: animation, child: child),
            ),
            child: Icon(
              dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
              key: ValueKey(dark),
              color: color ?? GemPalette.textPrimary,
              semanticLabel: label,
            ),
          ),
        );
      },
    );
  }
}

/// Barra superior de las pantallas internas: igual que [AppBar], con el
/// botón de tonalidad siempre al final.
class GemAppBar extends AppBar {
  GemAppBar({
    super.key,
    super.title,
    super.leading,
    super.bottom,
    super.automaticallyImplyLeading,
    super.centerTitle,
    List<Widget>? actions,
  }) : super(
         actions: [
           ...?actions,
           const ThemeToggleButton(),
           const SizedBox(width: 4),
         ],
       );
}
