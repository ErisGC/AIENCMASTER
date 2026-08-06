import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import 'church_announcements_screen.dart';
import 'directors_screen.dart';
import 'studies_screen.dart';

/// Edición de iglesia. La app cubre ya todo lo que necesita el admin desde
/// el campo:
///   - Datos generales (nombre, ciudad, dirección, asistencia)
///   - Representantes y estudios (pantallas propias)
///   - Activar / desactivar
///   - Imágenes (logo + portada) via image_picker
///   - Ubicación en mapa (tap = poner marker, "Usar mi ubicación", quitar)
class ChurchEditScreen extends StatefulWidget {
  final String churchId;
  const ChurchEditScreen({super.key, required this.churchId});

  @override
  State<ChurchEditScreen> createState() => _ChurchEditScreenState();
}

class _ChurchEditScreenState extends State<ChurchEditScreen> {
  Church? _initial;
  final _nameCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _avgAttendanceCtrl = TextEditingController();
  bool _isActive = true;

  // Imágenes seleccionadas localmente (pendientes de subir).
  File? _newMainImage;
  File? _newCoverImage;
  String? _newMainImageName;
  String? _newCoverImageName;

  // Ubicación (mapa).
  LatLng? _point;
  bool _locationCleared = false;

  bool _loading = true;
  bool _saving = false;
  bool _toggling = false;
  bool _locating = false;
  String? _error;

