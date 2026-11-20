import '../api/api_client.dart';

/// Estadísticas de uso para la cuenta principal (ver API `admin/stats`).
class StatsService {
  StatsService(this._api);
  final ApiClient _api;

  static String _dia(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  Future<StatsReport> get({
    required DateTime from,
    required DateTime to,
  }) async {
    final data = await _api.getJson<Map<String, dynamic>>(
      '/admin/stats',
      query: {'from': _dia(from), 'to': _dia(to)},
    );
    return StatsReport.fromJson(data);
  }
}

int _n(Object? v) => (v as num?)?.toInt() ?? 0;

/// "1 audio", "3 audios".
String _cuenta(int n, String uno, String varios) =>
    '$n ${n == 1 ? uno : varios}';

List<Map<String, dynamic>> _lista(Object? v) =>
    ((v as List?) ?? const []).whereType<Map<String, dynamic>>().toList();

/// Un día de la serie: el valor de cada clave ("visitas", "ingresos"…).
class StatsDay {
  StatsDay(this.dia, this.valores);
  final DateTime dia;
  final Map<String, int> valores;

  int operator [](String clave) => valores[clave] ?? 0;

  factory StatsDay.fromJson(Map<String, dynamic> j) {
    final partes = (j['dia'] as String? ?? '2000-01-01').split('-');
    return StatsDay(
      DateTime(
        int.tryParse(partes[0]) ?? 2000,
        int.tryParse(partes.length > 1 ? partes[1] : '1') ?? 1,
        int.tryParse(partes.length > 2 ? partes[2] : '1') ?? 1,
      ),
      {
        for (final e in j.entries)
          if (e.value is num) e.key: (e.value as num).toInt(),
      },
    );
  }
}

class StatsRow {
  StatsRow({required this.titulo, required this.detalle, required this.total});
  final String titulo;
  final String detalle;
  final int total;
}

class StatsReport {
  StatsReport({
    required this.visitas,
    required this.descargas,
    required this.reproducciones,
    required this.apk,
    required this.personasPromedio,
    required this.personasMax,
    required this.seriePublica,
    required this.secciones,
    required this.anuncios,
    required this.iglesias,
    required this.estudios,
    required this.panel,
    required this.seriePanel,
  });

  final int visitas;
  final int descargas;
  final int reproducciones;
  final int apk;
  final int personasPromedio;
  final int personasMax;
  final List<StatsDay> seriePublica;
  final List<StatsRow> secciones;
  final List<StatsRow> anuncios;
  final List<StatsRow> iglesias;
  final List<StatsRow> estudios;

  /// ingresos, informes, anuncios, eventos, mensajes.
  final Map<String, int> panel;
  final List<StatsDay> seriePanel;

  factory StatsReport.fromJson(Map<String, dynamic> j) {
    final p = (j['publico'] as Map<String, dynamic>?) ?? const {};
    final t = (p['totales'] as Map<String, dynamic>?) ?? const {};
    final a = (j['panel'] as Map<String, dynamic>?) ?? const {};
    final at = (a['totales'] as Map<String, dynamic>?) ?? const {};
    String detalle(List<String> partes) =>
        partes.where((s) => s.isNotEmpty).join(' · ');
    return StatsReport(
      visitas: _n(t['visitas']),
      descargas: _n(t['descargas']),
      reproducciones: _n(t['reproducciones']),
      apk: _n(t['apk']),
      personasPromedio: _n(t['visitantesPromedio']),
      personasMax: _n(t['visitantesMax']),
      seriePublica: _lista(p['serie']).map(StatsDay.fromJson).toList(),
      secciones: _lista(p['secciones'])
          .where((s) => _n(s['total']) > 0)
          .map(
            (s) => StatsRow(
              titulo: s['etiqueta'] as String? ?? '',
              detalle: '',
              total: _n(s['total']),
            ),
          )
          .toList(),
      anuncios: _lista(p['anuncios'])
          .map(
            (x) => StatsRow(
              titulo: x['titulo'] as String? ?? '',
              detalle: detalle([
                if (_n(x['descargas']) > 0)
                  _cuenta(_n(x['descargas']), 'descarga', 'descargas'),
                if (_n(x['reproducciones']) > 0)
                  _cuenta(_n(x['reproducciones']), 'video', 'videos'),
              ]),
              total: _n(x['vistas']),
            ),
          )
          .toList(),
      iglesias: _lista(p['iglesias'])
          .map(
            (x) => StatsRow(
              titulo: x['nombre'] as String? ?? '',
              detalle: detalle([
                if (_n(x['descargas']) > 0)
                  _cuenta(_n(x['descargas']), 'descarga', 'descargas'),
                if (_n(x['reproducciones']) > 0)
                  _cuenta(
                    _n(x['reproducciones']),
                    'audio escuchado',
                    'audios escuchados',
                  ),
              ]),
              total: _n(x['vistas']),
            ),
          )
          .toList(),
      estudios: _lista(p['estudios'])
          .map(
            (x) => StatsRow(
              titulo: x['titulo'] as String? ?? '',
              detalle: x['iglesia'] as String? ?? '',
              total: _n(x['reproducciones']),
            ),
          )
          .toList(),
      panel: {for (final e in at.entries) e.key: _n(e.value)},
      seriePanel: _lista(a['serie']).map(StatsDay.fromJson).toList(),
    );
  }
}
