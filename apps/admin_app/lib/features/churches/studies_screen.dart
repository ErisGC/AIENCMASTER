import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

const _maxAudioBytes = 25 * 1024 * 1024;

/// Gestión de estudios/mensajes en audio de una iglesia (subir, listar, borrar).
class StudiesScreen extends StatefulWidget {
  final String churchId;
  final String churchName;
  const StudiesScreen({
    super.key,
    required this.churchId,
    required this.churchName,
  });

  @override
  State<StudiesScreen> createState() => _StudiesScreenState();
}

class _StudiesScreenState extends State<StudiesScreen> {
  final _teacherCtrl = TextEditingController();
  final _topicCtrl = TextEditingController();
  final _outlineCtrl = TextEditingController();

  PlatformFile? _audio;
  List<ChurchStudy> _items = [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _teacherCtrl.dispose();
    _topicCtrl.dispose();
    _outlineCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _items = await Locator.studies.list(widget.churchId);
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAudio() async {
    try {
      final res = await FilePicker.platform.pickFiles(type: FileType.audio);
      final file = res?.files.single;
      if (file == null) return;
      if (file.size > _maxAudioBytes) {
        setState(() => _error = 'El audio supera el máximo de 25 MB.');
        return;
      }
      setState(() {
        _audio = file;
        _error = null;
      });
    } catch (_) {
      setState(() => _error = 'No se pudo abrir el selector de audio.');
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final teacher = _teacherCtrl.text.trim();
    final topic = _topicCtrl.text.trim();
    if (teacher.isEmpty || topic.isEmpty) {
      setState(() => _error = 'El enseñador y el tema son obligatorios.');
      return;
    }
    final audio = _audio;
    if (audio == null || audio.path == null) {
      setState(() => _error = 'Selecciona el archivo de audio.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final mp = await MultipartFile.fromFile(
        audio.path!,
        filename: audio.name,
      );
      await Locator.studies.create(
        widget.churchId,
        teacherName: teacher,
        topic: topic,
        outline: _outlineCtrl.text,
        audio: mp,
      );
      _teacherCtrl.clear();
      _topicCtrl.clear();
      _outlineCtrl.clear();
      setState(() => _audio = null);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Estudio subido.')),
        );
      }
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete(ChurchStudy s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar estudio'),
        content: Text('¿Eliminar "${s.topic}"? No se puede deshacer.'),
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
      await Locator.studies.delete(widget.churchId, s.id);
      await _load();
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    }
  }

  Future<void> _openAudio(ChurchStudy s) async {
    await launchUrl(Uri.parse(s.audioUrl), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM yyyy', 'es');
    return Scaffold(
      appBar: AppBar(title: const Text('Estudios en audio')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      widget.churchName,
                      style: const TextStyle(
                        color: GemPalette.textMuted,
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildForm(),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 18),
                    Text('Publicados (${_items.length})',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (_items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Text(
                          'Aún no hay estudios. Sube el primero arriba.',
                          style: TextStyle(color: GemPalette.textMuted),
                        ),
                      )
                    else
                      ..._items.map((s) => _buildItem(s, df)),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildForm() {
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Nuevo estudio',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _teacherCtrl,
            maxLength: 150,
            decoration: const InputDecoration(
              labelText: 'Enseñador',
              counterText: '',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _topicCtrl,
            maxLength: 200,
            decoration: const InputDecoration(
              labelText: 'Tema',
              counterText: '',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _outlineCtrl,
            maxLength: 8000,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Bosquejo (opcional)',
              alignLabelWithHint: true,
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.audiotrack_outlined, size: 18),
            label: Text(_audio == null ? 'Seleccionar audio' : 'Cambiar audio'),
            onPressed: _pickAudio,
          ),
          if (_audio != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${_audio!.name}  ·  ${(_audio!.size / (1024 * 1024)).toStringAsFixed(1)} MB',
                style: const TextStyle(
                    color: GemPalette.emerald, fontSize: 12),
              ),
            ),
          const SizedBox(height: 14),
          GemPrimaryButton(
            label: 'Subir estudio',
            loading: _submitting,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Widget _buildItem(ChurchStudy s, DateFormat df) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s.topic,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 2),
            Text(
              s.teacherName +
                  (s.createdAt != null ? '  ·  ${df.format(s.createdAt!)}' : ''),
              style:
                  const TextStyle(color: GemPalette.textMuted, fontSize: 12),
            ),
            if (s.outline != null && s.outline!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                s.outline!,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton.icon(
                  icon: const Icon(Icons.play_circle_outline, size: 18),
                  label: const Text('Escuchar'),
                  onPressed: () => _openAudio(s),
                ),
                const Spacer(),
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline,
                      size: 18, color: GemPalette.danger),
                  label: const Text('Eliminar',
                      style: TextStyle(color: GemPalette.danger)),
                  onPressed: () => _delete(s),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
