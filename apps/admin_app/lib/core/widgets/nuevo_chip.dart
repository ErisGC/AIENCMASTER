import 'dart:async';

import 'package:flutter/material.dart';

enum _Estado { brilla, azul, nada }

/// Marca de "Nuevo" en un anuncio, igual que en el portal: el primer día
/// brilla y cambia de color, el segundo queda azul y desde el tercero ya no
/// aparece. Cambia sola cuando le toca, aunque la pantalla siga abierta.
class NuevoChip extends StatefulWidget {
  const NuevoChip({super.key, required this.fecha});

  final DateTime fecha;

  @override
  State<NuevoChip> createState() => _NuevoChipState();
}

class _NuevoChipState extends State<NuevoChip>
    with SingleTickerProviderStateMixin {
  static const _brillaHasta = Duration(hours: 24);
  static const _azulHasta = Duration(hours: 48);

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );
  Timer? _timer;
  _Estado _estado = _Estado.nada;

  @override
  void initState() {
    super.initState();
    _actualizar();
  }

  @override
  void didUpdateWidget(covariant NuevoChip old) {
    super.didUpdateWidget(old);
    if (old.fecha != widget.fecha) _actualizar();
  }

  void _actualizar() {
    final edad = DateTime.now().difference(widget.fecha);
    Duration? cambia;
    if (edad < _brillaHasta) {
      _estado = _Estado.brilla;
      cambia = _brillaHasta - edad;
      if (!_anim.isAnimating) _anim.repeat();
    } else if (edad < _azulHasta) {
      _estado = _Estado.azul;
      cambia = _azulHasta - edad;
      _anim.stop();
    } else {
      _estado = _Estado.nada;
      _anim.stop();
    }
    _timer?.cancel();
    if (cambia != null) {
      _timer = Timer(cambia + const Duration(seconds: 1), () {
        if (mounted) setState(_actualizar);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _anim.dispose();
    super.dispose();
  }

  static const _texto = TextStyle(
    color: Colors.white,
    fontSize: 10.5,
    fontWeight: FontWeight.w800,
    letterSpacing: 0.7,
    height: 1.2,
  );

  Widget _caja(Decoration deco) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: deco,
    child: const Text('NUEVO', style: _texto),
  );

  @override
  Widget build(BuildContext context) {
    switch (_estado) {
      case _Estado.nada:
        return const SizedBox.shrink();
      case _Estado.azul:
        return _caja(
          BoxDecoration(
            color: const Color(0xFF2563EB),
            borderRadius: BorderRadius.circular(999),
          ),
        );
      case _Estado.brilla:
        final quieto = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
        return AnimatedBuilder(
          animation: _anim,
          builder: (context, _) {
            final t = quieto ? 0.0 : _anim.value;
            final h = t * 360;
            Color tono(double g) =>
                HSVColor.fromAHSV(1, (h + g) % 360, 0.72, 0.93).toColor();
            final a = tono(0);
            final b = tono(70);
            // Destello: una franja clara que cruza la etiqueta.
            final c = (t * 1.6 - 0.3).clamp(0.0, 1.0);
            double s(double x) => x.clamp(0.0, 1.0);
            return _caja(
              BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                gradient: LinearGradient(
                  colors: quieto
                      ? [a, b]
                      : [a, a, Color.lerp(a, Colors.white, 0.65)!, b, b],
                  stops: quieto ? null : [0, s(c - 0.18), c, s(c + 0.18), 1],
                ),
                boxShadow: [
                  BoxShadow(
                    color: b.withValues(alpha: 0.5),
                    blurRadius: 8,
                  ),
                ],
              ),
            );
          },
        );
    }
  }
}
