import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/utils/montos.dart';
import '../../core/widgets/gem_widgets.dart';

class NewReportScreen extends StatefulWidget {
  const NewReportScreen({super.key});

  @override
  State<NewReportScreen> createState() => _NewReportScreenState();
}

class _NewReportScreenState extends State<NewReportScreen> {
  ReportType _type = ReportType.OFFERINGS;
  String? _churchId;
  final _title = TextEditingController();
  final _notes = TextEditingController();
  DateTime? _periodStart;
  DateTime? _periodEnd;
  bool _submitting = false;
  String? _error;

  // type-specific
  final _totalCop = TextEditingController();
  ExpenseCategory _expCat = ExpenseCategory.PURCHASE;
  final _expDesc = TextEditingController();
  AttendanceScope _scope = AttendanceScope.month;
  DateTime? _sessionDate;
  final _count = TextEditingController();
  final _eventName = TextEditingController();
  final _eventAttendees = TextEditingController();
  final _eventSummary = TextEditingController();
  final _reqSubject = TextEditingController();
  RequestStatus _reqStatus = RequestStatus.PENDING;
  final _reqBody = TextEditingController();
  final _freeText = TextEditingController();

  List<Church> _churches = [];

  /// El informe se entrega como documento (PDF, foto, Word o Excel) en vez
  /// de llenar los campos.
  bool _soloDocumento = false;

  /// Documentos por subir después de guardar el informe.
  final List<({String path, String name, int size})> _archivos = [];

  /// Revisa y agrega un archivo. Devuelve el motivo si no sirve.
  String? _agregarArchivo(String path, String name, int size) {
    final punto = name.lastIndexOf('.');
    final ext = punto >= 0 ? name.substring(punto + 1).toLowerCase() : '';
    if (!reportDocumentExtensions.contains(ext)) {
      return '«$name» no es un tipo permitido. Se aceptan PDF, imágenes, '
          'Word y Excel.';
    }
    if (size <= 0) return '«$name» está vacío.';
    if (size > maxReportDocumentBytes) {
      return '«$name» pesa ${formatBytes(size)}; el máximo es 10 MB.';
    }
    if (_archivos.length >= 10) {
      return 'Un informe admite hasta 10 documentos.';
    }
    _archivos.add((path: path, name: name, size: size));
    return null;
  }

