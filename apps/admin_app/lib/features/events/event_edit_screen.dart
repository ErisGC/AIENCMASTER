import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/services/data_services.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Iglesia sobre la que se puede programar (id y nombre).
typedef IglesiaOpcion = ({String id, String name});

/// Formulario de evento. Crea (si `existing` es null) o edita.
///
/// Las fechas y horas se eligen con los selectores del sistema; la
/// repetición se explica con la frase resultante ("todos los jueves",
/// "el primer sábado de cada mes"); y antes de guardar se pueden revisar
/// los cruces con otros eventos en lenguaje llano.
class EventEditScreen extends StatefulWidget {
  final ChurchEvent? existing;

  /// Iglesias donde quien edita puede programar eventos locales.
  final List<IglesiaOpcion> churches;

  /// Todas las iglesias (organizadora de un global y encargados).
  final List<IglesiaOpcion> allChurches;
  final bool canGlobal;
  final String? defaultChurchId;
  final DateTime? defaultDay;

  const EventEditScreen({
    super.key,
    required this.existing,
    required this.churches,
    required this.allChurches,
    required this.canGlobal,
    required this.defaultChurchId,
    required this.defaultDay,
  });

  @override
  State<EventEditScreen> createState() => _EventEditScreenState();
}

class _EventEditScreenState extends State<EventEditScreen> {
  late final TextEditingController _title;
  late final TextEditingController _location;
  late final TextEditingController _description;

  late EventType _type;
  late EventScope _scope;
  String? _churchId;

  late DateTime _fecha; // solo día
  late TimeOfDay _inicio;
  late TimeOfDay _fin;
  bool _otroDia = false;
  DateTime? _fechaFin;

  String? _repeat; // null | 'WEEKLY' | 'MONTHLY_BY_WEEKDAY'
  DateTime? _until;

  /// Encargados elegidos, por id.
  final Map<String, EventDirectorRef> _encargados = {};

  bool _guardando = false;
  bool _revisando = false;
  String? _error;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final ex = widget.existing;
    _title = TextEditingController(text: ex?.title ?? '');
    _location = TextEditingController(text: ex?.location ?? '');
    _description = TextEditingController(text: ex?.description ?? '');
    _type = ex?.type ?? EventType.CULTO;
    _scope =
        ex?.scope ??
        (widget.churches.isEmpty && widget.canGlobal
            ? EventScope.GLOBAL
            : EventScope.LOCAL);
    _churchId = ex != null ? ex.churchId : widget.defaultChurchId;

    if (ex != null) {
      _fecha = DateTime(ex.startsAt.year, ex.startsAt.month, ex.startsAt.day);
      _inicio = TimeOfDay.fromDateTime(ex.startsAt);
      _fin = TimeOfDay.fromDateTime(ex.endsAt);
      final finDia = DateTime(ex.endsAt.year, ex.endsAt.month, ex.endsAt.day);
      _otroDia = finDia != _fecha;
      _fechaFin = _otroDia ? finDia : null;
      for (final d in ex.directors) {
        _encargados[d.id] = d;
      }
    } else {
      final base = widget.defaultDay ?? DateTime.now();
      _fecha = DateTime(base.year, base.month, base.day);
      _inicio = const TimeOfDay(hour: 19, minute: 0);
      _fin = const TimeOfDay(hour: 21, minute: 0);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _description.dispose();
    super.dispose();
  }

  // ── Fechas ───────────────────────────────────────────────────────────────

  DateTime get _startsAt => DateTime(
    _fecha.year,
    _fecha.month,
    _fecha.day,
    _inicio.hour,
    _inicio.minute,
  );

  DateTime get _endsAt {
    final d = (_otroDia && _fechaFin != null) ? _fechaFin! : _fecha;
    return DateTime(d.year, d.month, d.day, _fin.hour, _fin.minute);
  }

  static const _nombresDia = [
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
    'domingo',
  ];

  String get _fraseSemanal {
    final nombre = _nombresDia[_fecha.weekday - 1];
    return 'todos los ${nombre.endsWith('o') ? '${nombre}s' : nombre}';
  }

  /// "el primer jueves de cada mes", a partir de la fecha elegida.
  String get _fraseMensual {
    final total = DateTime(_fecha.year, _fecha.month + 1, 0).day;
    final ordinal = ((_fecha.day - 1) ~/ 7);
    final ultimo = _fecha.day + 7 > total;
    const pos = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto'];
    final p = ultimo ? 'último' : pos[ordinal];
    return 'el $p ${_nombresDia[_fecha.weekday - 1]} de cada mes';
  }

