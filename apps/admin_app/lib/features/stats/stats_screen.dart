import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/api_client.dart';
import '../../core/services/stats_service.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';

/// Estadísticas de uso para la cuenta principal: cómo se usa el portal
/// público (visitas, descargas, audios) y cuánto se trabaja en el panel.
class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _Serie {
  const _Serie(this.clave, this.etiqueta, this.color);
  final String clave;
  final String etiqueta;
  final Color color;
}

class _StatsScreenState extends State<StatsScreen> {
  static const _rangos = {
    7: '7 días',
    30: '30 días',
    90: '3 meses',
    365: '12 meses',
  };

  int _dias = 30;
  StatsReport? _datos;
  bool _cargando = true;
  String? _error;
  final _num = NumberFormat.decimalPattern('es');

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final hoy = DateTime.now();
      final hasta = DateTime(hoy.year, hoy.month, hoy.day);
      final desde = hasta.subtract(Duration(days: _dias - 1));
      final d = await Locator.stats.get(from: desde, to: hasta);
      if (mounted) setState(() => _datos = d);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _datos;
    return Scaffold(
      appBar: GemAppBar(title: const Text('Estadísticas')),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            Text(
              'Cómo se usa el portal y cuánto se trabaja en el panel. Las '
              'visitas son anónimas: solo se cuenta cuántas.',
              style: TextStyle(color: GemPalette.textMuted, height: 1.4),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final e in _rangos.entries)
                  ChoiceChip(
                    label: Text(e.value),
                    selected: _dias == e.key,
                    onSelected: (_) {
                      if (_dias == e.key) return;
                      setState(() => _dias = e.key);
                      _cargar();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (_error != null) ...[
              GemErrorBanner(message: _error!),
              const SizedBox(height: 12),
            ],
            if (d == null && _cargando)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (d != null)
              AnimatedOpacity(
                opacity: _cargando ? 0.55 : 1,
                duration: const Duration(milliseconds: 160),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: _contenido(d),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _contenido(StatsReport d) {
    final sinVisitas = d.visitas + d.descargas + d.reproducciones == 0;
    return [
      _titulo('Portal público'),
      if (sinVisitas)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            'Todavía no hay visitas contadas en este periodo. El conteo empezó '
            'con esta versión del portal.',
            style: TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
          ),
        ),
      _kpis([
        (
          'Visitas',
          _num.format(d.visitas),
          'Páginas abiertas',
          GemPalette.sapphire,
        ),
        (
          'Personas al día',
          _num.format(d.personasPromedio),
          'Promedio · máximo ${_num.format(d.personasMax)}',
          GemPalette.emerald,
        ),
        (
          'Descargas',
          _num.format(d.descargas),
          '${_num.format(d.apk)} de la app',
          GemPalette.topaz,
        ),
        (
          'Reproducciones',
          _num.format(d.reproducciones),
          'Audios y videos',
          GemPalette.amethyst,
        ),
      ]),
      const SizedBox(height: 12),
      _grafico('Visitas por día', d.seriePublica, [
        _Serie('visitas', 'Visitas', GemPalette.sapphire),
        _Serie('visitantes', 'Personas', GemPalette.emerald),
      ]),
      const SizedBox(height: 12),
      _grafico('Descargas y reproducciones', d.seriePublica, [
        _Serie('descargas', 'Descargas', GemPalette.topaz),
        _Serie('reproducciones', 'Reproducciones', GemPalette.amethyst),
      ]),
      const SizedBox(height: 12),
      _MapaZonas(lugares: d.lugares, total: d.zonasTotal),
      if (d.lugares.isNotEmpty) ...[
        const SizedBox(height: 12),
        _barras(
          'Zonas con más visitas',
          d.lugares
              .take(8)
              .map((l) => StatsRow(titulo: l.nombre, detalle: '', total: l.personas))
              .toList(),
        ),
      ],
      const SizedBox(height: 12),
      _barras('Qué se mira', d.secciones),
      const SizedBox(height: 12),
      _barras('Iglesias más visitadas', d.iglesias),
      const SizedBox(height: 12),
      _barras('Anuncios más vistos', d.anuncios),
      const SizedBox(height: 12),
      _barras('Estudios más escuchados', d.estudios),
      const SizedBox(height: 20),
      _titulo('Panel administrativo'),
      _kpis([
        (
          'Ingresos al panel',
          _num.format(d.panel['ingresos'] ?? 0),
          'Web y app',
          GemPalette.sapphire,
        ),
        (
          'Intentos fallidos',
          _num.format(d.panel['fallidos'] ?? 0),
          'Contraseña o número equivocado',
          GemPalette.ruby,
        ),
        (
          'Informes subidos',
          _num.format(d.panel['informes'] ?? 0),
          '',
          GemPalette.emerald,
        ),
        (
          'Anuncios',
          _num.format(d.panel['anuncios'] ?? 0),
          'Generales y de iglesias',
          GemPalette.topaz,
        ),
        (
          'Eventos',
          _num.format(d.panel['eventos'] ?? 0),
          'Una serie cuenta una vez',
          GemPalette.amethyst,
        ),
        (
          'Mensajes a soporte',
          _num.format(d.panel['mensajes'] ?? 0),
          '',
          GemPalette.ruby,
        ),
      ]),
      const SizedBox(height: 12),
      _grafico('Actividad del panel por día', d.seriePanel, [
        _Serie('ingresos', 'Ingresos', GemPalette.sapphire),
        _Serie('informes', 'Informes', GemPalette.emerald),
        _Serie('anuncios', 'Anuncios', GemPalette.topaz),
        _Serie('eventos', 'Eventos', GemPalette.amethyst),
        _Serie('mensajes', 'Soporte', GemPalette.textMuted),
        _Serie('fallidos', 'Intentos fallidos', GemPalette.ruby),
      ]),
    ];
  }

  Widget _titulo(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(t, style: Theme.of(context).textTheme.titleLarge),
  );

  Widget _kpis(List<(String, String, String, Color)> items) {
    return LayoutBuilder(
      builder: (context, c) {
        final ancho = (c.maxWidth - 10) / 2;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final (etiqueta, valor, sub, color) in items)
              SizedBox(
                width: ancho,
                child: GemCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              etiqueta.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: GemPalette.textMuted,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        valor,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (sub.isNotEmpty)
                        Text(
                          sub,
                          maxLines: 2,
                          style: TextStyle(
                            color: GemPalette.textMuted,
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _grafico(String titulo, List<StatsDay> serie, List<_Serie> series) {
    final n = serie.length;
    var maxY = 1.0;
    for (final dia in serie) {
      for (final s in series) {
        maxY = math.max(maxY, dia[s.clave].toDouble());
      }
    }
    // Cuatro marcas enteras en el eje (con valores pequeños salían repetidas).
    final paso = math.max(1, (maxY / 4).ceil()).toDouble();
    final techo = paso * 4;
    final cada = n <= 1 ? 1 : math.max(1, (n / 4).ceil());
    final df = DateFormat('d MMM', 'es');
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              for (final s in series)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 10,
                      height: 3,
                      decoration: BoxDecoration(
                        color: s.color,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      s.etiqueta,
                      style: TextStyle(
                        color: GemPalette.textMuted,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: n == 0
                ? Center(
                    child: Text(
                      'Sin datos',
                      style: TextStyle(color: GemPalette.textMuted),
                    ),
                  )
                : LineChart(
                    LineChartData(
                      minY: 0,
                      maxY: techo,
                      minX: 0,
                      maxX: math.max(1, n - 1).toDouble(),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        horizontalInterval: paso,
                        getDrawingHorizontalLine: (_) => FlLine(
                          color: GemPalette.borderSoft.withValues(alpha: 0.4),
                          strokeWidth: 1,
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      titlesData: FlTitlesData(
                        rightTitles: const AxisTitles(),
                        topTitles: const AxisTitles(),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 32,
                            interval: paso,
                            getTitlesWidget: (v, meta) => Text(
                              v.toInt().toString(),
                              style: TextStyle(
                                color: GemPalette.textMuted,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 24,
                            interval: cada.toDouble(),
                            getTitlesWidget: (v, _) {
                              final i = v.toInt();
                              if (i < 0 || i >= n) return const SizedBox();
                              return Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  df.format(serie[i].dia),
                                  style: TextStyle(
                                    color: GemPalette.textMuted,
                                    fontSize: 10,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipColor: (_) => GemPalette.surfaceElevated,
                          getTooltipItems: (puntos) => [
                            for (final p in puntos)
                              LineTooltipItem(
                                '${p == puntos.first ? '${df.format(serie[p.x.toInt()].dia)}\n' : ''}'
                                '${series[p.barIndex].etiqueta}: ${p.y.toInt()}',
                                TextStyle(
                                  color: series[p.barIndex].color,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 11.5,
                                ),
                              ),
                          ],
                        ),
                      ),
                      lineBarsData: [
                        for (final (i, s) in series.indexed)
                          LineChartBarData(
                            spots: [
                              for (var k = 0; k < n; k++)
                                FlSpot(
                                  k.toDouble(),
                                  serie[k][s.clave].toDouble(),
                                ),
                            ],
                            isCurved: n > 2,
                            preventCurveOverShooting: true,
                            color: s.color,
                            barWidth: 2.2,
                            dotData: FlDotData(show: n == 1),
                            belowBarData: BarAreaData(
                              show: i == 0,
                              color: s.color.withValues(alpha: 0.12),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _barras(String titulo, List<StatsRow> filas) {
    final max = filas.fold<int>(1, (m, f) => math.max(m, f.total));
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          if (filas.isEmpty)
            Text(
              'Sin datos todavía.',
              style: TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
            )
          else
            for (final f in filas)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                f.titulo,
                                style: const TextStyle(fontSize: 13.5),
                              ),
                              if (f.detalle.isNotEmpty)
                                Text(
                                  f.detalle,
                                  style: TextStyle(
                                    color: GemPalette.textMuted,
                                    fontSize: 11.5,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _num.format(f.total),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: f.total / max,
                        minHeight: 7,
                        backgroundColor: GemPalette.borderSoft.withValues(
                          alpha: 0.35,
                        ),
                        valueColor: AlwaysStoppedAnimation(GemPalette.sapphire),
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

/// Mapa de las zonas desde donde visitan: un círculo por zona, más grande
/// cuanta más gente. Solo cuentan quienes aceptaron compartirla.
class _MapaZonas extends StatefulWidget {
  const _MapaZonas({required this.lugares, required this.total});

  final List<StatsLugar> lugares;
  final int total;

  @override
  State<_MapaZonas> createState() => _MapaZonasState();
}

class _MapaZonasState extends State<_MapaZonas> {
  static final _colombiaCaja = LatLngBounds(
    const LatLng(-4.3, -79.1),
    const LatLng(12.6, -66.8),
  );
  static final _mundoCaja = LatLngBounds(
    const LatLng(-45, -130),
    const LatLng(62, 150),
  );

  final _mapa = MapController();
  bool _colombia = true;
  bool _listo = false;

  void _encuadrar() {
    if (!_listo) return;
    final puntos = widget.lugares.map((l) => LatLng(l.lat, l.lon)).toList();
    if (_colombia || puntos.isEmpty) {
      _mapa.fitCamera(
        CameraFit.bounds(
          bounds: _colombia ? _colombiaCaja : _mundoCaja,
          padding: const EdgeInsets.all(8),
        ),
      );
    } else if (puntos.length == 1) {
      _mapa.move(puntos.first, 7);
    } else {
      _mapa.fitCamera(
        CameraFit.coordinates(
          coordinates: puntos,
          padding: const EdgeInsets.all(36),
          maxZoom: 7,
        ),
      );
    }
  }

  @override
  void didUpdateWidget(covariant _MapaZonas old) {
    super.didUpdateWidget(old);
    if (old.lugares != widget.lugares) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _encuadrar());
    }
  }

  @override
  Widget build(BuildContext context) {
    final max = widget.lugares.fold<int>(1, (m, l) => math.max(m, l.personas));
    final nf = NumberFormat.decimalPattern('es');
    final veces = widget.total == 1 ? 'vez' : 'veces';
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Desde dónde nos visitan',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 6),
          Text(
            widget.total == 0
                ? 'Todavía nadie ha compartido su zona en este periodo. El '
                      'portal se lo pregunta a cada visitante una sola vez y '
                      'solo cuenta a quien acepta.'
                : 'Solo cuentan quienes aceptan compartir su zona (unos 10 km '
                      'a la redonda, nunca la ubicación exacta): '
                      '${nf.format(widget.total)} $veces en este periodo, una '
                      'por persona al día.',
            style: TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              for (final (colombia, etiqueta) in [
                (true, 'Colombia'),
                (false, 'Todo el mapa'),
              ])
                ChoiceChip(
                  label: Text(etiqueta),
                  selected: _colombia == colombia,
                  onSelected: (_) {
                    setState(() => _colombia = colombia);
                    _encuadrar();
                  },
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Con dos dedos mueves y acercas el mapa.',
            style: TextStyle(color: GemPalette.textMuted, fontSize: 11.5),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              height: 280,
              child: FlutterMap(
                mapController: _mapa,
                options: MapOptions(
                  initialCameraFit: CameraFit.bounds(
                    bounds: _colombiaCaja,
                    padding: const EdgeInsets.all(8),
                  ),
                  // Con un dedo se desplaza la pantalla; con dos se mueve y
                  // acerca el mapa. Así no se arrastra sin querer al bajar.
                  interactionOptions: const InteractionOptions(
                    flags:
                        InteractiveFlag.pinchZoom |
                        InteractiveFlag.pinchMove |
                        InteractiveFlag.doubleTapZoom,
                  ),
                  onMapReady: () {
                    _listo = true;
                    _encuadrar();
                  },
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'co.aienc.admin',
                    maxZoom: 19,
                  ),
                  CircleLayer(
                    circles: [
                      for (final l in widget.lugares)
                        CircleMarker(
                          point: LatLng(l.lat, l.lon),
                          radius: 7 + 17 * math.sqrt(l.personas / max),
                          color: GemPalette.sapphire.withValues(alpha: 0.45),
                          borderColor: const Color(0xFF1D4F8C),
                          borderStrokeWidth: 1.5,
                        ),
                    ],
                  ),
                  const SimpleAttributionWidget(
                    source: Text('OpenStreetMap'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
