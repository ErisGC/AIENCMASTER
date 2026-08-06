import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../announcements/announcement_edit_screen.dart';

/// Anuncios locales de UNA iglesia concreta.
///
/// La pestaña general de Anuncios trabaja sobre "mi iglesia"
/// (`activeChurchId`), lo que deja fuera al administrador principal: al no
/// estar asignado a ninguna iglesia, no tenía forma de publicar anuncios
/// locales desde la app. Desde aquí se gestiona la iglesia que se esté
/// editando, igual que en el panel web.
class ChurchAnnouncementsScreen extends StatefulWidget {
  final String churchId;
  final String churchName;
  const ChurchAnnouncementsScreen({
    super.key,
    required this.churchId,
    required this.churchName,
  });

  @override
  State<ChurchAnnouncementsScreen> createState() =>
      _ChurchAnnouncementsScreenState();
}

class _ChurchAnnouncementsScreenState extends State<ChurchAnnouncementsScreen> {
  List<Announcement> _items = [];
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
      _items = await Locator.announcements.listForChurch(widget.churchId);
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openEditor({Announcement? existing}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnnouncementEditScreen(
          churchId: widget.churchId,
          existing: existing,
        ),
      ),
    );
    if (changed == true) await _load();
  }

  Future<void> _delete(Announcement a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar anuncio'),
        content: Text('¿Eliminar "${a.title}"? No se puede deshacer.'),
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
      await Locator.announcements.deleteFromChurch(widget.churchId, a.id);
      await _load();
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM yyyy', 'es');
    return Scaffold(
      appBar: AppBar(title: const Text('Anuncios de la iglesia')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: GemPalette.emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo anuncio'),
        onPressed: () => _openEditor(),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  Text(
                    widget.churchName,
                    style: const TextStyle(
                        color: GemPalette.textMuted, fontSize: 12.5),
                  ),
                  const SizedBox(height: 12),
                  if (_error != null) ...[
                    GemErrorBanner(message: _error!),
                    const SizedBox(height: 12),
                  ],
                  if (_items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: Text(
                        'Esta iglesia aún no tiene anuncios. Crea el primero '
                        'con el botón de abajo.',
                        style: TextStyle(color: GemPalette.textMuted),
                        textAlign: TextAlign.center,
                      ),
                    )
                  else
                    ..._items.map((a) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: GemCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(a.title,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15)),
                                const SizedBox(height: 2),
                                Text(
                                  '${a.author}  ·  ${df.format(a.createdAt)}',
                                  style: const TextStyle(
                                      color: GemPalette.textMuted,
                                      fontSize: 12),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  a.description,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontSize: 13, height: 1.4),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    TextButton.icon(
                                      icon: const Icon(Icons.edit_outlined,
                                          size: 18),
                                      label: const Text('Editar'),
                                      onPressed: () =>
                                          _openEditor(existing: a),
                                    ),
                                    const Spacer(),
                                    TextButton.icon(
                                      icon: const Icon(Icons.delete_outline,
                                          size: 18,
                                          color: GemPalette.danger),
                                      label: const Text('Eliminar',
                                          style: TextStyle(
                                              color: GemPalette.danger)),
                                      onPressed: () => _delete(a),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        )),
                ],
              ),
            ),
    );
  }
}