  static String _diaCorto(DateTime d) =>
      DateFormat("EEE d 'de' MMM yyyy", 'es').format(d);

  static String _diaLargo(DateTime d) {
    final s = DateFormat("EEEE d 'de' MMMM", 'es').format(d);
    return s[0].toUpperCase() + s.substring(1);
  }

  static String _hora(DateTime d) => DateFormat.jm('es').format(d);

  ThemeData _temaSelector(BuildContext c) => Theme.of(c).copyWith(
    colorScheme: const ColorScheme.dark(
      primary: GemPalette.sapphire,
      onPrimary: Colors.white,
    ),
  );

  Future<DateTime?> _pickDate(DateTime inicial, {DateTime? minimo}) {
    final hoy = DateTime.now();
    final primero = minimo ?? DateTime(hoy.year - 1, 1, 1);
    return showDatePicker(
      context: context,
      initialDate: inicial.isBefore(primero) ? primero : inicial,
      firstDate: primero,
      lastDate: DateTime(hoy.year + 3, 12, 31),
      locale: const Locale('es'),
      builder: (c, child) => Theme(data: _temaSelector(c), child: child!),
    );
  }

  Future<TimeOfDay?> _pickTime(TimeOfDay inicial) => showTimePicker(
    context: context,
    initialTime: inicial,
    builder: (c, child) => Theme(data: _temaSelector(c), child: child!),
  );

  // ── Encargados ───────────────────────────────────────────────────────────

  Future<void> _elegirEncargados() async {
    final iglesias = _scope == EventScope.GLOBAL
        ? widget.allChurches
        : widget.churches;
    var iglesiaId =
        _churchId ?? (iglesias.isNotEmpty ? iglesias.first.id : null);
    if (iglesiaId == null) {
      setState(() => _error = 'Primero elige la iglesia.');
      return;
    }
    var futuro = Locator.directors.listPublic(iglesiaId);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GemPalette.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                14,
                16,
                MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Encargados', style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  const Text(
                    'Marca a las personas responsables. Se toman de los '
                    'directores registrados en cada iglesia.',
                    style: TextStyle(color: GemPalette.textMuted, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  if (_scope == EventScope.GLOBAL && iglesias.length > 1)
                    DropdownButtonFormField<String>(
                      initialValue: iglesiaId,
                      decoration: const InputDecoration(
                        labelText: 'Ver encargados de',
                      ),
                      items: [
                        for (final c in iglesias)
                          DropdownMenuItem(value: c.id, child: Text(c.name)),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setSheet(() {
                          iglesiaId = v;
                          futuro = Locator.directors.listPublic(v);
                        });
                      },
                    ),
                  const SizedBox(height: 8),
                  Flexible(
                    child: FutureBuilder<List<EventDirectorRef>>(
                      future: futuro,
                      builder: (ctx, snap) {
                        if (snap.connectionState != ConnectionState.done) {
                          return const Padding(
                            padding: EdgeInsets.all(18),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        if (snap.hasError) {
                          return GemErrorBanner(
                            message: userMessageFor(snap.error!),
                          );
                        }
                        final catalogo = snap.data ?? const [];
                        if (catalogo.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.all(12),
                            child: Text(
                              'Esta iglesia todavía no tiene directores '
                              'registrados. Se agregan desde Iglesias.',
                              style: TextStyle(color: GemPalette.textMuted),
                            ),
                          );
                        }
                        return ListView(
                          shrinkWrap: true,
                          children: [
                            for (final d in catalogo)
                              CheckboxListTile(
                                value: _encargados.containsKey(d.id),
                                activeColor: GemPalette.emerald,
                                title: Text(d.displayName),
                                subtitle: d.role.isNotEmpty
                                    ? Text(d.role)
                                    : null,
                                onChanged: (v) {
                                  setState(() {
                                    if (v == true) {
                                      _encargados[d.id] = d;
                                    } else {
                                      _encargados.remove(d.id);
                                    }
                                  });
                                  setSheet(() {});
                                },
                              ),
                          ],
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Listo'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Validación y guardado ────────────────────────────────────────────────

  String? _validar() {
    if (_title.text.trim().isEmpty) return 'Escribe el nombre del evento.';
    if (_scope == EventScope.LOCAL &&
        (_churchId == null || _churchId!.isEmpty)) {
      return 'Elige la iglesia del evento.';
    }
    if (_scope == EventScope.GLOBAL && !widget.canGlobal) {
      return 'No tienes permiso para programar eventos de toda la Asociación.';
    }
    if (!_endsAt.isAfter(_startsAt)) {
      return 'La hora de fin debe ser posterior a la de inicio.';
    }
    if (_repeat != null && _until == null) {
      return 'Indica hasta qué fecha se repite.';
    }
    return null;
  }

  Map<String, dynamic>? get _repeatRule =>
      _isEditing ? null : EventService.repeatRule(_repeat, _until);

  Future<void> _revisarCruces() async {
    final problema = _validar();
    if (problema != null) {
      setState(() => _error = problema);
      return;
    }
    setState(() {
      _revisando = true;
      _error = null;
    });
    try {
      final cruces = await Locator.events.check(
        scope: _scope,
        churchId: _churchId,
        startsAt: _startsAt,
        endsAt: _endsAt,
        excludeId: widget.existing?.id,
        repeat: _repeatRule,
      );
      if (!mounted) return;
      if (cruces.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se cruza con ningún evento. Puedes guardar.'),
          ),
        );
      } else {
        await _dialogoCruces(cruces, permitirGuardar: false);
      }
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _revisando = false);
    }
  }

  /// Muestra los cruces. Devuelve true si la persona decide guardar igual.
  Future<bool> _dialogoCruces(
    List<ConflictsForDate> cruces, {
    required bool permitirGuardar,
  }) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: GemPalette.surfaceElevated,
        title: const Text('Se cruza con otros eventos'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final f in cruces) ...[
                Text(
                  '${_diaLargo(f.startsAt)} · ${_hora(f.startsAt)} – ${_hora(f.endsAt)}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                for (final c in f.conflicts)
                  Padding(
                    padding: const EdgeInsets.only(left: 8, top: 3),
                    child: Text(
                      '•  ${c.describir()}',
                      style: const TextStyle(
                        color: GemPalette.textMuted,
                        height: 1.4,
                      ),
                    ),
                  ),
                const SizedBox(height: 10),
              ],
              Text(
                permitirGuardar
                    ? 'Puedes cambiar la fecha u hora, o guardar de todos modos. '
                          'Si guardas, el cruce queda registrado y aparecerá en '
                          'los avisos hasta que se resuelva.'
                    : 'Puedes cambiar la fecha u hora antes de guardar.',
                style: const TextStyle(
                  color: GemPalette.textMuted,
                  fontSize: 12.5,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(permitirGuardar ? 'Cambiar fecha' : 'Entendido'),
          ),
          if (permitirGuardar)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: GemPalette.ruby),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar de todos modos'),
            ),
        ],
      ),
    );
    return r == true;
  }

