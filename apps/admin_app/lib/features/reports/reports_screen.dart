import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Informes por página.
const _pagina = 30;

/// Listado de informes. Agrupado por el mes del período y con la iglesia a
/// la vista, para que el principal ubique cada informe por fecha e iglesia.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<Report> _items = [];
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  ReportType? _filterType;
  bool _soloConDocumentos = false;

  /// Solo para el principal: filtrar por iglesia (null = todas).
  String? _filterChurchId;
  List<Church> _churches = [];

  int _cargaVigente = 0;

  bool get _esPrincipal => Locator.authState.account?.isRoot ?? false;

  @override
  void initState() {
    super.initState();
    if (_esPrincipal) {
      Locator.churches
          .list()
          .then((l) {
            if (mounted) setState(() => _churches = l);
          })
          .catchError((_) {});
    }
    _load();
  }

  String? get _churchQuery =>
      _esPrincipal ? _filterChurchId : Locator.authState.activeChurchId;

  Future<void> _load() async {
    final mia = ++_cargaVigente;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await Locator.reports.list(
        churchId: _churchQuery,
        type: _filterType,
        withDocuments: _soloConDocumentos,
        limit: _pagina,
      );
      if (!mounted || mia != _cargaVigente) return;
      setState(() {
        _items = res.items;
        _total = res.total;
      });
    } catch (e) {
      if (!mounted || mia != _cargaVigente) return;
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted && mia == _cargaVigente) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    final mia = _cargaVigente;
    setState(() => _loadingMore = true);
    try {
      final res = await Locator.reports.list(
        churchId: _churchQuery,
        type: _filterType,
        withDocuments: _soloConDocumentos,
        limit: _pagina,
        offset: _items.length,
      );
      if (!mounted || mia != _cargaVigente) return;
      setState(() {
        _items = [..._items, ...res.items];
        _total = res.total;
      });
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// Filas de la lista: encabezados de mes intercalados con los informes.
  List<Object> get _filas {
    final out = <Object>[];
    String? mes;
    for (final r in _items) {
      final m = mesDelPeriodoInforme(r.periodStart);
      if (m != mes) {
        out.add(m);
        mes = m;
      }
      out.add(r);
    }
    return out;
  }

  Future<void> _abrirDetalle(Report r) async {
    final cambio = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GemPalette.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _ReportDetailSheet(report: r),
    );
    if (cambio == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final filas = _filas;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const GemSectionHeader(eyebrow: 'Finanzas', title: 'Informes'),
        if (_esPrincipal)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: DropdownButtonFormField<String?>(
              initialValue: _filterChurchId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Iglesia',
                isDense: true,
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Todas las iglesias'),
                ),
                for (final c in _churches)
                  DropdownMenuItem<String?>(
                    value: c.id,
                    child: Text('${c.name} — ${c.city}'),
                  ),
              ],
              onChanged: (v) {
                setState(() => _filterChurchId = v);
                _load();
              },
            ),
          ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              _pill(
                'Con documentos',
                _soloConDocumentos,
                () => setState(() => _soloConDocumentos = !_soloConDocumentos),
              ),
              _typePill(null, 'Todos'),
              for (final t in ReportType.values)
                _typePill(t, reportTypeLabels[t] ?? t.name),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null && _items.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: GemErrorBanner(message: _error!),
                )
              : _items.isEmpty
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No hay informes para este filtro. Usa el botón "Nuevo informe" para crear el primero.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: GemPalette.textMuted),
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                    itemCount: filas.length + 1,
                    itemBuilder: (_, i) {
                      if (i == filas.length) {
                        return _items.length < _total
                            ? Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Center(
                                  child: OutlinedButton(
                                    onPressed: _loadingMore ? null : _loadMore,
                                    child: Text(
                                      _loadingMore
                                          ? 'Cargando…'
                                          : 'Cargar más (${_total - _items.length} restantes)',
                                    ),
                                  ),
                                ),
                              )
                            : const SizedBox.shrink();
                      }
                      final fila = filas[i];
                      if (fila is String) {
                        return Padding(
                          padding: EdgeInsets.only(
                            top: i == 0 ? 0 : 14,
                            bottom: 8,
                          ),
                          child: Text(
                            fila,
                            style: const TextStyle(
                              color: GemPalette.textPrimary,
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                        );
                      }
                      final r = fila as Report;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ReportTile(
                          report: r,
                          onTap: () => _abrirDetalle(r),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  Widget _pill(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Center(
        child: GemPill(
          label: label,
          selected: selected,
          onTap: () {
            onTap();
            _load();
          },
        ),
      ),
    );
  }

  Widget _typePill(ReportType? t, String label) =>
      _pill(label, _filterType == t, () => setState(() => _filterType = t));
}

Color _colorFor(ReportType t) => switch (t) {
  ReportType.OFFERINGS => GemPalette.emerald,
  ReportType.EXPENSES => GemPalette.ruby,
  ReportType.ATTENDANCE => GemPalette.sapphire,
  ReportType.EVENT => GemPalette.topaz,
  ReportType.REQUEST => GemPalette.amethyst,
  ReportType.OTHER => GemPalette.textMuted,
};

String? _describe(Report report) {
  if (report.documentOnly) return null;
  final d = report.data;
  final cop = NumberFormat.currency(
    locale: 'es-CO',
    symbol: r'$',
    decimalDigits: 0,
  );
  switch (report.reportType) {
    case ReportType.OFFERINGS:
      final v = d['totalCop'];
      return v != null ? cop.format(v) : null;
    case ReportType.EXPENSES:
      final v = d['totalCop'];
      final cat = d['category'] as String?;
      final amount = v != null ? cop.format(v) : null;
      final catLabel = cat != null
          ? expenseCategoryLabels[ExpenseCategory.values.firstWhere(
              (e) => e.name == cat,
              orElse: () => ExpenseCategory.OTHER,
            )]
          : null;
      return [catLabel, amount].whereType<String>().join(' · ');
    case ReportType.ATTENDANCE:
      final count = d['count'];
      final scope = d['scope'] == 'session' ? 'culto' : 'mensual';
      return count != null ? '$count asistentes ($scope)' : null;
    case ReportType.EVENT:
      return d['name'] as String?;
    case ReportType.REQUEST:
      final st = d['status'] as String?;
      final subj = d['subject'] as String?;
      final stLabel = st != null
          ? requestStatusLabels[RequestStatus.values.firstWhere(
              (e) => e.name == st,
              orElse: () => RequestStatus.PENDING,
            )]
          : null;
      return [subj, stLabel].whereType<String>().join(' · ');
    case ReportType.OTHER:
      final ft = d['freeText'] as String?;
      if (ft == null) return null;
      return ft.length > 80 ? '${ft.substring(0, 80)}…' : ft;
  }
}

class _ReportTile extends StatelessWidget {
  final Report report;
  final VoidCallback onTap;
  const _ReportTile({required this.report, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final resumen = _describe(report);
    final docs = report.documents.length;
    return GemCard(
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              GemBadge(
                label:
                    reportTypeLabels[report.reportType] ??
                    report.reportType.name,
                color: _colorFor(report.reportType),
              ),
              if (report.churchName != null)
                GemBadge(
                  label: report.churchName!,
                  color: GemPalette.textPrimary,
                ),
              if (report.documentOnly)
                const GemBadge(
                  label: 'Documento',
                  color: GemPalette.sapphire,
                  icon: Icons.description_outlined,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            report.title,
            style: Theme.of(context).textTheme.titleMedium,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (resumen != null && resumen.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              resumen,
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            formatPeriodoInforme(report.periodStart, report.periodEnd),
            style: const TextStyle(color: GemPalette.textMuted, fontSize: 12),
          ),
          if (docs > 0) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.attach_file,
                  size: 15,
                  color: GemPalette.emerald,
                ),
                const SizedBox(width: 4),
                Text(
                  docs == 1 ? '1 documento' : '$docs documentos',
                  style: const TextStyle(
                    color: GemPalette.emerald,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Detalle de un informe con sus documentos.
class _ReportDetailSheet extends StatefulWidget {
  final Report report;
  const _ReportDetailSheet({required this.report});

  @override
  State<_ReportDetailSheet> createState() => _ReportDetailSheetState();
}

class _ReportDetailSheetState extends State<_ReportDetailSheet> {
  late List<ReportDocument> _docs = widget.report.documents;
  String? _ocupado;
  String? _error;
  bool _cambio = false;

  Future<void> _abrir(ReportDocument d) async {
    setState(() {
      _ocupado = d.id;
      _error = null;
    });
    try {
      final url = await Locator.reports.documentUrl(widget.report.id, d.id);
      final ok = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
      if (!ok && mounted) {
        setState(() => _error = 'No se pudo abrir el documento.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  Future<void> _quitar(ReportDocument d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Quitar documento'),
        content: Text(
          '¿Quitar «${d.fileName}» de este informe? El archivo se elimina y no se puede recuperar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Quitar',
              style: TextStyle(color: GemPalette.danger),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _ocupado = d.id;
      _error = null;
    });
    try {
      await Locator.reports.deleteDocument(widget.report.id, d.id);
      if (!mounted) return;
      setState(() {
        _docs = _docs.where((x) => x.id != d.id).toList();
        _cambio = true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    final resumen = _describe(r);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_cambio);
      },
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    GemBadge(
                      label:
                          reportTypeLabels[r.reportType] ?? r.reportType.name,
                      color: _colorFor(r.reportType),
                    ),
                    if (r.churchName != null)
                      GemBadge(
                        label: r.churchName!,
                        color: GemPalette.textPrimary,
                      ),
                    if (r.documentOnly)
                      const GemBadge(
                        label: 'Entregado como documento',
                        color: GemPalette.sapphire,
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(r.title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Text(
                  'Período: ${formatPeriodoInforme(r.periodStart, r.periodEnd)}',
                  style: const TextStyle(color: GemPalette.textMuted),
                ),
                Text(
                  'Creado por ${r.createdByDisplayName}',
                  style: const TextStyle(color: GemPalette.textMuted),
                ),
                if (resumen != null && resumen.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(resumen),
                ],
                if (r.notes.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    r.notes,
                    style: const TextStyle(color: GemPalette.textMuted),
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  _docs.isEmpty ? 'Sin documentos' : 'Documentos',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                const Text(
                  'Solo los ven el administrador principal y quien los subió.',
                  style: TextStyle(color: GemPalette.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 8),
                for (final d in _docs)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
                    decoration: BoxDecoration(
                      color: GemPalette.chip,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: GemPalette.borderSoft),
                    ),
                    child: Row(
                      children: [
                        GemBadge(label: d.kindLabel, color: GemPalette.emerald),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                d.fileName,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                '${formatBytes(d.sizeBytes)} · ${d.uploadedByDisplayName}, '
                                '${DateFormat('d MMM yyyy', 'es').format(d.createdAt)}',
                                style: const TextStyle(
                                  color: GemPalette.textMuted,
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_ocupado == d.id)
                          const Padding(
                            padding: EdgeInsets.all(12),
                            child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        else ...[
                          IconButton(
                            tooltip: 'Abrir',
                            icon: const Icon(Icons.open_in_new, size: 20),
                            onPressed: () => _abrir(d),
                          ),
                          IconButton(
                            tooltip: 'Quitar',
                            icon: const Icon(
                              Icons.delete_outline,
                              size: 20,
                              color: GemPalette.danger,
                            ),
                            onPressed: () => _quitar(d),
                          ),
                        ],
                      ],
                    ),
                  ),
                if (_error != null) ...[
                  const SizedBox(height: 4),
                  GemErrorBanner(message: _error!),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
