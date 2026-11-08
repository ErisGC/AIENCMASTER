import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/version_chip.dart';
import '../../core/widgets/theme_toggle.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _submitting = false;
  bool _verClave = false;
  String? _error;

  /// El servidor aceptó la contraseña pero este teléfono aún no está
  /// aprobado. Antes se mostraba "No se pudo iniciar sesión" y la persona no
  /// sabía que le faltaba la aprobación del administrador principal.
  bool _pendiente = false;

  /// Mientras espera, la app mira sola si ya la aprobaron (como la web), sin
  /// obligar a tocar "Ya lo aprobaron, entrar".
  Timer? _vigia;

  @override
  void initState() {
    super.initState();
    // Pre-cargar último usuario para conveniencia.
    Locator.localAuth.lastUser().then((u) {
      if (u != null && mounted) _usernameCtrl.text = u;
    });
  }

  @override
  void dispose() {
    _vigia?.cancel();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (_usernameCtrl.text.trim().isEmpty || _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Escribe tu usuario y tu contraseña.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
      _pendiente = false;
    });
    try {
      final session = await Locator.auth.login(
        username: _usernameCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (session.status == 'PENDING') {
        setState(() => _pendiente = true);
        _vigia?.cancel();
        _vigia = Timer.periodic(
          const Duration(seconds: 4),
          (_) => _revisarAprobacion(),
        );
        return;
      }
      if (session.status != 'ACTIVE' || session.account == null) {
        setState(() => _error = 'No se pudo iniciar sesión.');
        return;
      }
      await _entrar(session);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Error inesperado. Intenta de nuevo.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _revisarAprobacion() async {
    if (!_pendiente || _submitting || !mounted) return;
    try {
      final s = await Locator.auth.getSession();
      if (!mounted || !_pendiente || _submitting) return;
      if (s.status == 'PENDING') return;
      _vigia?.cancel();
      if (s.status == 'ACTIVE' && s.account != null) {
        setState(() => _submitting = true);
        try {
          await _entrar(s);
        } finally {
          if (mounted) setState(() => _submitting = false);
        }
      } else if (s.status == 'REJECTED' || s.status == 'REVOKED') {
        setState(() {
          _pendiente = false;
          _error = 'El administrador principal no aprobó este teléfono.';
        });
      }
      // Otro estado (por ejemplo, la solicitud venció): queda el botón para
      // volver a intentarlo a mano.
    } catch (_) {
      // Red inestable: se vuelve a mirar en la próxima vuelta.
    }
  }

  Future<void> _entrar(SessionResponse session) async {
    await Locator.authState.onLoginSuccess(
      session.account!,
      isRootDevice: session.isRootDevice,
    );
    // Solo ofrecemos configurar la protección local la PRIMERA vez. Si el
    // usuario ya decidió (huella, PIN o nada), respetamos su elección y
    // entramos directo: antes se le forzaba esta pantalla en cada login.
    final yaDecidio = await Locator.localAuth.lockChoiceMade();
    if (!mounted) return;
    context.go(yaDecidio ? '/' : '/setup-lock');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: GemAppBar(title: const Text('Iniciar sesión')),
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
                      'Accede con tu cuenta',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Usa el usuario y la contraseña que configuraste al '
                      'aceptar tu invitación.',
                      style: TextStyle(
                        color: GemPalette.textMuted,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 18),
                    AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: _usernameCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Usuario',
                              hintText: 'pastor.juan',
                            ),
                            autocorrect: false,
                            enableSuggestions: false,
                            textCapitalization: TextCapitalization.none,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.username],
                            onSubmitted: (_) => _passwordFocus.requestFocus(),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passwordCtrl,
                            focusNode: _passwordFocus,
                            decoration: InputDecoration(
                              labelText: 'Contraseña',
                              suffixIcon: IconButton(
                                tooltip: _verClave
                                    ? 'Ocultar contraseña'
                                    : 'Mostrar contraseña',
                                icon: Icon(
                                  _verClave
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                ),
                                onPressed: () =>
                                    setState(() => _verClave = !_verClave),
                              ),
                            ),
                            obscureText: !_verClave,
                            textInputAction: TextInputAction.done,
                            autofillHints: const [AutofillHints.password],
                            onSubmitted: (_) => _submit(),
                          ),
                        ],
                      ),
                    ),
                    if (_pendiente) ...[
                      const SizedBox(height: 14),
                      _AvisoPendiente(),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      GemErrorBanner(message: _error!),
                    ],
                    const SizedBox(height: 18),
                    GemPrimaryButton(
                      label: _pendiente ? 'Ya lo aprobaron, entrar' : 'Entrar',
                      loading: _submitting,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              TextButton(
                onPressed: () => context.push('/invite'),
                child: const Text('Tengo una invitación nueva'),
              ),
              const SizedBox(height: 12),
              const Center(child: VersionChip()),
            ],
          ),
        ),
      ),
    );
  }
}

/// Explica qué falta cuando el teléfono quedó pendiente de aprobación.
class _AvisoPendiente extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: GemPalette.topaz.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GemPalette.topaz.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.hourglass_top_rounded,
            color: GemPalette.topazText,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Tu usuario y contraseña están bien, pero este teléfono todavía '
              'no está aprobado. El administrador principal debe aprobarlo en '
              'Seguridad. Cuando lo haga, vuelve a tocar Entrar.',
              style: TextStyle(color: GemPalette.textPrimary, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}