  Future<void> _guardar({bool reconocerCruces = false}) async {
    if (_guardando) return;
    final problema = _validar();
    if (problema != null) {
      setState(() => _error = problema);
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    final title = _title.text.trim();
    final description = _description.text.trim().isEmpty
        ? null
        : _description.text.trim();
    final location = _location.text.trim().isEmpty
        ? null
        : _location.text.trim();
    final directorIds = _encargados.keys.toList();
    try {
      String mensaje;
      if (_isEditing) {
        await Locator.events.update(
          widget.existing!.id,
          title: title,
          description: description,
          type: _type,
          scope: _scope,
          churchId: _churchId,
          startsAt: _startsAt,
          endsAt: _endsAt,
          location: location,
          directorIds: directorIds,
          acknowledgeConflicts: reconocerCruces,
        );
        mensaje = 'Se guardaron los cambios de "$title".';
      } else {
        final out = await Locator.events.create(
          title: title,
          description: description,
          type: _type,
          scope: _scope,
          churchId: _churchId,
          startsAt: _startsAt,
          endsAt: _endsAt,
          location: location,
          directorIds: directorIds,
          repeat: _repeatRule,
          acknowledgeConflicts: reconocerCruces,
        );
        mensaje = out.events.length > 1
            ? 'Se programaron ${out.events.length} fechas de "$title".'
            : 'Se programó "$title".';
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(mensaje)));
      Navigator.of(context).pop(true);
    } on EventConflictException catch (e) {
      if (!mounted) return;
      setState(() => _guardando = false);
      final igual = await _dialogoCruces(e.conflicts, permitirGuardar: true);
      if (igual) await _guardar(reconocerCruces: true);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted && _guardando) setState(() => _guardando = false);
    }
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final esGlobal = _scope == EventScope.GLOBAL;
    final iglesias = esGlobal ? widget.allChurches : widget.churches;
    final iglesiaValida =
        _churchId != null && iglesias.any((c) => c.id == _churchId);

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Editar evento' : 'Nuevo evento'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                GemErrorBanner(
                  message: _error!,
                  onDismiss: () => setState(() => _error = null),
                ),
                const SizedBox(height: 10),
              ],
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _title,
                      maxLength: 200,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Nombre del evento',
                        hintText: 'Ej. Culto de jóvenes',
                      ),
                    ),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<EventType>(
                      initialValue: _type,
                      decoration: const InputDecoration(labelText: 'Tipo'),
                      items: [
                        for (final t in EventType.values)
                          DropdownMenuItem(
                            value: t,
                            child: Text(eventTypeLabel(t)),
                          ),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() {
                          _type = v;
                          // Sugerencia, no imposición: un culto unido o una
                          // asamblea suelen ser de toda la Asociación.
                          if (!_isEditing &&
                              widget.canGlobal &&
                              tiposNormalmenteGlobales.contains(v)) {
                            _scope = EventScope.GLOBAL;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 16),
                    _label('¿A quién compete?'),
                    const SizedBox(height: 6),
                    SegmentedButton<EventScope>(
                      segments: [
                        ButtonSegment(
                          value: EventScope.LOCAL,
                          label: const Text('Solo a una iglesia'),
                          icon: const Icon(Icons.church_outlined),
                          enabled: widget.churches.isNotEmpty,
                        ),
                        ButtonSegment(
                          value: EventScope.GLOBAL,
                          label: const Text('Toda la Asociación'),
                          icon: const Icon(Icons.public),
                          enabled: widget.canGlobal,
                        ),
                      ],
                      selected: {_scope},
                      onSelectionChanged: (s) => setState(() {
                        _scope = s.first;
                        if (_scope == EventScope.LOCAL &&
                            !widget.churches.any((c) => c.id == _churchId)) {
                          _churchId = widget.churches.isNotEmpty
                              ? widget.churches.first.id
                              : null;
                        }
                      }),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      esGlobal
                          ? 'Avisa si se cruza con cualquier otro evento.'
                          : widget.canGlobal
                          ? 'Avisa si se cruza con un evento de toda la Asociación.'
                          : 'Avisa si se cruza con un evento de toda la Asociación. '
                                'Los eventos de toda la Asociación los programa el '
                                'administrador principal o quien tenga el permiso.',
                      style: const TextStyle(
                        color: GemPalette.textMuted,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String?>(
                      // La clave fuerza a reconstruir el campo cuando cambia
                      // el alcance (cambia la lista de opciones).
                      key: ValueKey(
                        'iglesia-${_scope.name}-${iglesiaValida ? _churchId : ''}',
                      ),
                      initialValue: iglesiaValida ? _churchId : null,
                      decoration: InputDecoration(
                        labelText: esGlobal
                            ? 'Iglesia organizadora (opcional)'
                            : 'Iglesia',
                      ),
                      items: [
                        if (esGlobal)
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('La Asociación'),
                          ),
                        for (final c in iglesias)
                          DropdownMenuItem<String?>(
                            value: c.id,
                            child: Text(c.name),
                          ),
                      ],
                      onChanged: (v) => setState(() => _churchId = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _label('Cuándo'),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(
                        Icons.calendar_month_outlined,
                        color: GemPalette.emerald,
                      ),
                      title: const Text('Fecha'),
                      subtitle: Text(_diaLargo(_fecha)),
                      trailing: const Icon(
                        Icons.edit_calendar_outlined,
                        size: 20,
                        color: GemPalette.textMuted,
                      ),
                      onTap: () async {
                        final d = await _pickDate(_fecha);
                        if (d == null) return;
                        setState(() {
                          _fecha = DateTime(d.year, d.month, d.day);
                          if (_fechaFin != null &&
                              _fechaFin!.isBefore(_fecha)) {
                            _fechaFin = _fecha;
                          }
                          if (_until != null && _until!.isBefore(_fecha)) {
                            _until = null;
                          }
                        });
                      },
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: _HoraTile(
                            label: 'Empieza',
                            value: _inicio,
                            onTap: () async {
                              final t = await _pickTime(_inicio);
                              if (t != null) setState(() => _inicio = t);
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _HoraTile(
                            label: 'Termina',
                            value: _fin,
                            onTap: () async {
                              final t = await _pickTime(_fin);
                              if (t != null) setState(() => _fin = t);
                            },
                          ),
                        ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      activeThumbColor: GemPalette.emerald,
                      title: const Text('Termina otro día'),
                      subtitle: const Text(
                        'Intensivos, retiros, asambleas de varios días',
                      ),
                      value: _otroDia,
                      onChanged: (v) => setState(() {
                        _otroDia = v;
                        _fechaFin ??= _fecha;
                      }),
                    ),
                    if (_otroDia)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(
                          Icons.event_outlined,
                          color: GemPalette.emerald,
                        ),
                        title: const Text('Fecha en que termina'),
                        subtitle: Text(_diaLargo(_fechaFin ?? _fecha)),
                        onTap: () async {
                          final d = await _pickDate(
                            _fechaFin ?? _fecha,
                            minimo: _fecha,
                          );
                          if (d != null) {
                            setState(
                              () =>
                                  _fechaFin = DateTime(d.year, d.month, d.day),
                            );
                          }
                        },
                      ),
                    if (!_isEditing) ...[
                      const Divider(height: 22, color: GemPalette.borderSoft),
                      DropdownButtonFormField<String?>(
                        key: ValueKey('rep-${_fecha.toIso8601String()}'),
                        initialValue: _repeat,
                        decoration: const InputDecoration(
                          labelText: '¿Se repite?',
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('No, es una sola vez'),
                          ),
                          DropdownMenuItem<String?>(
                            value: 'WEEKLY',
                            child: Text('Cada semana, $_fraseSemanal'),
                          ),
                          DropdownMenuItem<String?>(
                            value: 'MONTHLY_BY_WEEKDAY',
                            child: Text('Cada mes, $_fraseMensual'),
                          ),
                        ],
                        onChanged: (v) => setState(() {
                          _repeat = v;
                          if (v != null) {
                            _until ??= DateTime(_fecha.year, 12, 31);
                          }
                        }),
                      ),
                      if (_repeat != null) ...[
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(
                            Icons.event_repeat_outlined,
                            color: GemPalette.emerald,
                          ),
                          title: const Text('Hasta qué fecha (incluida)'),
                          subtitle: Text(
                            _until == null
                                ? 'Elige la última fecha'
                                : _diaCorto(_until!),
                          ),
                          onTap: () async {
                            final d = await _pickDate(
                              _until ?? DateTime(_fecha.year, 12, 31),
                              minimo: _fecha,
                            );
                            if (d != null) {
                              setState(
                                () => _until = DateTime(d.year, d.month, d.day),
                              );
                            }
                          },
                        ),
                        const Text(
                          'Como mucho un año. Cada fecha queda como evento '
                          'propio: después se puede mover o cancelar una sola '
                          'sin tocar las demás.',
                          style: TextStyle(
                            color: GemPalette.textMuted,
                            fontSize: 12.5,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _location,
                      maxLength: 300,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Lugar (opcional)',
                        hintText: 'Ej. Templo central, salón de jóvenes',
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(child: _label('Encargados')),
                        TextButton.icon(
                          icon: const Icon(
                            Icons.person_add_alt_1_outlined,
                            size: 18,
                          ),
                          label: Text(
                            _encargados.isEmpty ? 'Elegir' : 'Cambiar',
                          ),
                          onPressed: _elegirEncargados,
                        ),
                      ],
                    ),
                    if (_encargados.isEmpty)
                      const Text(
                        'Opcional. Las personas responsables del evento.',
                        style: TextStyle(
                          color: GemPalette.textMuted,
                          fontSize: 12.5,
                        ),
                      )
                    else
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final d in _encargados.values)
                            InputChip(
                              label: Text(d.displayName),
                              onDeleted: () =>
                                  setState(() => _encargados.remove(d.id)),
                            ),
                        ],
                      ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _description,
                      maxLength: 4000,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Descripción (opcional)',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                icon: _revisando
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.rule_folder_outlined),
                label: Text(_revisando ? 'Revisando…' : 'Revisar cruces'),
                onPressed: _revisando || _guardando ? null : _revisarCruces,
              ),
              const SizedBox(height: 10),
              GemPrimaryButton(
                label: _isEditing ? 'Guardar cambios' : 'Programar',
                icon: Icons.check,
                loading: _guardando,
                onPressed: _guardando ? null : () => _guardar(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String s) => Text(
    s,
    style: const TextStyle(
      color: GemPalette.textPrimary,
      fontWeight: FontWeight.w700,
      fontSize: 13.5,
    ),
  );
}

class _HoraTile extends StatelessWidget {
  final String label;
  final TimeOfDay value;
  final VoidCallback onTap;
  const _HoraTile({
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: GemPalette.borderSoft),
          color: GemPalette.chip,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 11.5,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(Icons.schedule, size: 16, color: GemPalette.emerald),
                const SizedBox(width: 6),
                Text(
                  value.format(context),
                  style: const TextStyle(
                    color: GemPalette.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
