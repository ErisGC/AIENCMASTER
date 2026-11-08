import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';

/// Panel para editar los permisos de una cuenta de administrador.
///
/// Carga:
///   - el catálogo de permisos (descripciones + templates)
///   - la cuenta target con sus permisos actuales (via accountHistory que
///     ya devuelve la cuenta enriquecida)
///
/// Para ROOT no se muestra nada editable — su nota explica el motivo.
class AccountPermissionsScreen extends StatefulWidget {
  final String accountId;
  const AccountPermissionsScreen({super.key, required this.accountId});

  @override
  State<AccountPermissionsScreen> createState() =>
      _AccountPermissionsScreenState();
}

class _AccountPermissionsScreenState extends State<AccountPermissionsScreen> {
  AdminAccount? _account;
  PermissionsCatalog? _catalog;
  List<Church> _allChurches = [];

  Set<GlobalPermission> _draftGlobal = {};
  // Drafts por iglesia: churchId → set de permisos en edición.
  final Map<String, Set<ChurchPermission>> _draftChurchPerms = {};

  bool _loading = true;
  String? _error;
  bool _savingGlobal = false;
  String? _savingChurchId;

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
      final results = await Future.wait([
        Locator.security.accountHistory(widget.accountId),
        Locator.security.catalog(),
        Locator.churches.list(),
      ]);
      final history = results[0] as AccountHistoryResponse;
      final catalog = results[1] as PermissionsCatalog;
      final churches = results[2] as List<Church>;
      if (mounted) {
        setState(() {
          _account = history.account;
          _catalog = catalog;
          _allChurches = churches;
          _draftGlobal = history.account.globalPermissions.toSet();
          _draftChurchPerms.clear();
          for (final a in history.account.churchAssignments) {
            _draftChurchPerms[a.churchId] = a.permissions.toSet();
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveGlobal() async {
    if (_savingGlobal) return;
    setState(() => _savingGlobal = true);
    try {
      await Locator.security.updateGlobalPermissions(
        widget.accountId,
        _draftGlobal.toList(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Permisos globales actualizados.')),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessageFor(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _savingGlobal = false);
    }
  }

  Future<void> _saveChurch(String churchId) async {
    if (_savingChurchId != null) return;
    setState(() => _savingChurchId = churchId);
    try {
      final perms = _draftChurchPerms[churchId] ?? <ChurchPermission>{};
      await Locator.security.updateChurchPermissions(
        widget.accountId,
        churchId: churchId,
        permissions: perms.toList(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Permisos de iglesia actualizados.')),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessageFor(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _savingChurchId = null);
    }
  }

  Future<void> _removeChurch(ChurchAssignment a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Quitar iglesia'),
        content: Text(
          '¿Quitar la asignación a ${a.churchName ?? "esta iglesia"}? El admin dejará de tener acceso de inmediato.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Quitar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Locator.security.removeChurchAssignment(
        widget.accountId,
        churchId: a.churchId,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessageFor(e))),
        );
      }
    }
  }

  Future<void> _addChurch() async {
    final cat = _catalog;
    if (cat == null) return;
    final assigned = _draftChurchPerms.keys.toSet();
    final available =
        _allChurches.where((c) => !assigned.contains(c.id)).toList();
    if (available.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text(
                'Esta cuenta ya tiene todas las iglesias asignadas.')),
      );
      return;
    }
    final result = await Navigator.of(context).push<_AssignResult>(
      MaterialPageRoute(
        builder: (_) =>
            _AssignChurchScreen(churches: available, catalog: cat),
      ),
    );
    if (result == null) return;
    try {
      await Locator.security.assignChurch(
        widget.accountId,
        churchId: result.churchId,
        permissions: result.permissions,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessageFor(e))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: GemAppBar(title: const Text('Permisos')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _account == null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: GemErrorBanner(message: _error!),
                )
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final account = _account!;
    final cat = _catalog!;
    if (account.isRoot) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: GemCard(
            gradientBorder: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(account.displayName,
                    style: Theme.of(context).textTheme.titleLarge),
                Text('@${account.username}',
                    style: TextStyle(
                        color: GemPalette.textMuted, fontSize: 13)),
                const SizedBox(height: 12),
                const Text(
                  'Esta es la cuenta principal del sistema. Tiene todos los '
                  'permisos globales y sobre todas las iglesias por defecto. '
                  'Los permisos no se editan aquí — la cuenta principal es '
                  'el control total.',
                  style: TextStyle(height: 1.5),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final globalDescriptors =
        cat.catalog.where((d) => d.group == 'global').toList();
    final churchDescriptors =
        cat.catalog.where((d) => d.group == 'church').toList();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(account.displayName,
                    style: Theme.of(context).textTheme.titleLarge),
                Text('@${account.username}',
                    style: TextStyle(
                        color: GemPalette.textMuted, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── Permisos globales ──
          GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Permisos globales',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  'Estos permisos aplican a todo el sistema (no a una '
                  'iglesia en particular).',
                  style:
                      TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
                ),
                const SizedBox(height: 8),
                ...globalDescriptors.map((d) {
                  final perm = globalPermissionFromString(d.key);
                  if (perm == null) return const SizedBox.shrink();
                  return CheckboxListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    activeColor: GemPalette.emerald,
                    value: _draftGlobal.contains(perm),
                    onChanged: (v) => setState(() {
                      if (v == true) {
                        _draftGlobal.add(perm);
                      } else {
                        _draftGlobal.remove(perm);
                      }
                    }),
                    title: Text(d.label,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(d.description,
                        style: TextStyle(
                            color: GemPalette.textMuted, fontSize: 12)),
                  );
                }),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: GemPrimaryButton(
                    label: 'Guardar permisos globales',
                    loading: _savingGlobal,
                    onPressed: _saveGlobal,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── Iglesias asignadas ──
          GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Iglesias asignadas',
                          style:
                              Theme.of(context).textTheme.titleMedium),
                    ),
                    TextButton.icon(
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Asignar otra'),
                      onPressed: _addChurch,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                if (account.churchAssignments.isEmpty)
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'Esta cuenta aún no tiene iglesias asignadas. Asigna '
                      'al menos una para que pueda operar.',
                      style: TextStyle(color: GemPalette.textMuted),
                    ),
                  )
                else
                  ...account.churchAssignments.map((a) => _ChurchAssignmentCard(
                        assignment: a,
                        descriptors: churchDescriptors,
                        currentPerms: _draftChurchPerms[a.churchId] ??
                            <ChurchPermission>{},
                        onToggle: (p, v) => setState(() {
                          final s = _draftChurchPerms.putIfAbsent(
                              a.churchId, () => <ChurchPermission>{});
                          if (v) {
                            s.add(p);
                          } else {
                            s.remove(p);
                          }
                        }),
                        onSave: () => _saveChurch(a.churchId),
                        saving: _savingChurchId == a.churchId,
                        onRemove: () => _removeChurch(a),
                      )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChurchAssignmentCard extends StatelessWidget {
  final ChurchAssignment assignment;
  final List<PermissionDescriptor> descriptors;
  final Set<ChurchPermission> currentPerms;
  final void Function(ChurchPermission, bool) onToggle;
  final VoidCallback onSave;
  final VoidCallback onRemove;
  final bool saving;

  const _ChurchAssignmentCard({
    required this.assignment,
    required this.descriptors,
    required this.currentPerms,
    required this.onToggle,
    required this.onSave,
    required this.onRemove,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: GemCard(
        gradientBorder: false,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    assignment.churchName ??
                        assignment.churchId.substring(0, 8),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                ),
                TextButton.icon(
                  icon: Icon(Icons.delete_outline,
                      size: 16, color: GemPalette.danger),
                  label: Text('Quitar',
                      style: TextStyle(color: GemPalette.danger)),
                  onPressed: onRemove,
                ),
              ],
            ),
            const SizedBox(height: 4),
            ...descriptors.map((d) {
              final perm = churchPermissionFromString(d.key);
              if (perm == null) return const SizedBox.shrink();
              return CheckboxListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: GemPalette.emerald,
                value: currentPerms.contains(perm),
                onChanged: (v) => onToggle(perm, v ?? false),
                title: Text(d.label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13.5)),
                subtitle: Text(d.description,
                    style: TextStyle(
                        color: GemPalette.textMuted, fontSize: 11.5)),
              );
            }),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: GemPrimaryButton(
                label: 'Guardar',
                loading: saving,
                onPressed: onSave,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssignResult {
  final String churchId;
  final List<ChurchPermission> permissions;
  _AssignResult(this.churchId, this.permissions);
}

class _AssignChurchScreen extends StatefulWidget {
  final List<Church> churches;
  final PermissionsCatalog catalog;
  const _AssignChurchScreen({required this.churches, required this.catalog});

  @override
  State<_AssignChurchScreen> createState() => _AssignChurchScreenState();
}

class _AssignChurchScreenState extends State<_AssignChurchScreen> {
  String? _churchId;
  String _templateKey = 'PASTOR';
  late Set<ChurchPermission> _perms;
  String? _error;

  @override
  void initState() {
    super.initState();
    final pastor = widget.catalog.templates.firstWhere(
      (t) => t.key == 'PASTOR',
      orElse: () => widget.catalog.templates.first,
    );
    _templateKey = pastor.key;
    _perms = pastor.churchPermissions.toSet();
  }

  void _applyTemplate(PermissionTemplate t) {
    setState(() {
      _templateKey = t.key;
      _perms = t.churchPermissions.toSet();
    });
  }

  void _togglePerm(ChurchPermission p) {
    setState(() {
      _templateKey = 'CUSTOM';
      if (_perms.contains(p)) {
        _perms.remove(p);
      } else {
        _perms.add(p);
      }
    });
  }

  void _submit() {
    if (_churchId == null) {
      setState(() => _error = 'Selecciona una iglesia.');
      return;
    }
    Navigator.pop(context, _AssignResult(_churchId!, _perms.toList()));
  }

  @override
  Widget build(BuildContext context) {
    final descriptors =
        widget.catalog.catalog.where((d) => d.group == 'church').toList();
    return Scaffold(
      appBar: GemAppBar(title: const Text('Asignar iglesia')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Iglesia',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: _churchId,
                      isExpanded: true,
                      decoration:
                          const InputDecoration(labelText: 'Selecciona…'),
                      items: [
                        for (final c in widget.churches)
                          DropdownMenuItem(
                            value: c.id,
                            child: Text('${c.name} — ${c.city}'),
                          ),
                      ],
                      onChanged: (v) => setState(() => _churchId = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Rol',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final t in widget.catalog.templates)
                          GemPill(
                            label: t.name,
                            selected: _templateKey == t.key,
                            onTap: () => _applyTemplate(t),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Permisos',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    ...descriptors.map((d) {
                      final p = churchPermissionFromString(d.key);
                      if (p == null) return const SizedBox.shrink();
                      return CheckboxListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        controlAffinity: ListTileControlAffinity.leading,
                        activeColor: GemPalette.emerald,
                        value: _perms.contains(p),
                        onChanged: (_) => _togglePerm(p),
                        title: Text(d.label,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 13.5)),
                        subtitle: Text(d.description,
                            style: TextStyle(
                                color: GemPalette.textMuted, fontSize: 11.5)),
                      );
                    }),
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                GemErrorBanner(message: _error!),
              ],
              const SizedBox(height: 16),
              GemPrimaryButton(
                label: 'Asignar iglesia',
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