  final MapController _mapController = MapController();
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _cityCtrl.dispose();
    _addressCtrl.dispose();
    _avgAttendanceCtrl.dispose();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final c = await Locator.churches.get(widget.churchId);
      _initial = c;
      _nameCtrl.text = c.name;
      _cityCtrl.text = c.city;
      _addressCtrl.text = c.address ?? '';
      _avgAttendanceCtrl.text =
          c.avgAttendance != null ? c.avgAttendance.toString() : '';
      _isActive = c.isActive;
      if (c.mapsLat != null && c.mapsLng != null) {
        _point = LatLng(c.mapsLat!, c.mapsLng!);
      }
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickImage(bool isCover) async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 2400,
        imageQuality: 88,
      );
      if (picked == null) return;
      setState(() {
        if (isCover) {
          _newCoverImage = File(picked.path);
          _newCoverImageName = picked.name;
        } else {
          _newMainImage = File(picked.path);
          _newMainImageName = picked.name;
        }
      });
    } catch (_) {
      setState(() => _error = 'No se pudo abrir el selector de imágenes.');
    }
  }

  Future<void> _useMyLocation() async {
    if (_locating) return;
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      // Pedimos permiso si todavía no se ha concedido.
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        setState(() => _error =
            'Sin permiso de ubicación. Concédelo desde los ajustes de la app.');
        return;
      }
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        setState(() => _error =
            'El GPS está apagado. Actívalo desde los ajustes del sistema.');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      _setPoint(LatLng(pos.latitude, pos.longitude), recenter: true);
    } catch (_) {
      setState(() => _error = 'No se pudo obtener la ubicación actual.');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _setPoint(LatLng p, {bool recenter = false}) {
    setState(() {
      _point = LatLng(
        double.parse(p.latitude.toStringAsFixed(7)),
        double.parse(p.longitude.toStringAsFixed(7)),
      );
      _locationCleared = false;
    });
    if (recenter) _mapController.move(_point!, 15);
  }

  void _clearLocation() {
    setState(() {
      _point = null;
      _locationCleared = true;
    });
  }

  Future<void> _openInMaps() async {
    final p = _point;
    if (p == null) return;
    final url = Uri.parse(
        'https://www.google.com/maps?q=${p.latitude},${p.longitude}');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  Future<void> _save() async {
    if (_saving) return;
    final name = _nameCtrl.text.trim();
    final city = _cityCtrl.text.trim();
    if (name.isEmpty || city.isEmpty) {
      setState(() => _error = 'Nombre y ciudad son obligatorios.');
      return;
    }
    int? avg;
    if (_avgAttendanceCtrl.text.trim().isNotEmpty) {
      avg = int.tryParse(_avgAttendanceCtrl.text.trim());
      if (avg == null || avg < 0) {
        setState(() => _error = 'Asistencia promedio inválida.');
        return;
      }
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      MultipartFile? mainImg;
      MultipartFile? coverImg;
      if (_newMainImage != null) {
        mainImg = await MultipartFile.fromFile(
          _newMainImage!.path,
          filename: _newMainImageName,
        );
      }
      if (_newCoverImage != null) {
        coverImg = await MultipartFile.fromFile(
          _newCoverImage!.path,
          filename: _newCoverImageName,
        );
      }

      final updated = await Locator.churches.update(
        widget.churchId,
        name: name,
        city: city,
        address: _addressCtrl.text.trim(),
        avgAttendance: avg,
        isActive: _isActive,
        mapsLat: _point?.latitude,
        mapsLng: _point?.longitude,
        clearLocation: _locationCleared && _point == null,
        mainImage: mainImg,
        coverImage: coverImg,
      );
      _initial = updated;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cambios guardados.')),
      );
      context.pop(true);
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggle() async {
    if (_toggling) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          _isActive ? 'Marcar como inactiva' : 'Reactivar iglesia',
        ),
        content: Text(
          _isActive
              ? '¿Confirmas que esta iglesia ya no está activa? Dejará de aparecer en el listado público.'
              : '¿Reactivar esta iglesia para que vuelva a aparecer en el listado público?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _toggling = true);
    try {
      final updated = await Locator.churches.toggleActive(widget.churchId);
      setState(() {
        _initial = updated;
        _isActive = updated.isActive;
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(updated.isActive
              ? 'Iglesia reactivada.'
              : 'Iglesia marcada como inactiva.'),
        ),
      );
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _toggling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_initial?.name ?? 'Editar iglesia')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildDataCard(),
                    const SizedBox(height: 14),
                    _buildManageCard(),
                    const SizedBox(height: 14),
                    _buildImagesCard(),
                    const SizedBox(height: 14),
                    _buildMapCard(),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 16),
                    GemPrimaryButton(
                      label: 'Guardar cambios',
                      loading: _saving,
                      onPressed: _save,
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      icon: Icon(_isActive
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                      label: Text(_isActive
                          ? 'Marcar como inactiva'
                          : 'Reactivar iglesia'),
                      onPressed: _toggling ? null : _toggle,
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildManageCard() {
    final name = _initial?.name ?? _nameCtrl.text.trim();
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Contenido de la iglesia',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          const Text(
            'Gestiona los representantes y los estudios en audio que aparecen '
            'en la página pública de esta iglesia.',
            style: TextStyle(
                color: GemPalette.textMuted, fontSize: 12, height: 1.45),
          ),
          const SizedBox(height: 6),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.groups_outlined,
                color: GemPalette.sapphire),
            title: const Text('Representantes'),
            subtitle: const Text('Nombre, cargo, celular, correo y foto'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => DirectorsScreen(
                  churchId: widget.churchId,
                  churchName: name,
                ),
              ),
            ),
          ),
          const Divider(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading:
                const Icon(Icons.campaign_outlined, color: GemPalette.emerald),
            title: const Text('Anuncios de la iglesia'),
            subtitle: const Text('Publica y edita los anuncios locales'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ChurchAnnouncementsScreen(
                  churchId: widget.churchId,
                  churchName: name,
                ),
              ),
            ),
          ),
          const Divider(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.audiotrack_outlined,
                color: GemPalette.amethyst),
            title: const Text('Estudios en audio'),
            subtitle: const Text('Sube mensajes con enseñador y tema'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => StudiesScreen(
                  churchId: widget.churchId,
                  churchName: name,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDataCard() {
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Datos generales',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _nameCtrl,
            decoration: const InputDecoration(labelText: 'Nombre'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _cityCtrl,
            decoration: const InputDecoration(labelText: 'Ciudad'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _addressCtrl,
            decoration:
                const InputDecoration(labelText: 'Dirección (opcional)'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _avgAttendanceCtrl,
            decoration: const InputDecoration(
              labelText: 'Asistencia promedio (opcional)',
              hintText: 'Ej: 120',
            ),
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          ),
          const SizedBox(height: 16),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _isActive,
            onChanged: (v) => setState(() => _isActive = v),
            title: const Text('Iglesia activa'),
            subtitle: const Text(
              'Si está inactiva no aparece en el listado público.',
              style: TextStyle(color: GemPalette.textMuted, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildImagesCard() {
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Imágenes',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          const Text(
            'Se suben a Cloudinary al guardar los cambios. Toca el botón '
            'para reemplazar la imagen actual.',
            style:
                TextStyle(color: GemPalette.textMuted, fontSize: 12, height: 1.45),
          ),
          const SizedBox(height: 14),
          _ImageSlot(
            label: 'Principal (tarjeta)',
            currentUrl: _initial?.mainImageUrl,
            newFile: _newMainImage,
            onPick: () => _pickImage(false),
            onClear: _newMainImage != null
                ? () => setState(() => _newMainImage = null)
                : null,
          ),
          const SizedBox(height: 12),
          _ImageSlot(
            label: 'Portada (detalle)',
            currentUrl: _initial?.coverImageUrl,
            newFile: _newCoverImage,
            onPick: () => _pickImage(true),
            onClear: _newCoverImage != null
                ? () => setState(() => _newCoverImage = null)
                : null,
          ),
        ],
      ),
    );
  }

  Widget _buildMapCard() {
    return GemCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Ubicación',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              if (_point != null)
                TextButton.icon(
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Ver en Maps'),
                  onPressed: _openInMaps,
                ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Toca el mapa para fijar la ubicación de la iglesia, o usa '
            'el botón de tu ubicación actual.',
            style:
                TextStyle(color: GemPalette.textMuted, fontSize: 12, height: 1.45),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              height: 260,
              child: FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _point ??
                      const LatLng(10.9685, -74.7813), // Barranquilla, default
                  initialZoom: _point != null ? 15 : 6,
                  onTap: (tapPos, point) => _setPoint(point),
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'co.aienc.admin',
                    maxZoom: 19,
                  ),
                  if (_point != null)
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: _point!,
                          width: 44,
                          height: 44,
                          child: const Icon(
                            Icons.location_on,
                            color: GemPalette.emerald,
                            size: 44,
                            shadows: [
                              Shadow(blurRadius: 6, color: Colors.black54),
                            ],
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: _locating
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.my_location, size: 18),
                  label: const Text('Usar mi ubicación'),
                  onPressed: _locating ? null : _useMyLocation,
                ),
              ),
              const SizedBox(width: 10),
              if (_point != null)
                OutlinedButton.icon(
                  icon: const Icon(Icons.close, size: 18,
                      color: GemPalette.danger),
                  label: const Text('Quitar',
                      style: TextStyle(color: GemPalette.danger)),
                  onPressed: _clearLocation,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: GemPalette.danger),
                  ),
                ),
            ],
          ),
          if (_point != null) ...[
            const SizedBox(height: 8),
            Text(
              'Lat ${_point!.latitude}  ·  Lng ${_point!.longitude}',
              style: const TextStyle(
                color: GemPalette.textMuted,
                fontSize: 12,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ImageSlot extends StatelessWidget {
  final String label;
  final String? currentUrl;
  final File? newFile;
  final VoidCallback onPick;
  final VoidCallback? onClear;

  const _ImageSlot({
    required this.label,
    required this.currentUrl,
    required this.newFile,
    required this.onPick,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: GemPalette.textMuted)),
        const SizedBox(height: 6),
        Container(
          height: 140,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: GemPalette.surface,
            border: Border.all(color: GemPalette.borderSoft),
            image: _imageProvider() != null
                ? DecorationImage(
                    image: _imageProvider()!,
                    fit: BoxFit.cover,
                  )
                : null,
          ),
          alignment: Alignment.center,
          child: _imageProvider() == null
              ? const Icon(Icons.image_outlined,
                  color: GemPalette.textMuted, size: 32)
              : null,
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                newFile != null
                    ? 'Nueva imagen seleccionada — se subirá al guardar'
                    : (currentUrl != null
                        ? 'Imagen actual'
                        : 'Sin imagen'),
                style: TextStyle(
                  color: newFile != null
                      ? GemPalette.emerald
                      : GemPalette.textMuted,
                  fontSize: 11.5,
                ),
              ),
            ),
            if (newFile != null && onClear != null)
              TextButton(
                onPressed: onClear,
                child: const Text('Quitar'),
              ),
            TextButton.icon(
              icon: Icon(
                newFile != null
                    ? Icons.refresh
                    : Icons.upload_outlined,
                size: 16,
              ),
              label: Text(newFile != null
                  ? 'Otra'
                  : (currentUrl != null ? 'Cambiar' : 'Subir')),
              onPressed: onPick,
            ),
          ],
        ),
      ],
    );
  }

  ImageProvider? _imageProvider() {
    if (newFile != null) return FileImage(newFile!);
    if (currentUrl != null && currentUrl!.isNotEmpty) {
      return NetworkImage(currentUrl!);
    }
    return null;
  }
}
