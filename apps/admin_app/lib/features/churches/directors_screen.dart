import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Gestión de representantes/directores de una iglesia: crear, editar
/// (nombre, cargo, celular, correo, foto) y eliminar.
class DirectorsScreen extends StatefulWidget {
  final String churchId;
  final String churchName;
  const DirectorsScreen({
    super.key,
    required this.churchId,
    required this.churchName,
  });

  @override
  State<DirectorsScreen> createState() => _DirectorsScreenState();
}

class _DirectorsScreenState extends State<DirectorsScreen> {
  final _nameCtrl = TextEditingController();
  final _roleCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  final _picker = ImagePicker();
  File? _newPhoto;
  String? _currentPhotoUrl;

  String? _editingId; // null = modo crear
  List<ChurchDirector> _items = [];
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
    _nameCtrl.dispose();
    _roleCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _items = await Locator.directors.list(widget.churchId);
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _resetForm() {
    _editingId = null;
    _nameCtrl.clear();
    _roleCtrl.clear();
    _phoneCtrl.clear();
    _emailCtrl.clear();
    _newPhoto = null;
    _currentPhotoUrl = null;
  }

  void _startEdit(ChurchDirector d) {
    setState(() {
      _editingId = d.id;
      _nameCtrl.text = d.displayName;
      _roleCtrl.text = d.role;
      _phoneCtrl.text = d.phone ?? '';
      _emailCtrl.text = d.email ?? '';
      _newPhoto = null;
      _currentPhotoUrl = d.photoUrl;
      _error = null;
    });
  }

  Future<void> _pickPhoto() async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _newPhoto = File(picked.path));
    } catch (_) {
      setState(() => _error = 'No se pudo abrir el selector de imágenes.');
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'El nombre es obligatorio.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      MultipartFile? photo;
      if (_newPhoto != null) {
        photo = await MultipartFile.fromFile(_newPhoto!.path);
      }
      if (_editingId == null) {
        await Locator.directors.create(
          widget.churchId,
          displayName: name,
          role: _roleCtrl.text,
          phone: _phoneCtrl.text,
          email: _emailCtrl.text,
          photo: photo,
        );
      } else {
        await Locator.directors.update(
          _editingId!,
          displayName: name,
          role: _roleCtrl.text,
          phone: _phoneCtrl.text,
          email: _emailCtrl.text,
          photo: photo,
        );
      }
      setState(_resetForm);
      await _load();
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete(ChurchDirector d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar representante'),
        content: Text('¿Eliminar a "${d.displayName}"?'),
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
      await Locator.directors.delete(d.id);
      if (_editingId == d.id) setState(_resetForm);
      await _load();
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Representantes')),
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
                          color: GemPalette.textMuted, fontSize: 12.5),
                    ),
                    const SizedBox(height: 12),
                    _buildForm(),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 18),
                    Text('Representantes (${_items.length})',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (_items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Text(
                          'Aún no hay representantes. Agrega el primero arriba.',
                          style: TextStyle(color: GemPalette.textMuted),
                        ),
                      )
                    else
                      ..._items.map(_buildItem),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildForm() {
    final editing = _editingId != null;
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(editing ? 'Editar representante' : 'Nuevo representante',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Row(
            children: [
              _AvatarPreview(file: _newPhoto, url: _currentPhotoUrl),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: Text(_newPhoto != null || _currentPhotoUrl != null
                      ? 'Cambiar foto'
                      : 'Subir foto (opcional)'),
                  onPressed: _pickPhoto,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameCtrl,
            maxLength: 150,
            decoration: const InputDecoration(
                labelText: 'Nombre', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _roleCtrl,
            maxLength: 120,
            decoration: const InputDecoration(
                labelText: 'Cargo (opcional)', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _phoneCtrl,
            maxLength: 40,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
                labelText: 'Celular (opcional)', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _emailCtrl,
            maxLength: 150,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
                labelText: 'Correo (opcional)', counterText: ''),
          ),
          const SizedBox(height: 14),
          GemPrimaryButton(
            label: editing ? 'Guardar cambios' : 'Agregar representante',
            loading: _submitting,
            onPressed: _submit,
          ),
          if (editing)
            TextButton(
              onPressed: () => setState(_resetForm),
              child: const Text('Cancelar edición'),
            ),
        ],
      ),
    );
  }

  Widget _buildItem(ChurchDirector d) {
    final contact =
        [d.phone, d.email].whereType<String>().where((e) => e.isNotEmpty);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        child: Row(
          children: [
            _AvatarPreview(file: null, url: d.photoUrl, initial: d.displayName),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(d.displayName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14.5)),
                  if (d.role.isNotEmpty)
                    Text(d.role,
                        style: const TextStyle(
                            color: GemPalette.sapphire, fontSize: 12)),
                  if (contact.isNotEmpty)
                    Text(contact.join('  ·  '),
                        style: const TextStyle(
                            color: GemPalette.textMuted, fontSize: 12)),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 20),
              onPressed: () => _startEdit(d),
              tooltip: 'Editar',
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline,
                  size: 20, color: GemPalette.danger),
              onPressed: () => _delete(d),
              tooltip: 'Eliminar',
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarPreview extends StatelessWidget {
  final File? file;
  final String? url;
  final String? initial;
  const _AvatarPreview({this.file, this.url, this.initial});

  @override
  Widget build(BuildContext context) {
    ImageProvider? img;
    if (file != null) {
      img = FileImage(file!);
    } else if (url != null && url!.isNotEmpty) {
      img = NetworkImage(url!);
    }
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: GemPalette.surface,
        border: Border.all(color: GemPalette.borderSoft),
        image: img != null
            ? DecorationImage(image: img, fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: img == null
          ? Text(
              (initial != null && initial!.isNotEmpty)
                  ? initial!.characters.first.toUpperCase()
                  : '?',
              style: const TextStyle(
                  fontWeight: FontWeight.w800, color: GemPalette.textMuted),
            )
          : null,
    );
  }
}
