import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Tras login se ofrece (no obligatorio) activar biometría y PIN para
/// no tener que escribir contraseña en cada arranque.
class SetupLockScreen extends StatefulWidget {
  const SetupLockScreen({super.key});

  @override
  State<SetupLockScreen> createState() => _SetupLockScreenState();
}

class _SetupLockScreenState extends State<SetupLockScreen> {
  final _pinCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _enableBio = false;
  bool _bioAvailable = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Locator.localAuth.biometricsAvailable().then((b) {
      if (mounted) {
        setState(() {
          _bioAvailable = b;
          _enableBio = b;
        });
      }
    });
  }

  @override
  void dispose() {
    _pinCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final pin = _pinCtrl.text;
    if (pin.length != 6) {
      setState(() => _error = 'El PIN debe tener exactamente 6 dígitos.');
      return;
    }
    if (pin != _confirmCtrl.text) {
      setState(() => _error = 'Los PIN no coinciden.');
      return;
    }
    setState(() => _saving = true);
    try {
      await Locator.localAuth.setPin(pin);
      await Locator.localAuth.setBiometricEnabled(_enableBio);
      // Cifra en reposo las cookies ya guardadas (texto plano) con la llave
      // derivada del nuevo PIN, sin perder la sesión activa. A partir de aquí
      // el bloqueo protege la credencial en disco, no sólo la pantalla.
      final key = await Locator.localAuth.deriveCookieKey(pin);
      if (key != null) {
        await ApiClient.I.rekeyCookies(key);
      }
      if (!mounted) return;
      context.go('/');
    } catch (_) {
      setState(() => _error = 'No se pudo guardar la configuración.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _skip() async {
    // Sin PIN: el próximo arranque pedirá contraseña otra vez.
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Asegurar acceso'),
        actions: [
          TextButton(
            onPressed: _saving ? null : _skip,
            child: const Text('Omitir'),
          ),
        ],
      ),
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
                      'Define un PIN para esta app',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'En el próximo arranque podrás desbloquear con tu '
                      'huella o pegando este PIN, sin tener que volver a '
                      'escribir tu contraseña.',
                      style:
                          TextStyle(color: GemPalette.textMuted, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _pinCtrl,
                      decoration: const InputDecoration(
                        labelText: 'PIN (6 dígitos)',
                      ),
                      keyboardType: TextInputType.number,
                      obscureText: true,
                      maxLength: 6,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                    ),
                    TextField(
                      controller: _confirmCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Confirmar PIN',
                      ),
                      keyboardType: TextInputType.number,
                      obscureText: true,
                      maxLength: 6,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_bioAvailable)
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        value: _enableBio,
                        onChanged: (v) => setState(() => _enableBio = v),
                        title: const Text('Activar biometría'),
                        subtitle: const Text(
                          'Huella o reconocimiento facial del dispositivo',
                          style: TextStyle(color: GemPalette.textMuted),
                        ),
                      ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 16),
                    GemPrimaryButton(
                      label: 'Guardar y continuar',
                      loading: _saving,
                      onPressed: _save,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
