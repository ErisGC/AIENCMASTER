import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/state/auth_state.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Confirmación de contraseña de la cuenta.
///
/// Se muestra cuando la sesión del servidor ya no vale o cuando toca el control
/// periódico. NO es un inicio de sesión desde cero: el usuario ya está
/// recordado y su PIN/huella se conservan; sólo confirma su contraseña.
class ReauthScreen extends StatefulWidget {
  const ReauthScreen({super.key});

  @override
  State<ReauthScreen> createState() => _ReauthScreenState();
}

class _ReauthScreenState extends State<ReauthScreen> {
  final _passwordCtrl = TextEditingController();
  String? _username;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Locator.localAuth.lastUser().then((u) {
      if (mounted) setState(() => _username = u);
    });
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final user = _username;
    if (_submitting || user == null) return;
    if (_passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Escribe tu contraseña.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final session = await Locator.auth.login(
        username: user,
        password: _passwordCtrl.text,
      );
      if (session.status != 'ACTIVE' || session.account == null) {
        setState(() => _error = 'No se pudo confirmar la sesión.');
        return;
      }
      await Locator.authState.onLoginSuccess(session.account!);
      if (!mounted) return;
      context.go('/');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo conectar. Revisa tu conexión.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// Vuelve a comprobar la sesión. Si seguía válida (el fallo era de red),
  /// el router entra solo al panel sin pedir nada.
  Future<void> _retrySession() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    await Locator.authState.bootstrap();
    if (!mounted) return;
    setState(() => _submitting = false);
    if (Locator.authState.phase == AuthPhase.needsPassword) {
      setState(() => _error =
          'La sesión ya no está activa. Confirma tu contraseña para continuar.');
    }
  }

  /// Salida explícita: borra la protección local y vuelve al inicio.
  Future<void> _useAnotherAccount() async {
    await Locator.authState.signOut();
    if (mounted) context.go('/welcome');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Confirma tu contraseña',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _username == null
                          ? 'Por seguridad, vuelve a escribir tu contraseña.'
                          : 'Por seguridad, confirma la contraseña de @$_username '
                              'para seguir usando la app. Tu PIN y tu huella se '
                              'mantienen como los tienes.',
                      style: const TextStyle(
                          color: GemPalette.textMuted, height: 1.5),
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: _passwordCtrl,
                      decoration:
                          const InputDecoration(labelText: 'Contraseña'),
                      obscureText: true,
                      autofocus: true,
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 16),
                    GemPrimaryButton(
                      label: 'Continuar',
                      loading: _submitting,
                      onPressed: _submit,
                    ),
                    const SizedBox(height: 6),
                    // Si llegamos aquí por un corte de red o porque el
                    // servidor estaba arrancando, la sesión puede seguir viva:
                    // reintentar evita escribir la contraseña sin necesidad.
                    TextButton(
                      onPressed: _submitting ? null : _retrySession,
                      child: const Text('Reintentar sin contraseña'),
                    ),
                    TextButton(
                      onPressed: _submitting ? null : _useAnotherAccount,
                      child: const Text('Entrar con otra cuenta'),
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
