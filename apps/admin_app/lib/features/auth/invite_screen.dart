import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

class InviteScreen extends StatefulWidget {
  final String? initialToken;
  const InviteScreen({super.key, this.initialToken});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  final _tokenCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  InvitationPreview? _preview;
  bool _loading = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialToken != null && widget.initialToken!.isNotEmpty) {
      _tokenCtrl.text = widget.initialToken!;
      // dispara preview automático.
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadPreview());
    }
  }

  @override
  void dispose() {
    _tokenCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  /// Acepta lo que sea que pegue el invitado y saca el token:
  /// el enlace de la app (aiencadmin://invite?token=XYZ), el enlace web
  /// (https://…/admin/invite/XYZ), un "token=XYZ" suelto, o el token pelado.
  /// Antes había que aislar el token a mano y cualquier resto invalidaba todo.
  String _extractToken(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) {
      final fromQuery = uri.queryParameters['token'];
      if (fromQuery != null && fromQuery.trim().isNotEmpty) {
        return fromQuery.trim();
      }
      if (uri.pathSegments.isNotEmpty) {
        final last = uri.pathSegments.last.trim();
        if (last.isNotEmpty) return Uri.decodeComponent(last);
      }
    }

    final match = RegExp(r'token=([^&\s]+)').firstMatch(value);
    if (match != null) return Uri.decodeComponent(match.group(1)!).trim();

    return value;
  }

  Future<void> _loadPreview() async {
    final t = _extractToken(_tokenCtrl.text);
    if (t.isEmpty) return;
    // Dejamos en el campo el token ya limpio, para que se vea qué se envió.
    if (t != _tokenCtrl.text) _tokenCtrl.text = t;
    setState(() {
      _loading = true;
      _error = null;
      _preview = null;
    });
    try {
      final p = await Locator.auth.previewInvitation(t);
      setState(() => _preview = p);
    } on ApiException catch (e) {
      setState(() => _error = e.statusCode == 404
          // El backend responde 404 cuando el token no corresponde a ninguna
          // invitación: casi siempre es un enlace incompleto al copiarlo.
          ? 'No encontramos esa invitación. Revisa que hayas pegado el enlace '
              'completo, o pídele uno nuevo al administrador.'
          : e.message);
    } catch (_) {
      setState(() => _error =
          'No se pudo verificar la invitación. Revisa tu conexión.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _accept() async {
    if (_submitting) return;
    if (_preview == null || !_preview!.valid) return;
    final pwd = _passwordCtrl.text;
    if (pwd.length < 8 || pwd.length > 128) {
      setState(() => _error = 'La contraseña debe tener 8–128 caracteres.');
      return;
    }
    if (pwd != _confirmCtrl.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await Locator.auth.acceptInvitation(_extractToken(_tokenCtrl.text), pwd);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cuenta activada. Inicia sesión con tu usuario.'),
        ),
      );
      context.go('/login');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo aceptar la invitación.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;

    return Scaffold(
      appBar: AppBar(title: const Text('Activar invitación')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Pega tu enlace o token',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Pega aquí el enlace completo que te enviaron. No hace '
                      'falta recortar nada: la app toma el token sola.',
                      style:
                          TextStyle(color: GemPalette.textMuted, height: 1.5),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _tokenCtrl,
                      minLines: 1,
                      maxLines: 3,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'Enlace o token de invitación',
                      ),
                      onSubmitted: (_) => _loadPreview(),
                    ),
                    const SizedBox(height: 12),
                    GemPrimaryButton(
                      label: 'Verificar invitación',
                      loading: _loading,
                      onPressed: _loadPreview,
                    ),
                  ],
                ),
              ),
              if (preview != null && preview.valid) ...[
                const SizedBox(height: 16),
                GemCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Icon(
                            preview.targetRole == 'ROOT'
                                ? Icons.shield_outlined
                                : Icons.verified_user_outlined,
                            color: preview.targetRole == 'ROOT'
                                ? GemPalette.amethyst
                                : GemPalette.emerald,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              preview.targetRole == 'ROOT'
                                  ? 'Invitación válida (cuenta principal)'
                                  : 'Invitación válida',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                        ],
                      ),
                      if (preview.targetRole == 'ROOT')
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: GemPalette.amethyst.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: GemPalette.amethyst.withValues(alpha: 0.4),
                              ),
                            ),
                            child: const Text(
                              'Estás activando una cuenta de administrador '
                              'principal (ROOT). Tendrás acceso total al '
                              'sistema. Usa una contraseña fuerte y guárdala '
                              'en privado.',
                              style: TextStyle(
                                color: GemPalette.amethyst,
                                fontSize: 12.5,
                                height: 1.45,
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      _InfoRow(label: 'Usuario', value: preview.username ?? '—'),
                      _InfoRow(
                          label: 'Nombre', value: preview.displayName ?? '—'),
                      if (preview.targetRole != 'ROOT')
                        _InfoRow(
                            label: 'Iglesia',
                            value: preview.churchName ?? '—'),
                      _InfoRow(
                          label: 'Rol',
                          value: preview.targetRole == 'ROOT'
                              ? 'Administrador principal'
                              : 'Administrador'),
                      if (preview.expiresAt != null)
                        _InfoRow(
                          label: 'Expira',
                          value: DateFormat('dd MMM yyyy, HH:mm', 'es')
                              .format(preview.expiresAt!.toLocal()),
                        ),
                      const SizedBox(height: 16),
                      Text(
                        'Define tu contraseña',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Mínimo 8 caracteres. Combina letras, números y '
                        'símbolos. No podrás recuperarla sin ayuda del ROOT.',
                        style: TextStyle(
                          color: GemPalette.textMuted,
                          fontSize: 12.5,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _passwordCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Nueva contraseña',
                        ),
                        obscureText: true,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _confirmCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Confirmar contraseña',
                        ),
                        obscureText: true,
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        GemErrorBanner(message: _error!),
                      ],
                      const SizedBox(height: 16),
                      GemPrimaryButton(
                        label: 'Activar cuenta',
                        loading: _submitting,
                        onPressed: _accept,
                      ),
                    ],
                  ),
                ),
              ] else if (preview != null && !preview.valid) ...[
                const SizedBox(height: 16),
                GemErrorBanner(
                  message: switch (preview.status) {
                    'ACCEPTED' =>
                      'Esta invitación ya fue aceptada. Inicia sesión normalmente.',
                    'REVOKED' => 'Esta invitación fue revocada.',
                    'EXPIRED' =>
                      'Esta invitación expiró. Solicita una nueva al ROOT.',
                    _ => 'Esta invitación no está disponible.',
                  },
                ),
              ] else if (_error != null) ...[
                const SizedBox(height: 16),
                GemErrorBanner(message: _error!),
              ],
              const SizedBox(height: 18),
              TextButton(
                onPressed: () => context.go('/login'),
                child: const Text('Ya tengo cuenta — iniciar sesión'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: const TextStyle(
                    color: GemPalette.textMuted, fontSize: 12.5)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
