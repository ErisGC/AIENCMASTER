import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:showcaseview/showcaseview.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/coach_card.dart';
import '../../core/widgets/gem_widgets.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    this.showcaseKey,
    this.coachCard,
    this.onReplayTutorial,
  });

  /// Clave del spotlight del tutorial sobre la cabecera del panel. Si es null,
  /// la cabecera se renderiza sin envoltura de showcase.
  final GlobalKey? showcaseKey;

  /// Tarjeta del recorrido que se muestra al iluminar la cabecera. La arma el
  /// HomeShell (consciente de rol e iglesia) para centralizar el texto.
  final Widget? coachCard;

  /// Reinvoca el tutorial manualmente (botón de ayuda de la cabecera).
  final VoidCallback? onReplayTutorial;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  MetricsTimeline? _metrics;
  bool _loading = true;
  String? _error;

  DateTime _from =
      DateTime(DateTime.now().year, DateTime.now().month - 5, 1);
  DateTime _to = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final m = await Locator.reports.metrics(
        churchId: Locator.authState.activeChurchId,
        fromDate: _from,
        toDate: _to,
      );
      setState(() => _metrics = m);
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = _metrics;
    final offerings = m == null
        ? 0.0
        : m.offerings.fold<double>(0, (a, p) => a + p.total);
    final expenses = m == null
        ? 0.0
        : m.expenses.fold<double>(0, (a, p) => a + p.total);
    final attendance = m == null
        ? 0
        : m.attendance.fold<int>(0, (a, p) => a + p.total.toInt());
    final net = offerings - expenses;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
        children: [
          _buildHeader(context),
          if (_error != null) ...[
            const SizedBox(height: 8),
            GemErrorBanner(message: _error!),
          ],
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.6,
            children: [
              KpiTile(
                label: 'Ofrendas',
                value: _formatCop(offerings),
                subtitle: 'Total del período',
                borderGradient: GemPalette.sapphireEmeraldGradient,
                icon: Icons.savings_outlined,
              ),
              KpiTile(
                label: 'Egresos',
                value: _formatCop(expenses),
                subtitle: 'Gastos reportados',
                borderGradient: const LinearGradient(
                  colors: [GemPalette.ruby, GemPalette.topaz],
                ),
                icon: Icons.payments_outlined,
              ),
              KpiTile(
                label: 'Balance',
                value: _formatCop(net),
                subtitle: 'Ofrendas − egresos',
                borderGradient: const LinearGradient(
                  colors: [GemPalette.topaz, GemPalette.emerald],
                ),
                icon: Icons.account_balance_wallet_outlined,
              ),
              KpiTile(
                label: 'Asistencia',
                value: NumberFormat.decimalPattern('es').format(attendance),
                subtitle: 'Suma del período',
                borderGradient: const LinearGradient(
                  colors: [GemPalette.sapphire, GemPalette.amethyst],
                ),
                icon: Icons.group_outlined,
              ),
            ],
          ),
          const SizedBox(height: 20),
          GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Ofrendas vs Egresos por mes',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 14),
                SizedBox(
                  height: 220,
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : m == null || _monthlyData(m).isEmpty
                          ? _emptyChart()
                          : _buildBarChart(_monthlyData(m)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Asistencia mensual',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 14),
                SizedBox(
                  height: 200,
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : m == null || _monthlyData(m).isEmpty
                          ? _emptyChart()
                          : _buildLineChart(_monthlyData(m)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final hasReplay = widget.onReplayTutorial != null;
    final header = GemSectionHeader(
      eyebrow: 'Panel',
      title: 'Resumen',
      subtitle:
          '${DateFormat('MMM yyyy', 'es').format(_from)} – ${DateFormat('MMM yyyy', 'es').format(_to)}',
      margin: EdgeInsets.zero,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasReplay)
            IconButton(
              icon: const Icon(Icons.help_outline),
              onPressed: widget.onReplayTutorial,
              tooltip: 'Ver el tutorial',
            ),
          IconButton(
            icon: const Icon(Icons.tune_outlined),
            onPressed: _pickRange,
            tooltip: 'Rango de fechas',
          ),
        ],
      ),
    );

    if (widget.showcaseKey != null && widget.coachCard != null) {
      return Showcase.withWidget(
        key: widget.showcaseKey!,
        height: coachHeight(context),
        width: coachWidth(context),
        container: widget.coachCard!,
        child: header,
      );
    }
    return header;
  }

  Widget _emptyChart() => const Center(
        child: Text(
          'Sin datos en este rango',
          style: TextStyle(color: GemPalette.textMuted),
        ),
      );

  List<_MonthlyRow> _monthlyData(MetricsTimeline m) {
    final map = <String, _MonthlyRow>{};
    for (final p in m.offerings) {
      map.putIfAbsent(p.month, () => _MonthlyRow(month: p.month)).offerings = p.total;
    }
    for (final p in m.expenses) {
      map.putIfAbsent(p.month, () => _MonthlyRow(month: p.month)).expenses = p.total;
    }
    for (final p in m.attendance) {
      map.putIfAbsent(p.month, () => _MonthlyRow(month: p.month)).attendance = p.total;
    }
    final list = map.values.toList()
      ..sort((a, b) => a.month.compareTo(b.month));
    return list;
  }

  Widget _buildBarChart(List<_MonthlyRow> data) {
    final maxV = data
        .map((r) => [r.offerings, r.expenses])
        .expand((e) => e)
        .fold<double>(1, (m, v) => v > m ? v : m);
    return BarChart(BarChartData(
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        getDrawingHorizontalLine: (_) => FlLine(
          color: GemPalette.borderSoft.withValues(alpha: 0.4),
          strokeWidth: 1,
        ),
      ),
      borderData: FlBorderData(show: false),
      maxY: maxV * 1.15,
      titlesData: FlTitlesData(
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 44,
            getTitlesWidget: (v, _) => Text(
              _shortCop(v),
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 10,
              ),
            ),
          ),
        ),
        rightTitles: const AxisTitles(),
        topTitles: const AxisTitles(),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 28,
            getTitlesWidget: (v, _) {
              final idx = v.toInt();
              if (idx < 0 || idx >= data.length) return const SizedBox();
              return Text(
                _formatMonth(data[idx].month),
                style: const TextStyle(
                  color: GemPalette.textMuted,
                  fontSize: 10,
                ),
              );
            },
          ),
        ),
      ),
      barGroups: [
        for (var i = 0; i < data.length; i++)
          BarChartGroupData(
            x: i,
            barRods: [
              BarChartRodData(
                toY: data[i].offerings,
                color: GemPalette.emerald,
                width: 10,
                borderRadius: BorderRadius.circular(3),
              ),
              BarChartRodData(
                toY: data[i].expenses,
                color: GemPalette.ruby,
                width: 10,
                borderRadius: BorderRadius.circular(3),
              ),
            ],
          ),
      ],
    ));
  }

  Widget _buildLineChart(List<_MonthlyRow> data) {
    final maxV = data
        .map((r) => r.attendance)
        .fold<double>(1, (m, v) => v > m ? v : m);
    final spots = [
      for (var i = 0; i < data.length; i++) FlSpot(i.toDouble(), data[i].attendance),
    ];
    return LineChart(LineChartData(
      maxY: maxV * 1.2,
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        getDrawingHorizontalLine: (_) => FlLine(
          color: GemPalette.borderSoft.withValues(alpha: 0.4),
          strokeWidth: 1,
        ),
      ),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 30,
            getTitlesWidget: (v, _) => Text(
              v.toInt().toString(),
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 10,
              ),
            ),
          ),
        ),
        rightTitles: const AxisTitles(),
        topTitles: const AxisTitles(),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 26,
            getTitlesWidget: (v, _) {
              final idx = v.toInt();
              if (idx < 0 || idx >= data.length) return const SizedBox();
              return Text(_formatMonth(data[idx].month),
                  style: const TextStyle(
                      color: GemPalette.textMuted, fontSize: 10));
            },
          ),
        ),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots,
          isCurved: true,
          color: GemPalette.sapphire,
          barWidth: 3,
          dotData: const FlDotData(show: true),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                GemPalette.sapphire.withValues(alpha: 0.35),
                GemPalette.sapphire.withValues(alpha: 0.0),
              ],
            ),
          ),
        ),
      ],
    ));
  }

  Future<void> _pickRange() async {
    final res = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      initialDateRange: DateTimeRange(start: _from, end: _to),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: GemPalette.sapphire,
            onPrimary: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (res != null) {
      setState(() {
        _from = res.start;
        _to = res.end;
      });
      _load();
    }
  }

  String _formatMonth(String yyyyMm) {
    final parts = yyyyMm.split('-');
    if (parts.length != 2) return yyyyMm;
    final y = int.tryParse(parts[0]) ?? 2026;
    final mo = int.tryParse(parts[1]) ?? 1;
    return DateFormat('MMM', 'es').format(DateTime(y, mo));
  }

  String _formatCop(double v) =>
      NumberFormat.currency(locale: 'es-CO', symbol: r'$', decimalDigits: 0)
          .format(v);

  String _shortCop(double v) {
    if (v.abs() >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v.abs() >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }
}

class _MonthlyRow {
  final String month;
  double offerings = 0;
  double expenses = 0;
  double attendance = 0;
  _MonthlyRow({required this.month});
}
