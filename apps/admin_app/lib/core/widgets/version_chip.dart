import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../theme/gem_palette.dart';

/// Pequeño chip "AIENC Admin v0.1.0 (1)" para esquinas de pantallas
/// de auth. Útil cuando un admin reporta un bug por WhatsApp y necesitas
/// saber qué build tiene.
class VersionChip extends StatefulWidget {
  const VersionChip({super.key});

  @override
  State<VersionChip> createState() => _VersionChipState();
}

class _VersionChipState extends State<VersionChip> {
  String? _label;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _label = 'v${info.version} (${info.buildNumber})';
        });
      }
    } catch (_) {
      // si falla por cualquier razón, dejamos el chip oculto
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _label;
    if (l == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: GemPalette.chip,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(
          color: GemPalette.borderSoft.withValues(alpha: 0.6),
        ),
      ),
      child: Text(
        l,
        style: TextStyle(
          color: GemPalette.textMuted,
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          fontFamily: 'monospace',
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
