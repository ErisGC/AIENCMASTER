import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/state/auth_state.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Pantalla de bloqueo: muestra biometric prompt automáticamente al entrar.
/// Si falla o el usuario lo cierra, ofrece PIN manualmente.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  final _pinCtrl = TextEditingController();
  bool _showingBio = false;
  String? _error;
  bool _bioAvailable = false;
  bool _bioEnabled = false;

  @override
  void initState() {
    super.initState();
    _bootstrapLock();
  }

  /// La huella sólo puede sustituir al PIN cuando la sesión YA está cargada en
  /// memoria (caso "sólo huella", o re-bloqueo por inactividad). En un arranque
  /// en frío CON PIN las cookies están cifradas con la llave derivada de ese
  /// PIN, así que la huella no bastaría para descifrarlas: ahí exigimos el PIN.
  bool get _canUseBio =>
      _bioAvailable && _bioEnabled && Locator.authState.account != null;

  Future<void> _bootstrapLock() async {
    _bioAvailable = await Locator.localAuth.biometricsAvailable();
    _bioEnabled = await Locator.localAuth.isBiometricEnabled();
    if (mounted) setState(() {});
    if (_canUseBio) {
      _tryBiometric();
    }
  }

  Future<void> _tryBiometric() async {
    if (_showingBio) return;
    setState(() => _showingBio = true);
    final ok = await Locator.localAuth
        .authenticate(reason: 'Desbloquea AIENC Admin');
    if (!mounted) return;
    setState(() => _showingBio = false);
    if (ok) {
      await Locator.authState.unlock();
      if (mounted) context.go('/');
    }
  }

  Future<void> _submitPin() async {
    if (await Locator.localAuth.isLocked()) {
      final secs = await Locator.localAuth.secondsUntilUnlock();
      if (mounted) {
        setState(() => _error =
            'Demasiados intentos. Espera $secs s antes de reintentar.');
      }
      return;
    }

    final ok = await Locator.localAuth.verifyPin(_pinCtrl.text);
    if (!ok) {
      final secs = await Locator.localAuth.secondsUntilUnlock();
      if (mounted) {
        setState(() => _error = secs > 0
            ? 'Demasiados intentos. Espera $secs s antes de reintentar.'
            : 'PIN incorrecto');
      }
      _pinCtrl.clear();
      return;
    }
    final outcome = await Locator.authState.unlock(pin: _pinCtrl.text);
    if (!mounted) return;
    switch (outcome) {
      case UnlockOutcome.authenticated:
      case UnlockOutcome.sessionEnded:
        // authenticated → home; sessionEnded → fase signedOut y el router
        // redirige solo a /welcome.
        context.go('/');
        break;
      case UnlockOutcome.networkError:
        // La sesión se conserva y el PIN era correcto: sólo falló la red.
        // No limpiamos el campo para que reintentar sea un solo toque.
        setState(() => _error =
            'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        break;
    }
  }

  @override
  void dispose() {
    _pinCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final username = Locator.authState.account?.username ?? '';
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Container(
                width: 88,
                height: 88,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: GemPalette.sapphireEmeraldGradient,
                ),
                child: const Icon(
                  Icons.lock_outline,
                  color: Colors.white,
                  size: 46,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Hola${username.isNotEmpty ? ', $username' : ''}',
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              const Text(
                'Desbloquea para volver al panel.',
                style: TextStyle(color: GemPalette.textMuted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              if (_canUseBio)
                OutlinedButton.icon(
                  icon: const Icon(Icons.fingerprint),
                  label: const Text('Desbloquear con biometría'),
                  onPressed: _tryBiometric,
                ),
              const SizedBox(height: 18),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('PIN de 6 dígitos',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _pinCtrl,
                      keyboardType: TextInputType.number,
                      obscureText: true,
                      maxLength: 6,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 22,
                          letterSpacing: 8,
                          fontWeight: FontWeight.w800),
                      decoration: const InputDecoration(
                        counterText: '',
                        hintText: '••••••',
                      ),
                      onSubmitted: (_) => _submitPin(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 14),
                    GemPrimaryButton(
                      label: 'Desbloquear',
                      onPressed: _submitPin,
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Builder(builder: (innerCtx) {
                return TextButton(
                  onPressed: () async {
                    await Locator.authState.signOut();
                    if (!innerCtx.mounted) return;
                    innerCtx.go('/welcome');
                  },
                  child: const Text('Cerrar sesión'),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
