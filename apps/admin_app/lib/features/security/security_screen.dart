import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import 'account_permissions_screen.dart';
import 'invitations_screen.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({
    super.key,
    this.tutorialStep = 0,
    this.tutorialTotal = 0,
    this.onRestartTutorial,
    this.onContinueTutorial,
  });

  /// Paso por el que va el tutorial guiado y total de pasos, para ofrecer
  /// "continuar" sólo cuando quedó a medias.
  final int tutorialStep;
  final int tutorialTotal;
  final VoidCallback? onRestartTutorial;
  final VoidCallback? onContinueTutorial;

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  List<AdminAccount> _accounts = [];
  bool _loading = true;
  String? _error;

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
      final list = await Locator.security.listAccounts();
      if (mounted) setState(() => _accounts = list);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GemSectionHeader(
          eyebrow: 'Acceso',
          title: 'Seguridad',
          trailing: IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Cerrar sesión'),
                  content: const Text(
                      '¿Seguro que quieres salir? Tendrás que volver a iniciar sesión.'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancelar'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Salir'),
                    ),
                  ],
                ),
              );
              if (ok == true) {
                await Locator.authState.signOut();
                if (!context.mounted) return;
                context.go('/welcome');
              }
            },
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null && _accounts.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: GemErrorBanner(message: _error!),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                        children: [
                          GemCard(
                            onTap: () async {
                              await Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const InvitationsScreen(),
                                ),
                              );
                              if (mounted) await _load();
                            },
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    gradient: GemPalette
                                        .sapphireEmeraldGradient,
                                  ),
                                  alignment: Alignment.center,
                                  child: const Icon(Icons.mail_outline_rounded,
                                      color: Colors.white),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('Invitaciones',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium),
                                      const Text(
                                        'Generar enlaces para nuevos administradores y revocar los pendientes',
                                        style: TextStyle(
                                            color: GemPalette.textMuted,
                                            fontSize: 12.5,
                                            height: 1.35),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    color: GemPalette.textMuted),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                          GemCard(
                            onTap: () => context.push('/setup-lock'),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    gradient: const LinearGradient(
                                      colors: [
                                        GemPalette.emerald,
                                        GemPalette.sapphire,
                                      ],
                                    ),
                                  ),
                                  alignment: Alignment.center,
                                  child: const Icon(Icons.fingerprint,
                                      color: Colors.white),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('Protección de la app',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium),
                                      const Text(
                                        'Entra con tu huella, con un PIN, o sin clave. Puedes cambiarlo cuando quieras',
                                        style: TextStyle(
                                            color: GemPalette.textMuted,
                                            fontSize: 12.5,
                                            height: 1.35),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    color: GemPalette.textMuted),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                          _buildTutorialCard(),
                          const SizedBox(height: 10),
                          GemCard(
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const _GlobalAuditScreen(),
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(12),
                                    gradient: const LinearGradient(
                                      colors: [
                                        GemPalette.amethyst,
                                        GemPalette.sapphire,
                                      ],
                                    ),
                                  ),
                                  alignment: Alignment.center,
                                  child: const Icon(Icons.fact_check_outlined,
                                      color: Colors.white),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('Historial de auditoría',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium),
                                      const Text(
                                        'Registro de todas las acciones del sistema, con su autor y fecha',
                                        style: TextStyle(
                                            color: GemPalette.textMuted,
                                            fontSize: 12.5,
                                            height: 1.35),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    color: GemPalette.textMuted),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Text('Administradores',
                                style: Theme.of(context).textTheme.titleMedium),
                          ),
                          const SizedBox(height: 6),
                          for (final a in _accounts) _accountTile(a),
                        ],
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _accountTile(AdminAccount a) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        padding: const EdgeInsets.all(14),
        onTap: () => _openHistory(a),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: GemPalette.sapphireWeak,
              child: Text(
                a.displayName.isNotEmpty
                    ? a.displayName.substring(0, 1).toUpperCase()
                    : '?',
                style: const TextStyle(
                    color: GemPalette.textPrimary,
                    fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.displayName,
                      style: Theme.of(context).textTheme.titleMedium),
                  Text('@${a.username}',
                      style: const TextStyle(
                          color: GemPalette.textMuted, fontSize: 12)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      GemBadge(
                        label: roleShortLabel(a.role),
                        color: a.role == 'ROOT'
                            ? GemPalette.amethyst
                            : GemPalette.sapphire,
                      ),
                      if (!a.isActive)
                        const GemBadge(
                            label: 'Inactiva', color: GemPalette.danger),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: GemPalette.textMuted),
          ],
        ),
      ),
    );
  }

  Future<void> _openHistory(AdminAccount a) async {
    final action = await showModalBottomSheet<_AccountAction>(
      context: context,
      backgroundColor: GemPalette.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: GemPalette.borderSoft,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                a.displayName,
                style: Theme.of(ctx).textTheme.titleLarge,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Ver historial'),
              onTap: () =>
                  Navigator.pop(ctx, _AccountAction.history),
            ),
            if (!a.isRoot)
              ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: const Text('Gestionar permisos'),
                onTap: () =>
                    Navigator.pop(ctx, _AccountAction.permissions),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (action) {
      case _AccountAction.history:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => _AccountHistoryScreen(accountId: a.id),
          ),
        );
        break;
      case _AccountAction.permissions:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AccountPermissionsScreen(accountId: a.id),
          ),
        );
        if (mounted) await _load();
        break;
      case null:
        break;
    }
  }

  /// Tarjeta del tutorial guiado: permite reanudarlo donde quedó o repetirlo
  /// completo en cualquier momento.
  Widget _buildTutorialCard() {
    final total = widget.tutorialTotal;
    final paso = widget.tutorialStep;
    // Sólo tiene sentido "continuar" si quedó a medias (ni al inicio ni al fin).
    final puedeContinuar =
        widget.onContinueTutorial != null && paso > 0 && paso < total;

    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: const LinearGradient(
                    colors: [GemPalette.topaz, GemPalette.amethyst],
                  ),
                ),
                alignment: Alignment.center,
                child: const Icon(Icons.school_outlined, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Tutorial guiado',
                        style: Theme.of(context).textTheme.titleMedium),
                    Text(
                      puedeContinuar
                          ? 'Lo dejaste en el paso $paso de $total'
                          : 'Un recorrido corto por las secciones de la app',
                      style: const TextStyle(
                          color: GemPalette.textMuted,
                          fontSize: 12.5,
                          height: 1.35),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              if (puedeContinuar) ...[
                TextButton.icon(
                  icon: const Icon(Icons.play_arrow_rounded, size: 18),
                  label: const Text('Continuar'),
                  onPressed: widget.onContinueTutorial,
                ),
                const SizedBox(width: 4),
              ],
              TextButton.icon(
                icon: const Icon(Icons.replay_rounded, size: 18),
                label: const Text('Repetir desde el inicio'),
                onPressed: widget.onRestartTutorial,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _AccountAction { history, permissions }

class _AccountHistoryScreen extends StatefulWidget {
  final String accountId;
  const _AccountHistoryScreen({required this.accountId});

  @override
  State<_AccountHistoryScreen> createState() => _AccountHistoryScreenState();
}

class _AccountHistoryScreenState extends State<_AccountHistoryScreen> {
  AccountHistoryResponse? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    Locator.security
        .accountHistory(widget.accountId)
        .then((d) {
          if (mounted) setState(() => _data = d);
        })
        .catchError((e) {
          if (mounted) setState(() => _error = userMessageFor(e));
        })
        .whenComplete(() {
          if (mounted) setState(() => _loading = false);
        });
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Historial')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: GemErrorBanner(message: _error!),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemCount: d?.actions.length ?? 0,
                  itemBuilder: (_, i) {
                    final a = d!.actions[i];
                    return GemCard(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            actionTypeLabel(a.actionType),
                            style: const TextStyle(
                              color: GemPalette.emerald,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              letterSpacing: 0.4,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(a.description),
                          const SizedBox(height: 6),
                          Text(
                            DateFormat("d 'de' MMMM yyyy, HH:mm", 'es')
                                .format(a.createdAt.toLocal()),
                            style: const TextStyle(
                                color: GemPalette.textMuted, fontSize: 11),
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}

/// Historial de auditoría GLOBAL: todas las acciones del sistema, agrupadas
/// por día y con el autor de cada acción.
class _GlobalAuditScreen extends StatefulWidget {
  const _GlobalAuditScreen();

  @override
  State<_GlobalAuditScreen> createState() => _GlobalAuditScreenState();
}

class _GlobalAuditScreenState extends State<_GlobalAuditScreen> {
  List<AuditLogEntry> _items = [];
  bool _loading = true;
  String? _error;

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
      final list = await Locator.security.auditLogs();
      if (mounted) setState(() => _items = list);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Agrupa por día (más reciente primero), preservando el orden interno.
  Map<String, List<AuditLogEntry>> _grouped() {
    final fmt = DateFormat("EEEE d 'de' MMMM yyyy", 'es');
    final map = <String, List<AuditLogEntry>>{};
    for (final e in _items) {
      final key = fmt.format(e.createdAt.toLocal());
      (map[key] ??= []).add(e);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Historial de auditoría')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: GemErrorBanner(message: _error!),
                )
              : _items.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Aún no hay acciones registradas.',
                          style: TextStyle(color: GemPalette.textMuted),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                        children: [
                          for (final entry in _grouped().entries) ...[
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(4, 8, 4, 8),
                              child: Text(
                                entry.key,
                                style: const TextStyle(
                                  color: GemPalette.textMuted,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  letterSpacing: 0.3,
                                ),
                              ),
                            ),
                            for (final a in entry.value) ...[
                              GemCard(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      actionTypeLabel(a.actionType),
                                      style: const TextStyle(
                                        color: GemPalette.emerald,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12,
                                        letterSpacing: 0.4,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(a.description),
                                    const SizedBox(height: 6),
                                    Row(
                                      children: [
                                        const Icon(Icons.person_outline,
                                            size: 13,
                                            color: GemPalette.textMuted),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            a.actorName ?? 'Sistema',
                                            style: const TextStyle(
                                                color: GemPalette.textMuted,
                                                fontSize: 11.5),
                                          ),
                                        ),
                                        Text(
                                          DateFormat('HH:mm', 'es')
                                              .format(a.createdAt.toLocal()),
                                          style: const TextStyle(
                                              color: GemPalette.textMuted,
                                              fontSize: 11.5),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 10),
                            ],
                          ],
                        ],
                      ),
                    ),
    );
  }
}
