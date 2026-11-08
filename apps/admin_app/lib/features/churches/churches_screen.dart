import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

class ChurchesScreen extends StatefulWidget {
  const ChurchesScreen({super.key});

  @override
  State<ChurchesScreen> createState() => _ChurchesScreenState();
}

class _ChurchesScreenState extends State<ChurchesScreen> {
  List<Church> _items = [];
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
      final list = await Locator.churches.list();
      // Quien no administra todas las iglesias ve solo las suyas (igual que
      // en el panel web): las demás le responderían "sin permiso".
      final cuenta = Locator.authState.account;
      final veTodas = cuenta == null ||
          cuenta.isRoot ||
          cuenta.globalPermissions.contains(GlobalPermission.MANAGE_CHURCHES);
      final propias = {
        for (final a in cuenta?.churchAssignments ?? const <ChurchAssignment>[])
          a.churchId,
      };
      final visibles =
          veTodas ? list : list.where((c) => propias.contains(c.id)).toList();
      if (mounted) setState(() => _items = visibles);
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
        const GemSectionHeader(
          eyebrow: 'Directorio',
          title: 'Iglesias',
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? GemListMessage(
                      message: _error!,
                      isError: true,
                      onRetry: _load,
                    )
                  : _items.isEmpty
                      ? GemListMessage(
                          icon: Icons.church_outlined,
                          message: 'No hay iglesias registradas todavía.',
                          onRetry: _load,
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding:
                                const EdgeInsets.fromLTRB(16, 12, 16, 90),
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 10),
                            itemCount: _items.length,
                            itemBuilder: (_, i) => _ChurchTile(
                              church: _items[i],
                              onChanged: _load,
                            ),
                          ),
                        ),
        ),
      ],
    );
  }
}

class _ChurchTile extends StatelessWidget {
  final Church church;
  final Future<void> Function() onChanged;
  const _ChurchTile({required this.church, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    // Sólo permitimos abrir la edición si el usuario actual tiene permiso
    // EDIT_CHURCH_INFO sobre esta iglesia (o es ROOT).
    final acct = Locator.authState.account;
    final canEdit = acct != null &&
        acct.hasChurchPermission(church.id, ChurchPermission.EDIT_CHURCH_INFO);

    return GemCard(
      padding: const EdgeInsets.all(14),
      onTap: canEdit
          ? () async {
              final changed = await context.push<bool>(
                '/churches/${church.id}/edit',
              );
              if (changed == true) await onChanged();
            }
          : null,
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: GemPalette.surfaceElevated,
              image: church.mainImageUrl != null
                  ? DecorationImage(
                      image: NetworkImage(church.mainImageUrl!),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            alignment: Alignment.center,
            child: church.mainImageUrl == null
                ? Icon(Icons.church, color: GemPalette.textMuted)
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(church.name,
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  church.city,
                  style: TextStyle(
                      color: GemPalette.textMuted, fontSize: 12.5),
                ),
                if (church.avgAttendance != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Asistencia promedio: ${church.avgAttendance}',
                    style: TextStyle(
                        color: GemPalette.textMuted, fontSize: 11.5),
                  ),
                ],
              ],
            ),
          ),
          GemBadge(
            label: church.isActive ? 'ACTIVA' : 'INACTIVA',
            color: church.isActive ? GemPalette.emerald : GemPalette.danger,
          ),
        ],
      ),
    );
  }
}