  Future<void> _elegirArchivos() async {
    try {
      final res = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        type: FileType.custom,
        allowedExtensions: reportDocumentExtensions,
      );
      if (res == null) return;
      String? problema;
      for (final f in res.files) {
        if (f.path == null) continue;
        problema = _agregarArchivo(f.path!, f.name, f.size) ?? problema;
      }
      setState(() => _error = problema);
    } catch (_) {
      setState(() => _error = 'No se pudo abrir el selector de archivos.');
    }
  }

  /// Foto del soporte (recibo, factura, planilla) con la cámara.
  Future<void> _tomarFoto() async {
    try {
      final foto = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 2400,
      );
      if (foto == null) return;
      final nombre =
          'Foto ${DateFormat('yyyy-MM-dd HH.mm', 'es').format(DateTime.now())}.jpg';
      final problema = _agregarArchivo(foto.path, nombre, await foto.length());
      setState(() => _error = problema);
    } catch (_) {
      setState(() => _error = 'No se pudo usar la cámara.');
    }
  }

  @override
  void initState() {
    super.initState();
    _churchId = Locator.authState.activeChurchId;
    if (Locator.authState.account?.isRoot ?? false) {
      Locator.churches.list().then((l) {
        if (mounted) setState(() => _churches = l);
      });
    }
  }

  @override
  void dispose() {
    for (final c in [
      _title,
      _notes,
      _totalCop,
      _expDesc,
      _count,
      _eventName,
      _eventAttendees,
      _eventSummary,
      _reqSubject,
      _reqBody,
      _freeText,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate(
    BuildContext ctx,
    void Function(DateTime) onPick,
  ) async {
    final res = await showDatePicker(
      context: ctx,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      initialDate: DateTime.now(),
      builder: (c, child) => Theme(
        data: Theme.of(c).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: GemPalette.sapphire,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (res != null) onPick(res);
  }

  /// Revisa los campos numéricos propios de cada tipo de informe.
  ///
  /// Devuelve el mensaje a mostrar, o null si todo está en orden.
  String? _validarCampos() {
    switch (_type) {
      case ReportType.OFFERINGS:
      case ReportType.EXPENSES:
        final etiqueta = _type == ReportType.OFFERINGS
            ? 'total de ofrendas'
            : 'total del gasto';
        if (_totalCop.text.trim().isEmpty) {
          return 'Indica el $etiqueta.';
        }
        final monto = parseMonto(_totalCop.text);
        if (monto == null) {
          return 'No entiendo el $etiqueta. Escríbelo sólo con números, '
              'por ejemplo 50000 o 50.000.';
        }
        if (monto < 0) {
          return 'El $etiqueta no puede ser negativo.';
        }
        return null;
      case ReportType.ATTENDANCE:
        if (_count.text.trim().isEmpty) {
          return 'Indica el número de asistentes.';
        }
        final cantidad = parseCantidad(_count.text);
        if (cantidad == null || cantidad < 0) {
          return 'El número de asistentes debe ser un número entero.';
        }
        if (_scope == AttendanceScope.session && _sessionDate == null) {
          return 'Indica la fecha de la reunión.';
        }
        return null;
      case ReportType.EVENT:
        if (_eventName.text.trim().isEmpty) {
          return 'Indica el nombre del evento.';
        }
        if (_eventAttendees.text.trim().isNotEmpty &&
            parseCantidad(_eventAttendees.text) == null) {
          return 'El número de asistentes al evento debe ser un número entero.';
        }
        return null;
      case ReportType.REQUEST:
      case ReportType.OTHER:
        return null;
    }
  }

  Map<String, dynamic> _buildData() {
    switch (_type) {
      case ReportType.OFFERINGS:
        return {'totalCop': parseMonto(_totalCop.text) ?? 0};
      case ReportType.EXPENSES:
        return {
          'totalCop': parseMonto(_totalCop.text) ?? 0,
          'category': _expCat.name,
          if (_expDesc.text.trim().isNotEmpty)
            'description': _expDesc.text.trim(),
        };
      case ReportType.ATTENDANCE:
        return {
          'scope': _scope.name,
          'count': parseCantidad(_count.text) ?? 0,
          if (_scope == AttendanceScope.session && _sessionDate != null)
            'sessionDate': _sessionDate!.toIso8601String(),
        };
      case ReportType.EVENT:
        return {
          'name': _eventName.text.trim(),
          if (_eventAttendees.text.trim().isNotEmpty)
            'attendees': parseCantidad(_eventAttendees.text),
          if (_eventSummary.text.trim().isNotEmpty)
            'summary': _eventSummary.text.trim(),
        };
      case ReportType.REQUEST:
        return {
          'subject': _reqSubject.text.trim(),
          'status': _reqStatus.name,
          if (_reqBody.text.trim().isNotEmpty) 'body': _reqBody.text.trim(),
        };
      case ReportType.OTHER:
        return {'freeText': _freeText.text.trim()};
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (_churchId == null || _churchId!.isEmpty) {
      setState(() => _error = 'Selecciona la iglesia.');
      return;
    }
    if (_title.text.trim().isEmpty) {
      setState(() => _error = 'El título es obligatorio.');
      return;
    }
    if (_periodStart == null || _periodEnd == null) {
      setState(() => _error = 'Indica el período del informe.');
      return;
    }
    if (_periodEnd!.isBefore(_periodStart!)) {
      setState(
        () => _error =
            'La fecha final del período no puede ser anterior a la inicial.',
      );
      return;
    }

    if (_soloDocumento) {
      if (_archivos.isEmpty) {
        setState(
          () => _error =
              'Adjunta el documento del informe: un PDF, una foto, un Word o '
              'un Excel.',
        );
        return;
      }
    } else {
      // Los montos y cantidades se validan aquí para no guardar un cero en
      // silencio cuando el texto no se puede leer (el teclado en español
      // ofrece coma, y "50.000" o "50000,50" no los entiende double.tryParse).
      final erroresDeCampo = _validarCampos();
      if (erroresDeCampo != null) {
        setState(() => _error = erroresDeCampo);
        return;
      }
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    Report creado;
    try {
      creado = await Locator.reports.create(
        churchId: _churchId!,
        type: _type,
        title: _title.text.trim(),
        notes: _notes.text.trim().isNotEmpty ? _notes.text.trim() : null,
        periodStart: _periodStart!,
        periodEnd: _periodEnd!,
        data: _soloDocumento ? {'documentOnly': true} : _buildData(),
      );
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _submitting = false;
      });
      return;
    } catch (_) {
      setState(() {
        _error = 'No se pudo guardar el informe.';
        _submitting = false;
      });
      return;
    }

    var mensaje = 'Informe creado.';
    if (_archivos.isNotEmpty) {
      try {
        await Locator.reports.uploadDocuments(creado.id, [
          for (final a in _archivos) (path: a.path, name: a.name),
        ]);
        mensaje = _archivos.length == 1
            ? 'Informe creado con su documento.'
            : 'Informe creado con ${_archivos.length} documentos.';
      } catch (e) {
        final motivo = userMessageFor(e);
        if (_soloDocumento) {
          // Sin su documento el informe queda vacío: se retira.
          try {
            await Locator.reports.delete(creado.id);
          } catch (_) {}
          if (!mounted) return;
          setState(() {
            _error =
                'No se guardó el informe porque el documento no se pudo subir. $motivo';
            _submitting = false;
          });
          return;
        }
        mensaje =
            'El informe se guardó, pero los documentos no se subieron. $motivo '
            'Puedes adjuntarlos desde el panel web.';
      }
    }

    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(mensaje)));
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final isRoot = Locator.authState.account?.isRoot ?? false;
    final assignments = Locator.authState.account?.churchAssignments ?? [];

    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo informe')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _label('Tipo de informe'),
                DropdownButtonFormField<ReportType>(
                  initialValue: _type,
                  items: [
                    for (final t in ReportType.values)
                      DropdownMenuItem(
                        value: t,
                        child: Text(reportTypeLabels[t] ?? t.name),
                      ),
                  ],
                  onChanged: (v) => setState(() => _type = v ?? _type),
                ),
                const SizedBox(height: 14),
                _label('Iglesia'),
                if (isRoot)
                  DropdownButtonFormField<String>(
                    initialValue: _churchId,
                    isExpanded: true,
                    items: [
                      for (final c in _churches)
                        DropdownMenuItem(
                          value: c.id,
                          child: Text('${c.name} — ${c.city}'),
                        ),
                    ],
                    onChanged: (v) => setState(() => _churchId = v),
                  )
                else if (assignments.length > 1)
                  DropdownButtonFormField<String>(
                    initialValue: _churchId,
                    isExpanded: true,
                    items: [
                      for (final a in assignments)
                        DropdownMenuItem(
                          value: a.churchId,
                          child: Text(a.churchName ?? a.churchId),
                        ),
                    ],
                    onChanged: (v) => setState(() => _churchId = v),
                  )
                else
                  // Sólo muestra el nombre; antes era un campo deshabilitado
                  // con un controlador creado dentro del build, que se
                  // instanciaba en cada repintado y nunca se liberaba.
                  InputDecorator(
                    decoration: const InputDecoration(),
                    child: Text(
                      assignments.isNotEmpty
                          ? (assignments.first.churchName ?? '—')
                          : 'Sin iglesia asignada',
                      style: const TextStyle(color: GemPalette.textMuted),
                    ),
                  ),
                const SizedBox(height: 14),
                _label('Título'),
                TextField(controller: _title, maxLength: 180),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _pickDate(
                          context,
                          (d) => setState(() => _periodStart = d),
                        ),
                        child: Text(
                          _periodStart != null
                              ? 'Desde: ${DateFormat('d MMM yyyy', 'es').format(_periodStart!)}'
                              : 'Período desde…',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _pickDate(
                          context,
                          (d) => setState(() => _periodEnd = d),
                        ),
                        child: Text(
                          _periodEnd != null
                              ? 'Hasta: ${DateFormat('d MMM yyyy', 'es').format(_periodEnd!)}'
                              : 'Período hasta…',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _label('¿Cómo vas a entregar este informe?'),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                      value: false,
                      label: Text('Formulario'),
                      icon: Icon(Icons.edit_note),
                    ),
                    ButtonSegment(
                      value: true,
                      label: Text('Documento'),
                      icon: Icon(Icons.description_outlined),
                    ),
                  ],
                  selected: {_soloDocumento},
                  onSelectionChanged: (s) =>
                      setState(() => _soloDocumento = s.first),
                ),
                const SizedBox(height: 6),
                Text(
                  _soloDocumento
                      ? 'Subes el informe ya hecho: un PDF, una foto, un Word '
                            'o un Excel.'
                      : 'Escribes los montos o datos aquí mismo.',
                  style: const TextStyle(
                    color: GemPalette.textMuted,
                    fontSize: 12.5,
                  ),
                ),
                if (!_soloDocumento) ...[
                  const SizedBox(height: 14),
                  _label('Datos del informe'),
                  ..._typeFields(),
                ],
                const SizedBox(height: 14),
                _label(
                  _soloDocumento
                      ? 'Documento del informe'
                      : 'Documentos de soporte (opcional)',
                ),
                const Text(
                  'Hasta 10 MB cada uno. Solo los ven el administrador '
                  'principal y quien los sube.',
                  style: TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
                ),
                const SizedBox(height: 8),
                for (var i = 0; i < _archivos.length; i++)
                  Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
                    decoration: BoxDecoration(
                      color: GemPalette.chip,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: GemPalette.borderSoft),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.insert_drive_file_outlined,
                          size: 18,
                          color: GemPalette.emerald,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _archivos[i].name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                formatBytes(_archivos[i].size),
                                style: const TextStyle(
                                  color: GemPalette.textMuted,
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Quitar',
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: _submitting
                              ? null
                              : () => setState(() => _archivos.removeAt(i)),
                        ),
                      ],
                    ),
                  ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _submitting ? null : _elegirArchivos,
                      icon: const Icon(Icons.attach_file, size: 18),
                      label: const Text('Elegir archivo'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _submitting ? null : _tomarFoto,
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Tomar foto'),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _label('Notas (opcional)'),
                TextField(controller: _notes, maxLines: 3, maxLength: 4000),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  GemErrorBanner(message: _error!),
                ],
                const SizedBox(height: 16),
                GemPrimaryButton(
                  label: 'Guardar informe',
                  loading: _submitting,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(top: 6, bottom: 6),
    child: Text(
      text,
      style: const TextStyle(
        fontWeight: FontWeight.w700,
        color: GemPalette.textPrimary,
        fontSize: 13,
      ),
    ),
  );

  List<Widget> _typeFields() {
    switch (_type) {
      case ReportType.OFFERINGS:
        return [
          TextField(
            controller: _totalCop,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Total ofrendas (COP)',
            ),
          ),
        ];
      case ReportType.EXPENSES:
        return [
          TextField(
            controller: _totalCop,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Total gasto (COP)'),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<ExpenseCategory>(
            initialValue: _expCat,
            decoration: const InputDecoration(labelText: 'Categoría'),
            items: [
              for (final c in ExpenseCategory.values)
                DropdownMenuItem(
                  value: c,
                  child: Text(expenseCategoryLabels[c] ?? c.name),
                ),
            ],
            onChanged: (v) => setState(() => _expCat = v ?? _expCat),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _expDesc,
            decoration: const InputDecoration(labelText: 'Descripción breve'),
            maxLines: 2,
            maxLength: 2000,
          ),
        ];
      case ReportType.ATTENDANCE:
        return [
          DropdownButtonFormField<AttendanceScope>(
            initialValue: _scope,
            decoration: const InputDecoration(labelText: 'Alcance'),
            items: const [
              DropdownMenuItem(
                value: AttendanceScope.month,
                child: Text('Acumulado mensual'),
              ),
              DropdownMenuItem(
                value: AttendanceScope.session,
                child: Text('Culto / sesión específica'),
              ),
            ],
            onChanged: (v) => setState(() => _scope = v ?? _scope),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _count,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Número de asistentes',
            ),
          ),
          if (_scope == AttendanceScope.session) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () =>
                  _pickDate(context, (d) => setState(() => _sessionDate = d)),
              child: Text(
                _sessionDate != null
                    ? 'Sesión: ${DateFormat('d MMM yyyy', 'es').format(_sessionDate!)}'
                    : 'Fecha del culto / sesión…',
              ),
            ),
          ],
        ];
      case ReportType.EVENT:
        return [
          TextField(
            controller: _eventName,
            decoration: const InputDecoration(labelText: 'Nombre del evento'),
            maxLength: 200,
          ),
          TextField(
            controller: _eventAttendees,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Asistentes (opcional)',
            ),
          ),
          TextField(
            controller: _eventSummary,
            decoration: const InputDecoration(
              labelText: 'Resumen / observaciones',
            ),
            maxLines: 3,
            maxLength: 2000,
          ),
        ];
      case ReportType.REQUEST:
        return [
          TextField(
            controller: _reqSubject,
            decoration: const InputDecoration(labelText: 'Asunto'),
            maxLength: 180,
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<RequestStatus>(
            initialValue: _reqStatus,
            decoration: const InputDecoration(labelText: 'Estado'),
            items: [
              for (final s in RequestStatus.values)
                DropdownMenuItem(
                  value: s,
                  child: Text(requestStatusLabels[s] ?? s.name),
                ),
            ],
            onChanged: (v) => setState(() => _reqStatus = v ?? _reqStatus),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _reqBody,
            decoration: const InputDecoration(labelText: 'Detalle'),
            maxLines: 4,
            maxLength: 4000,
          ),
        ];
      case ReportType.OTHER:
        return [
          TextField(
            controller: _freeText,
            decoration: const InputDecoration(labelText: 'Detalle libre'),
            maxLines: 5,
            maxLength: 8000,
          ),
        ];
    }
  }
}
