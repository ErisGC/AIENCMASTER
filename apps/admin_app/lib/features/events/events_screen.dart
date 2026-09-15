import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import 'event_edit_screen.dart';

/// Cronograma: calendario del mes con puntos de color, agenda por día y la
/// bandeja de avisos con los eventos que hoy tienen cruces de horario.
///
/// Pensado para personas que no manejan sistemas: un mes a la vista, se toca
/// un día y abajo aparece lo que hay ese día; el botón grande crea uno nuevo.
class EventsScreen extends StatefulWidget {
  /// Se llama con el número de eventos con cruce, para la insignia de la
  /// pestaña.
  final ValueChanged<int>? onAlertsCount;

  const EventsScreen({super.key, this.onAlertsCount});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  late int _year;
  late int _month;
  DateTime? _selectedDay;
  EventScope? _alcance; // null = todos

  List<ChurchEvent> _events = [];
  EventAlerts? _alerts;
  List<Church> _churches = [];
  bool _loading = true;
  bool _alertasAbiertas = false;
  String? _error;
  int _cargaVigente = 0;

  @override
  void initState() {
    super.initState();
    final hoy = DateTime.now();
    _year = hoy.year;
    _month = hoy.month;
    _load();
    _loadAlerts();
    _loadChurches();
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  Future<void> _load() async {
    final mia = ++_cargaVigente;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final desde = DateTime(
        _year,
        _month,
        1,
      ).subtract(const Duration(days: 7));
      final hasta = DateTime(_year, _month + 1, 0).add(const Duration(days: 7));
      final lista = await Locator.events.list(from: desde, to: hasta);
      if (!mounted || mia != _cargaVigente) return;
      setState(() => _events = lista);
    } catch (e) {
      if (!mounted || mia != _cargaVigente) return;
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted && mia == _cargaVigente) setState(() => _loading = false);
    }
  }

  Future<void> _loadAlerts() async {
    try {
      final a = await Locator.events.alerts();
      if (!mounted) return;
      setState(() => _alerts = a);
      widget.onAlertsCount?.call(a.count);
    } catch (_) {
      // La bandeja es un extra: si falla, no estorba el cronograma.
    }
  }

  Future<void> _loadChurches() async {
    try {
      final lista = await Locator.churches.list();
      if (mounted) setState(() => _churches = lista);
    } catch (_) {
      // Sin listado (o sin permiso) se trabaja con las iglesias asignadas.
    }
  }

  Future<void> _refresh() => Future.wait([_load(), _loadAlerts()]);

  // ── Permisos ─────────────────────────────────────────────────────────────

  AdminAccount? get _account => Locator.authState.account;

  bool get _canGlobal =>
      _account?.hasGlobalPermission(GlobalPermission.MANAGE_GLOBAL_EVENTS) ??
      false;

  /// Iglesias donde este administrador puede programar eventos locales.
  List<IglesiaOpcion> get _gestionables {
    final a = _account;
    if (a == null) return const [];
    if (a.isRoot) {
      return [for (final c in _churches) (id: c.id, name: c.name)];
    }
    return [
      for (final asg in a.churchAssignments)
        if (asg.permissions.contains(ChurchPermission.MANAGE_EVENTS))
          (id: asg.churchId, name: asg.churchName ?? 'Iglesia'),
    ];
  }

  /// Todas las iglesias que conoce la app (organizadora de un global,
  /// encargados de otras iglesias).
  List<IglesiaOpcion> get _todas {
    if (_churches.isNotEmpty) {
      return [for (final c in _churches) (id: c.id, name: c.name)];
    }
    return _gestionables;
  }

  bool get _puedeCrear => _gestionables.isNotEmpty || _canGlobal;

  // ── Acciones ─────────────────────────────────────────────────────────────

  Future<void> _openEditor({ChurchEvent? existing}) async {
    final gestionables = _gestionables;
    final activa = Locator.authState.activeChurchId;
    final porDefecto = gestionables.any((c) => c.id == activa)
        ? activa!
        : (gestionables.isNotEmpty ? gestionables.first.id : null);
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EventEditScreen(
          existing: existing,
          churches: gestionables,
          allChurches: _todas,
          canGlobal: _canGlobal,
          defaultChurchId: porDefecto,
          defaultDay: _selectedDay,
        ),
      ),
    );
    if (changed == true) await _refresh();
  }

  Future<void> _delete(ChurchEvent e) async {
    final esSerie = e.seriesId != null;
    // null = cancelar, false = solo esta fecha, true = toda la serie.
    final todaLaSerie = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Eliminar "${e.title}"'),
        content: Text(
          esSerie
              ? '${_diaLargo(e.startsAt)} · ${_rango(e)}\n\n'
                    'Este evento hace parte de una serie que se repite '
                    '${e.seriesLabel ?? ''}. ¿Qué quieres eliminar?'
              : '${_diaLargo(e.startsAt)} · ${_rango(e)}\n\n'
                    'Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          if (esSerie) ...[
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Solo esta fecha'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text(
                'Toda la serie',
                style: TextStyle(color: GemPalette.danger),
              ),
            ),
          ] else
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text(
                'Eliminar',
                style: TextStyle(color: GemPalette.danger),
              ),
            ),
        ],
      ),
    );
    if (todaLaSerie == null) return;
    try {
      final n = await Locator.events.delete(e.id, wholeSeries: todaLaSerie);
      await _refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            n > 1
                ? 'Se eliminaron $n fechas de "${e.title}".'
                : 'Se eliminó "${e.title}".',
          ),
        ),
      );
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(userMessageFor(err))));
    }
  }

  void _irA(int delta) {
    final d = DateTime(_year, _month + delta, 1);
    setState(() {
      _year = d.year;
      _month = d.month;
      _selectedDay = null;
    });
    _load();
  }

  void _irAHoy() {
    final hoy = DateTime.now();
    final cambiaMes = hoy.year != _year || hoy.month != _month;
    setState(() {
      _year = hoy.year;
      _month = hoy.month;
      _selectedDay = DateTime(hoy.year, hoy.month, hoy.day);
    });
    if (cambiaMes) _load();
  }

  void _verEnCalendario(ChurchEvent e) {
    final cambiaMes = e.startsAt.year != _year || e.startsAt.month != _month;
    setState(() {
      _year = e.startsAt.year;
      _month = e.startsAt.month;
      _selectedDay = DateTime(
        e.startsAt.year,
        e.startsAt.month,
        e.startsAt.day,
      );
      _alertasAbiertas = false;
    });
    if (cambiaMes) _load();
  }

  // ── Derivados ────────────────────────────────────────────────────────────

  Set<String> get _conCruce => {
    for (final it in _alerts?.items ?? const <EventAlertItem>[]) it.event.id,
  };

  List<ChurchEvent> get _filtrados => _alcance == null
      ? _events
      : _events.where((e) => e.scope == _alcance).toList();

  List<ChurchEvent> get _agenda {
    final ordenados = [..._filtrados]
      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
    final sel = _selectedDay;
    if (sel != null) {
      return ordenados.where((e) => _mismoDia(e.startsAt, sel)).toList();
    }
    final hoy = DateTime.now();
    final inicioHoy = DateTime(hoy.year, hoy.month, hoy.day);
    return ordenados
        .where((e) => !e.startsAt.isBefore(inicioHoy))
        .take(15)
        .toList();
  }

  static bool _mismoDia(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  static String _capitalizar(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  static String _diaLargo(DateTime d) =>
      _capitalizar(DateFormat("EEEE d 'de' MMMM", 'es').format(d));

  static String _hora(DateTime d) => DateFormat.jm('es').format(d);

  static String _rango(ChurchEvent e) => _mismoDia(e.startsAt, e.endsAt)
      ? '${_hora(e.startsAt)} – ${_hora(e.endsAt)}'
      : '${_hora(e.startsAt)} – ${DateFormat("d MMM", 'es').format(e.endsAt)} ${_hora(e.endsAt)}';

  // ── UI ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final agenda = _agenda;
    final conCruce = _conCruce;
    final alerts = _alerts;

    return Stack(
      children: [
        Column(
          children: [
            const GemSectionHeader(
              eyebrow: 'Cronograma',
              title: 'Eventos',
              subtitle:
                  'Cultos, reuniones y actividades. La app avisa si dos se cruzan.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    GemPill(
                      label: 'Todos',
                      selected: _alcance == null,
                      onTap: () => setState(() => _alcance = null),
                    ),
                    const SizedBox(width: 8),
                    GemPill(
                      label: 'Toda la Asociación',
                      selected: _alcance == EventScope.GLOBAL,
                      onTap: () => setState(() => _alcance = EventScope.GLOBAL),
                    ),
                    const SizedBox(width: 8),
                    GemPill(
                      label: 'Solo iglesias',
                      selected: _alcance == EventScope.LOCAL,
                      onTap: () => setState(() => _alcance = EventScope.LOCAL),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
                  children: [
                    if (_error != null) ...[
                      GemErrorBanner(message: _error!),
                      const SizedBox(height: 10),
                    ],
                    if (alerts != null && alerts.count > 0) ...[
                      _AlertsBanner(
                        alerts: alerts,
                        abierto: _alertasAbiertas,
                        onToggle: () => setState(
                          () => _alertasAbiertas = !_alertasAbiertas,
                        ),
                        onVer: _verEnCalendario,
                        diaLargo: _diaLargo,
                        rango: _rango,
                      ),
                      const SizedBox(height: 10),
                    ],
                    _MonthGrid(
                      year: _year,
                      month: _month,
                      events: _filtrados,
                      selectedDay: _selectedDay,
                      conflictIds: conCruce,
                      loading: _loading,
                      onPrev: () => _irA(-1),
                      onNext: () => _irA(1),
                      onToday: _irAHoy,
                      onSelect: (d) => setState(
                        () => _selectedDay =
                            (_selectedDay != null &&
                                _mismoDia(_selectedDay!, d))
                            ? null
                            : d,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _selectedDay == null
                                ? 'Próximos eventos'
                                : _diaLargo(_selectedDay!),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        if (_selectedDay != null)
                          TextButton(
                            onPressed: () =>
                                setState(() => _selectedDay = null),
                            child: const Text('Ver próximos'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    if (agenda.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        child: Text(
                          _selectedDay != null
                              ? 'No hay eventos ese día.'
                              : _loading
                              ? 'Cargando…'
                              : 'No hay eventos próximos.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: GemPalette.textMuted,
                            height: 1.5,
                          ),
                        ),
                      )
                    else
                      ..._agendaPorDia(agenda, conCruce),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (_puedeCrear)
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton.extended(
              backgroundColor: GemPalette.emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Nuevo evento'),
              onPressed: () => _openEditor(),
            ),
          ),
      ],
    );
  }

  List<Widget> _agendaPorDia(List<ChurchEvent> agenda, Set<String> conCruce) {
    final out = <Widget>[];
    DateTime? dia;
    for (final e in agenda) {
      if (_selectedDay == null &&
          (dia == null || !_mismoDia(dia, e.startsAt))) {
        dia = e.startsAt;
        out.add(
          Padding(
            padding: EdgeInsets.only(top: out.isEmpty ? 0 : 12, bottom: 6),
            child: Text(
              _diaLargo(dia).toUpperCase(),
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.1,
              ),
            ),
          ),
        );
      }
      out.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _EventCard(
            item: e,
            conCruce: conCruce.contains(e.id),
            rango: _rango(e),
            onEdit: e.editable ? () => _openEditor(existing: e) : null,
            onDelete: e.editable ? () => _delete(e) : null,
          ),
        ),
      );
    }
    return out;
  }
}

// ── Bandeja de avisos ───────────────────────────────────────────────────────

class _AlertsBanner extends StatelessWidget {
  final EventAlerts alerts;
  final bool abierto;
  final VoidCallback onToggle;
  final ValueChanged<ChurchEvent> onVer;
  final String Function(DateTime) diaLargo;
  final String Function(ChurchEvent) rango;

  const _AlertsBanner({
    required this.alerts,
    required this.abierto,
    required this.onToggle,
    required this.onVer,
    required this.diaLargo,
    required this.rango,
  });

  @override
  Widget build(BuildContext context) {
    final n = alerts.count;
    return Container(
      decoration: BoxDecoration(
        color: GemPalette.ruby.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GemPalette.ruby.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: GemPalette.ruby,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      n == 1
                          ? 'Hay 1 evento con cruce de horario'
                          : 'Hay $n eventos con cruce de horario',
                      style: const TextStyle(
                        color: GemPalette.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Icon(
                    abierto ? Icons.expand_less : Icons.expand_more,
                    color: GemPalette.textMuted,
                  ),
                ],
              ),
            ),
          ),
          if (abierto)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final it in alerts.items) ...[
                    const Divider(height: 14, color: GemPalette.borderSoft),
                    Text(
                      it.event.title,
                      style: const TextStyle(
                        color: GemPalette.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${diaLargo(it.event.startsAt)} · ${rango(it.event)}'
                      '${it.event.churchName != null ? ' · ${it.event.churchName}' : ' · Toda la Asociación'}',
                      style: const TextStyle(
                        color: GemPalette.textMuted,
                        fontSize: 12.5,
                      ),
                    ),
                    for (final c in it.conflicts)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          '•  ${c.describir()}',
                          style: const TextStyle(
                            color: GemPalette.textMuted,
                            fontSize: 12.5,
                            height: 1.4,
                          ),
                        ),
                      ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => onVer(it.event),
                        child: const Text('Ver en el calendario'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Cuadrícula del mes ─────────────────────────────────────────────────────

class _MonthGrid extends StatelessWidget {
  final int year;
  final int month;
  final List<ChurchEvent> events;
  final DateTime? selectedDay;
  final Set<String> conflictIds;
  final bool loading;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;
  final ValueChanged<DateTime> onSelect;

  const _MonthGrid({
    required this.year,
    required this.month,
    required this.events,
    required this.selectedDay,
    required this.conflictIds,
    required this.loading,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
    required this.onSelect,
  });

  static const _iniciales = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  @override
  Widget build(BuildContext context) {
    final hoy = DateTime.now();
    final primero = DateTime(year, month, 1);
    final diasDelMes = DateTime(year, month + 1, 0).day;
    // DateTime.weekday: lunes=1 … domingo=7. La semana empieza en domingo.
    final huecos = primero.weekday % 7;

    final porDia = <int, List<ChurchEvent>>{};
    for (final e in events) {
      if (e.startsAt.year == year && e.startsAt.month == month) {
        porDia.putIfAbsent(e.startsAt.day, () => []).add(e);
      }
    }

    final titulo = DateFormat('MMMM yyyy', 'es').format(primero);

    return GemCard(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                onPressed: onPrev,
                icon: const Icon(Icons.chevron_left),
                tooltip: 'Mes anterior',
              ),
              Expanded(
                child: Text(
                  titulo[0].toUpperCase() + titulo.substring(1),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: GemPalette.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                onPressed: onNext,
                icon: const Icon(Icons.chevron_right),
                tooltip: 'Mes siguiente',
              ),
              TextButton(onPressed: onToday, child: const Text('Hoy')),
            ],
          ),
          if (loading)
            const LinearProgressIndicator(
              minHeight: 2,
              color: GemPalette.emerald,
              backgroundColor: Colors.transparent,
            ),
          const SizedBox(height: 4),
          Row(
            children: [
              for (final i in _iniciales)
                Expanded(
                  child: Text(
                    i,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: GemPalette.textMuted,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 2,
            crossAxisSpacing: 2,
            childAspectRatio: 0.95,
            children: [
              for (var i = 0; i < huecos; i++) const SizedBox.shrink(),
              for (var d = 1; d <= diasDelMes; d++)
                _DayCell(
                  day: d,
                  events: porDia[d] ?? const [],
                  esHoy: hoy.year == year && hoy.month == month && hoy.day == d,
                  seleccionado:
                      selectedDay != null &&
                      selectedDay!.year == year &&
                      selectedDay!.month == month &&
                      selectedDay!.day == d,
                  conflictIds: conflictIds,
                  onTap: () => onSelect(DateTime(year, month, d)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          const Wrap(
            spacing: 14,
            runSpacing: 4,
            alignment: WrapAlignment.center,
            children: [
              _Leyenda(color: GemPalette.emerald, label: 'Toda la Asociación'),
              _Leyenda(color: GemPalette.sapphire, label: 'De una iglesia'),
              _Leyenda(color: GemPalette.ruby, label: 'Con cruce'),
            ],
          ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  final int day;
  final List<ChurchEvent> events;
  final bool esHoy;
  final bool seleccionado;
  final Set<String> conflictIds;
  final VoidCallback onTap;

  const _DayCell({
    required this.day,
    required this.events,
    required this.esHoy,
    required this.seleccionado,
    required this.conflictIds,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final puntos = <Color>[];
    for (final e in events.take(3)) {
      puntos.add(
        conflictIds.contains(e.id)
            ? GemPalette.ruby
            : e.isGlobal
            ? GemPalette.emerald
            : GemPalette.sapphire,
      );
    }
    final n = events.length;
    return Semantics(
      button: true,
      label: '$day: $n ${n == 1 ? 'evento' : 'eventos'}',
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: seleccionado
                ? GemPalette.sapphire.withValues(alpha: 0.35)
                : n > 0
                ? GemPalette.chip
                : null,
            border: esHoy
                ? Border.all(color: GemPalette.emerald, width: 1.5)
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '$day',
                style: TextStyle(
                  color: GemPalette.textPrimary,
                  fontSize: 13.5,
                  fontWeight: esHoy || seleccionado
                      ? FontWeight.w800
                      : FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              SizedBox(
                height: 6,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final c in puntos)
                      Container(
                        width: 6,
                        height: 6,
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        decoration: BoxDecoration(
                          color: c,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Leyenda extends StatelessWidget {
  final Color color;
  final String label;
  const _Leyenda({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(color: GemPalette.textMuted, fontSize: 11),
        ),
      ],
    );
  }
}

// ── Tarjeta de evento ──────────────────────────────────────────────────────

class _EventCard extends StatelessWidget {
  final ChurchEvent item;
  final bool conCruce;
  final String rango;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  const _EventCard({
    required this.item,
    required this.conCruce,
    required this.rango,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final color = item.isGlobal ? GemPalette.emerald : GemPalette.sapphire;
    final quien = item.isGlobal
        ? 'Toda la Asociación${item.churchName != null ? ' · organiza ${item.churchName}' : ''}'
        : (item.churchName ?? 'Iglesia');
    return GemCard(
      padding: EdgeInsets.zero,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    rango,
                    style: const TextStyle(
                      color: GemPalette.textPrimary,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    ),
                  ),
                ),
                GemBadge(label: eventTypeLabel(item.type), color: color),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item.title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              quien,
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 12.5,
                height: 1.4,
              ),
            ),
            if (item.seriesLabel != null)
              Text(
                'Se repite ${item.seriesLabel}',
                style: const TextStyle(
                  color: GemPalette.textMuted,
                  fontSize: 12.5,
                ),
              ),
            if (item.location != null && item.location!.isNotEmpty)
              Text(
                'Lugar: ${item.location}',
                style: const TextStyle(
                  color: GemPalette.textMuted,
                  fontSize: 12.5,
                ),
              ),
            if (item.directors.isNotEmpty)
              Text(
                '${item.directors.length == 1 ? 'Encargado' : 'Encargados'}: '
                '${item.directors.map((d) => d.displayName).join(', ')}',
                style: const TextStyle(
                  color: GemPalette.textMuted,
                  fontSize: 12.5,
                  height: 1.4,
                ),
              ),
            if (conCruce)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  'Este evento se cruza con otro. Revisa los avisos.',
                  style: TextStyle(
                    color: GemPalette.ruby,
                    fontWeight: FontWeight.w600,
                    fontSize: 12.5,
                  ),
                ),
              ),
            if (onEdit != null || onDelete != null)
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Editar'),
                    onPressed: onEdit,
                  ),
                  TextButton.icon(
                    icon: const Icon(
                      Icons.delete_outline,
                      size: 16,
                      color: GemPalette.danger,
                    ),
                    label: const Text(
                      'Eliminar',
                      style: TextStyle(color: GemPalette.danger),
                    ),
                    onPressed: onDelete,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
