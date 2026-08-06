import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import 'announcement_edit_screen.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Announcement> _global = [];
  List<Announcement> _church = [];
  bool _loadingGlobal = true;
  bool _loadingChurch = true;
  String? _error;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (_tabs.indexIsChanging) return;
      if (_tabIndex != _tabs.index) {
        setState(() => _tabIndex = _tabs.index);
      }
    });
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loadingGlobal = true;
      _loadingChurch = true;
      _error = null;
    });
    try {
      final g = await Locator.announcements.listGlobal();
      if (mounted) setState(() => _global = g);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loadingGlobal = false);
    }

    final churchId = Locator.authState.activeChurchId;
    if (churchId != null) {
      try {
        final c = await Locator.announcements.listForChurch(churchId);
        if (mounted) setState(() => _church = c);
      } catch (_) {
        // sin permisos: dejamos lista vacía silenciosamente
      } finally {
        if (mounted) setState(() => _loadingChurch = false);
      }
    } else {
      if (mounted) setState(() => _loadingChurch = false);
    }
  }

  bool get _canCreateGlobal {
    final a = Locator.authState.account;
    if (a == null) return false;
    return a.hasGlobalPermission(GlobalPermission.MANAGE_GLOBAL_ANNOUNCEMENTS);
  }

  bool get _canCreateChurch {
    final a = Locator.authState.account;
    final cid = Locator.authState.activeChurchId;
    if (a == null || cid == null) return false;
    return a.hasChurchPermission(
      cid,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );
  }

  Future<void> _openEditor({String? churchId, Announcement? existing}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnnouncementEditScreen(
          churchId: churchId,
          existing: existing,
        ),
      ),
    );
    if (changed == true) {
      await _load();
    }
  }

  Future<void> _delete(Announcement a, {required bool isGlobal}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar anuncio'),
        content: Text('¿Eliminar el anuncio "${a.title}"? Esta acción no se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      if (isGlobal) {
        await Locator.announcements.deleteGlobal(a.id);
      } else {
        final cid = Locator.authState.activeChurchId;
        if (cid == null) return;
        await Locator.announcements.deleteFromChurch(cid, a.id);
      }
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Anuncio eliminado.')),
        );
      }
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
    final isOnGlobalTab = _tabIndex == 0;
    final canCreate =
        isOnGlobalTab ? _canCreateGlobal : _canCreateChurch;

    return Stack(
      children: [
        Column(
          children: [
            const GemSectionHeader(
              eyebrow: 'Actualidad',
              title: 'Anuncios',
            ),
            TabBar(
              controller: _tabs,
              indicatorColor: GemPalette.emerald,
              labelColor: GemPalette.textPrimary,
              unselectedLabelColor: GemPalette.textMuted,
              tabs: const [
                Tab(text: 'Globales'),
                Tab(text: 'Mi iglesia'),
              ],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _buildList(_global, _loadingGlobal, isGlobal: true),
                  _buildList(_church, _loadingChurch, isGlobal: false),
                ],
              ),
            ),
          ],
        ),
        if (canCreate)
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton.extended(
              backgroundColor: GemPalette.emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Nuevo anuncio'),
              onPressed: () => _openEditor(
                churchId: isOnGlobalTab
                    ? null
                    : Locator.authState.activeChurchId,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildList(List<Announcement> items, bool loading,
      {required bool isGlobal}) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (_error != null && items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: GemErrorBanner(message: _error!),
      );
    }
    if (items.isEmpty) {
      // Esta pestaña trabaja sobre "mi iglesia". El administrador principal no
      // está asignado a ninguna, así que en vez de dejar la pantalla muda le
      // indicamos dónde se gestionan los anuncios de cada iglesia.
      final sinIglesia =
          !isGlobal && Locator.authState.activeChurchId == null;
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            isGlobal
                ? 'Aún no hay anuncios globales publicados.'
                : sinIglesia
                    ? 'Tu cuenta no está asignada a una iglesia concreta.\n\n'
                        'Para publicar anuncios de una iglesia, entra a '
                        'Iglesias, ábrela y usa "Anuncios de la iglesia".'
                    : 'Aún no hay anuncios para esta iglesia.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: GemPalette.textMuted, height: 1.5),
          ),
        ),
      );
    }

    final canManage = isGlobal ? _canCreateGlobal : _canCreateChurch;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemCount: items.length,
        itemBuilder: (_, i) => _AnnouncementCard(
          item: items[i],
          canManage: canManage,
          onEdit: () => _openEditor(
            churchId: isGlobal ? null : Locator.authState.activeChurchId,
            existing: items[i],
          ),
          onDelete: () => _delete(items[i], isGlobal: isGlobal),
        ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  final Announcement item;
  final bool canManage;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _AnnouncementCard({
    required this.item,
    required this.canManage,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.title,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Text(
                DateFormat('d MMM', 'es').format(item.createdAt),
                style: const TextStyle(
                    color: GemPalette.textMuted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Por ${item.author}',
            style: const TextStyle(
              color: GemPalette.emerald,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(item.description,
              style: Theme.of(context).textTheme.bodyMedium),
          if (item.attachments.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final a in item.attachments)
                  InkWell(
                    borderRadius: BorderRadius.circular(100),
                    onTap: () async {
                      final url = Uri.tryParse(a.url);
                      if (url == null) return;
                      if (!await launchUrl(url,
                          mode: LaunchMode.externalApplication)) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text(
                                    'No se pudo abrir el adjunto.')),
                          );
                        }
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: GemPalette.emerald.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        '📎 ${a.name.isNotEmpty ? a.name : a.format.toUpperCase()}',
                        style: const TextStyle(
                            color: GemPalette.emerald, fontSize: 12),
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if (canManage) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Editar'),
                  onPressed: onEdit,
                ),
                const SizedBox(width: 4),
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline,
                      size: 16, color: GemPalette.danger),
                  label: const Text('Eliminar',
                      style: TextStyle(color: GemPalette.danger)),
                  onPressed: onDelete,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
