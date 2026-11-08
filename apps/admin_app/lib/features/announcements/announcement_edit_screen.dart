import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';

/// Editor de anuncios. Sirve para crear o editar:
///   - Si `existing` es null: crea (modo nuevo).
///   - Si `existing` viene cargado: edita texto.
///
/// Los adjuntos sólo se pueden añadir al CREAR (es como funciona la web —
/// el backend acepta `attachments` en POST pero el PATCH es JSON puro).
/// Para gestionar adjuntos en un anuncio existente, sigue la web.
class AnnouncementEditScreen extends StatefulWidget {
  final String? churchId; // null = global
  final Announcement? existing;
  const AnnouncementEditScreen({
    super.key,
    required this.churchId,
    required this.existing,
  });

  @override
  State<AnnouncementEditScreen> createState() => _AnnouncementEditScreenState();
}

class _AnnouncementEditScreenState extends State<AnnouncementEditScreen> {
  /// Ya se escribió algo: "atrás" pregunta antes de descartar.
  bool _tocado = false;

  void _vigilarCambios() {
    for (final c in [_title, _description, _author]) {
      c.addListener(() {
        if (!_tocado && mounted) setState(() => _tocado = true);
      });
    }
  }

  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _author;

  /// Archivos seleccionados pero todavía no subidos.
  final List<PlatformFile> _pendingFiles = [];

  bool _saving = false;
  String? _error;

  bool get _isEditing => widget.existing != null;
  bool get _isGlobal => widget.churchId == null;

  @override
  void initState() {
    super.initState();
    final ex = widget.existing;
    _title = TextEditingController(text: ex?.title ?? '');
    _description = TextEditingController(text: ex?.description ?? '');
    _author = TextEditingController(text: ex?.author ?? '');
    _vigilarCambios();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _author.dispose();
    super.dispose();
  }

  Future<void> _pickFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        withReadStream: false,
        // No restringimos por tipo — el backend ya valida magic bytes y
        // tamaño. Aceptamos imágenes, PDFs y documentos del programa.
        type: FileType.custom,
        allowedExtensions: const [
          'jpg', 'jpeg', 'png', 'webp', 'gif',
          'pdf', 'doc', 'docx', 'txt',
        ],
      );
      if (result == null) return;
      setState(() {
        _pendingFiles.addAll(result.files.where((f) => f.path != null));
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'No se pudo abrir el selector de archivos.');
      }
    }
  }

  void _removeFile(int idx) {
    setState(() => _pendingFiles.removeAt(idx));
  }

  Future<void> _save() async {
    if (_saving) return;
    final title = _title.text.trim();
    final desc = _description.text.trim();
    final author = _author.text.trim();
    if (title.isEmpty || desc.isEmpty || author.isEmpty) {
      setState(() => _error = 'Título, descripción y autor son obligatorios.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (_isEditing) {
        if (_isGlobal) {
          await Locator.announcements.updateGlobal(
            widget.existing!.id,
            title: title,
            description: desc,
            author: author,
          );
        } else {
          await Locator.announcements.updateForChurch(
            churchId: widget.churchId!,
            id: widget.existing!.id,
            title: title,
            description: desc,
            author: author,
          );
        }
      } else {
        final files = <MultipartFile>[];
        for (final f in _pendingFiles) {
          if (f.path == null) continue;
          files.add(await MultipartFile.fromFile(
            f.path!,
            filename: f.name,
          ));
        }
        if (_isGlobal) {
          await Locator.announcements.createGlobal(
            title: title,
            description: desc,
            author: author,
            attachments: files,
          );
        } else {
          await Locator.announcements.createForChurch(
            churchId: widget.churchId!,
            title: title,
            description: desc,
            author: author,
            attachments: files,
          );
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isEditing
            ? 'Anuncio actualizado.'
            : 'Anuncio publicado.')),
      );
      context.pop(true);
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _isEditing
        ? 'Editar anuncio'
        : _isGlobal
            ? 'Nuevo anuncio global'
            : 'Nuevo anuncio de iglesia';
    return DiscardGuard(
      dirty: _tocado,
      child: Scaffold(
      appBar: GemAppBar(title: Text(title)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_isGlobal)
                  Text(
                    'Este anuncio se publicará a todos los usuarios del '
                    'sitio público.',
                    style:
                        TextStyle(color: GemPalette.textMuted, height: 1.45),
                  )
                else
                  Text(
                    'Este anuncio se publicará en la página pública de la '
                    'iglesia activa.',
                    style:
                        TextStyle(color: GemPalette.textMuted, height: 1.45),
                  ),
                const SizedBox(height: 14),
                TextField(
                  controller: _title,
                  maxLength: 180,
                  decoration: const InputDecoration(labelText: 'Título'),
                ),
                TextField(
                  controller: _author,
                  maxLength: 100,
                  decoration: const InputDecoration(
                    labelText: 'Autor (pastor / equipo)',
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _description,
                  maxLength: 4000,
                  maxLines: 6,
                  decoration:
                      const InputDecoration(labelText: 'Descripción'),
                ),
                const SizedBox(height: 14),
                if (!_isEditing) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Adjuntos',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.attach_file, size: 18),
                        label: const Text('Agregar archivo'),
                        onPressed: _pickFiles,
                      ),
                    ],
                  ),
                  if (_pendingFiles.isEmpty)
                    Padding(
                      padding: EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        'Imágenes (jpg, png, webp) o documentos (pdf, doc). '
                        'Opcional.',
                        style: TextStyle(
                            color: GemPalette.textMuted, fontSize: 12),
                      ),
                    )
                  else
                    Column(
                      children: [
                        for (var i = 0; i < _pendingFiles.length; i++)
                          _PendingFileTile(
                            file: _pendingFiles[i],
                            onRemove: () => _removeFile(i),
                          ),
                      ],
                    ),
                ] else ...[
                  if (widget.existing!.attachments.isNotEmpty) ...[
                    Text(
                      'Adjuntos actuales',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final a in widget.existing!.attachments)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: GemPalette.emerald.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(100),
                            ),
                            child: Text(
                              '📎 ${a.name.isNotEmpty ? a.name : a.format.toUpperCase()}',
                              style: TextStyle(
                                  color: GemPalette.emerald, fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],
                  Text(
                    'Para añadir o quitar adjuntos, abre este anuncio desde '
                    'el panel web — la app sólo permite editar el texto.',
                    style:
                        TextStyle(color: GemPalette.textMuted, fontSize: 12),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  GemErrorBanner(message: _error!),
                ],
                const SizedBox(height: 16),
                GemPrimaryButton(
                  label: _isEditing ? 'Guardar cambios' : 'Publicar anuncio',
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    );
  }
}

class _PendingFileTile extends StatelessWidget {
  final PlatformFile file;
  final VoidCallback onRemove;
  const _PendingFileTile({required this.file, required this.onRemove});

  IconData get _icon {
    final lower = file.name.toLowerCase();
    if (lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif')) {
      return Icons.image_outlined;
    }
    if (lower.endsWith('.pdf')) return Icons.picture_as_pdf_outlined;
    return Icons.insert_drive_file_outlined;
  }

  String _sizeLabel() {
    final bytes = file.size;
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: GemPalette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: GemPalette.borderSoft),
      ),
      child: Row(
        children: [
          Icon(_icon, color: GemPalette.emerald, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600),
                ),
                Text(_sizeLabel(),
                    style: TextStyle(
                        color: GemPalette.textMuted, fontSize: 11)),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            onPressed: onRemove,
            tooltip: 'Quitar',
            splashRadius: 18,
          ),
        ],
      ),
    );
  }
}
