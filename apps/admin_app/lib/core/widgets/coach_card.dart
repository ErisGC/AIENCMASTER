import 'package:flutter/material.dart';

import '../theme/gem_palette.dart';

/// Tarjeta del tutorial guiado (coachmark).
///
/// showcaseview exige alto y ancho FIJOS para el contenedor del tooltip, así
/// que los calculamos a partir de la pantalla real y acotamos con límites
/// duros. Todo el contenido (paso, título y cuerpo) va dentro de un scroll,
/// con los botones siempre visibles abajo: por largo que sea el texto nunca
/// se sale de la pantalla — se desliza.

/// Ancho del coachmark: ancho de pantalla menos márgenes, acotado para que en
/// tablets no quede una tarjeta desmesurada ni en móviles chicos se corte.
double coachWidth(BuildContext context) {
  final w = MediaQuery.of(context).size.width;
  final target = w - 32;
  final maxW = w - 24; // nunca más ancho que la pantalla menos un margen
  return target.clamp(220.0, maxW < 420.0 ? maxW : 420.0);
}

/// Alto del coachmark: como mucho el 45% del alto útil (descontando notch y
/// barra de gestos), con mínimo y máximo razonables.
double coachHeight(BuildContext context) {
  final m = MediaQuery.of(context);
  final usable = m.size.height - m.padding.top - m.padding.bottom;
  final target = usable * 0.45;
  final maxH = usable - 24;
  if (maxH <= 180) return maxH > 0 ? maxH : 180;
  return target.clamp(180.0, maxH < 340.0 ? maxH : 340.0);
}

Widget buildCoachCard({
  required String step,
  required String title,
  required String body,
  required bool isLast,
  required VoidCallback onNext,
  required VoidCallback onSkip,
}) {
  return Material(
    color: Colors.transparent,
    child: Container(
      decoration: BoxDecoration(
        color: GemPalette.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GemPalette.borderSoft),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Zona desplazable: si el texto es largo, se baja deslizando.
          Flexible(
            child: Scrollbar(
              child: SingleChildScrollView(
                primary: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      step,
                      style: const TextStyle(
                        color: GemPalette.topaz,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.4,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      title,
                      style: const TextStyle(
                        color: GemPalette.textPrimary,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      body,
                      style: const TextStyle(
                        color: GemPalette.textMuted,
                        height: 1.42,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              TextButton(
                onPressed: onSkip,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  minimumSize: const Size(0, 40),
                ),
                child: const Text('Omitir'),
              ),
              const Spacer(),
              FilledButton(
                onPressed: onNext,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  minimumSize: const Size(0, 40),
                ),
                child: Text(isLast ? 'Entendido' : 'Siguiente'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
