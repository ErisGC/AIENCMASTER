import 'package:flutter/material.dart';

import '../theme/gem_palette.dart';

/// Tarjeta del tutorial guiado (coachmark).
///
/// IMPORTANTE — por qué la tarjeta se acota a sí misma:
/// showcaseview pinta el `container` de `Showcase.withWidget` dentro de un
/// `Positioned(left:, top:)`, es decir con restricciones INFINITAS de alto y
/// ancho; y sus parámetros `height`/`width` sólo alimentan el cálculo de
/// posición, no limitan el contenido. Sin un límite propio, un texto largo
/// crecía fuera de la pantalla y el área desplazable quedaba infinita (por eso
/// no se podía deslizar). Aquí fijamos ancho y alto máximo con un
/// [ConstrainedBox]: eso acota la Column, y entonces el [Flexible] recorta y el
/// scroll funciona de verdad.

/// Ancho de la tarjeta: el de la pantalla menos márgenes, con tope para que en
/// pantallas grandes no quede desmesurada.
double coachWidth(BuildContext context) {
  final w = MediaQuery.of(context).size.width;
  final target = w - 32;
  final hardMax = w - 16;
  return target.clamp(200.0, hardMax < 400.0 ? hardMax : 400.0);
}

/// Alto máximo: la mitad del alto útil (sin notch ni barra de gestos), acotado
/// para que quepa junto al elemento iluminado.
double coachHeight(BuildContext context) {
  final m = MediaQuery.of(context);
  final usable = m.size.height - m.padding.top - m.padding.bottom;
  final target = usable * 0.5;
  final hardMax = usable - 32;
  if (hardMax <= 160) return hardMax > 0 ? hardMax : 160;
  return target.clamp(160.0, hardMax < 380.0 ? hardMax : 380.0);
}

class CoachCard extends StatefulWidget {
  const CoachCard({
    super.key,
    required this.step,
    required this.title,
    required this.body,
    required this.isLast,
    required this.onNext,
    required this.onSkip,
  });

  final String step;
  final String title;
  final String body;
  final bool isLast;
  final VoidCallback onNext;
  final VoidCallback onSkip;

  @override
  State<CoachCard> createState() => _CoachCardState();
}

class _CoachCardState extends State<CoachCard> {
  // Controlador propio: el Scrollbar necesita el mismo controller que la lista
  // (si no, buscaría el PrimaryScrollController y no lo encontraría aquí).
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minWidth: coachWidth(context),
          maxWidth: coachWidth(context),
          maxHeight: coachHeight(context),
        ),
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
              // Zona desplazable. Al estar el alto acotado, si el texto no cabe
              // se recorta aquí y se puede deslizar con el dedo.
              Flexible(
                child: Scrollbar(
                  controller: _scroll,
                  thumbVisibility: true,
                  child: SingleChildScrollView(
                    controller: _scroll,
                    padding: const EdgeInsets.only(right: 8),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.step,
                          style: const TextStyle(
                            color: GemPalette.topaz,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.4,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          widget.title,
                          style: const TextStyle(
                            color: GemPalette.textPrimary,
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          widget.body,
                          style: const TextStyle(
                            color: GemPalette.textMuted,
                            height: 1.42,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton(
                    onPressed: widget.onSkip,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      minimumSize: const Size(0, 40),
                    ),
                    child: const Text('Omitir'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: widget.onNext,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      minimumSize: const Size(0, 40),
                    ),
                    child: Text(widget.isLast ? 'Entendido' : 'Siguiente'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
