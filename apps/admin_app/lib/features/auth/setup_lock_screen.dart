import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/services/local_auth_service.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Elección de cómo proteger la app. Es OPCIONAL y se pregunta UNA sola vez:
/// la decisión queda guardada y en los siguientes ingresos se respeta.
/// Se puede cambiar después desde Seguridad.
class SetupLockScreen extends StatefulWidget {
  const SetupLockScreen({super.key});

  @override
  State<SetupLockScreen> createState() => _SetupLockScreenState();
}

class _SetupLockScreenState extends State<SetupLockScreen> {
  final _pinCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _bioAvailable = false;
  bool _showPinForm = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Locator.localAuth.biometricsAvailable().then((b) {
      if (mounted) setState(() => _bioAvailable = b);
    });
  }

  @override
  void dispose() {
    _pinCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  /// Opción 1: huella. Pedimos una confirmación real antes de activarla, para
  /// no dejar al usuario con un bloqueo que su teléfono no puede satisfacer.
  Future<void> _useBiometrics() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final ok = await Locator.localAuth.authenticate(
        reason: 'Confirma tu huella para activarla en AIENC',
      );
      if (!ok) {
        setState(() => _error =
            'No se pudo verificar la huella. Puedes intentarlo de nuevo o continuar sin protección.');
        return;
      }
      // Al elegir huella el PIN deja de existir. Y como las cookies podían
      // estar cifradas con la llave de ese PIN, hay que devolverlas a texto
      // plano ANTES de borrarlo: si no, quedarían cifradas con una llave que
      // ya nadie puede derivar y el próximo arranque perdería la sesión.
      await ApiClient.I.rekeyCookies(null);
      await Locator.localAuth.clearPin();
      await Locator.localAuth.setLockMode(LockMode.bio);
      if (!mounted) return;
      context.go('/');
    } catch (_) {
      setState(() => _error = 'No se pudo activar la huella.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Opción 2: PIN de 6 dígitos (para teléfonos sin huella o si se prefiere).
  Future<void> _savePin() async {
    if (_saving) return;
    final pin = _pinCtrl.text;
    if (pin.length != 6) {
      setState(() => _error = 'El PIN debe tener exactamente 6 dígitos.');
      return;
    }
    if (pin != _confirmCtrl.text) {
      setState(() => _error = 'Los PIN no coinciden.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await Locator.localAuth.setPin(pin);
      // Cifra en reposo las cookies ya guardadas con la llave derivada del PIN,
      // sin perder la sesión activa.
      final key = await Locator.localAuth.deriveCookieKey(pin);
      if (key != null) {
        await ApiClient.I.rekeyCookies(key);
      }
      await Locator.localAuth.setLockMode(LockMode.pin);
      if (!mounted) return;
      context.go('/');
    } catch (_) {
      setState(() => _error = 'No se pudo guardar el PIN.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Opción 3: sin protección. Se recuerda para no volver a preguntar.
  Future<void> _skip() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      // Igual que con la huella: si venía de PIN, devolvemos las cookies a
      // texto plano antes de borrarlo para no perder la sesión.
      await ApiClient.I.rekeyCookies(null);
      await Locator.localAuth.clearPin();
      await Locator.localAuth.setLockMode(LockMode.none);
      if (!mounted) return;
      context.go('/');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Proteger la app')),
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
                      '¿Cómo quieres entrar a la app?',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Esto es opcional y solo se pregunta una vez. Puedes '
                      'cambiarlo después desde Seguridad. Pase lo que pase, '
                      'todo lo que hagas queda registrado en la auditoría.',
                      style:
                          TextStyle(color: GemPalette.textMuted, height: 1.5),
                    ),
                    const SizedBox(height: 18),

                    if (_bioAvailable) ...[
                      GemPrimaryButton(
                        label: 'Entrar con mi huella',
                        loading: _saving,
                        onPressed: _useBiometrics,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Recomendado: usa la huella o el rostro que ya tienes '
                        'configurado en el teléfono.',
                        style: TextStyle(
                            color: GemPalette.textMuted, fontSize: 12),
                      ),
                      const SizedBox(height: 16),
                    ] else ...[
                      const Text(
                        'Este teléfono no tiene huella o rostro configurado. '
                        'Puedes usar un PIN o entrar sin protección.',
                        style: TextStyle(
                            color: GemPalette.textMuted, fontSize: 12),
                      ),
                      const SizedBox(height: 16),
                    ],

                    if (!_showPinForm)
                      OutlinedButton.icon(
                        icon: const Icon(Icons.pin_outlined, size: 18),
                        label: const Text('Prefiero un PIN de 6 dígitos'),
                        onPressed: _saving
                            ? null
                            : () => setState(() => _showPinForm = true),
                      ),

                    if (_showPinForm) ...[
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
                      const SizedBox(height: 10),
                      GemPrimaryButton(
                        label: 'Guardar PIN',
                        loading: _saving,
                        onPressed: _savePin,
                      ),
                    ],

                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      GemErrorBanner(message: _error!),
                    ],

                    const SizedBox(height: 18),
                    TextButton(
                      onPressed: _saving ? null : _skip,
                      child: const Text('Entrar sin protección'),
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
