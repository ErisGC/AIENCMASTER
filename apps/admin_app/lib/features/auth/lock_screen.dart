import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/services/local_auth_service.dart';
import '../../core/state/auth_state.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/theme_toggle.dart';

const _largoPin = 6;

/// Pantalla de bloqueo.
///
/// - Con PIN: teclado numérico propio; al completar los 6 dígitos se verifica
///   solo, sin buscar un botón. Si falla, los puntos tiemblan y se borran.
/// - Con huella: se pide al entrar y queda un botón para volver a intentarlo.
///
/// [inPlace] indica que la app se bloqueó por inactividad con todo abierto:
/// la pantalla se puso encima de lo que estaba haciendo la persona y, al
/// desbloquear, simplemente se quita y deja todo como estaba.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key, this.inPlace = false});

  final bool inPlace;

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen>
    with SingleTickerProviderStateMixin {
  String _pin = '';
  String? _error;
  bool _busy = false;
  bool _showingBio = false;
  bool _ready = false;

  LockMode _mode = LockMode.pin;
  bool _bioAvailable = false;
  bool _bioEnabled = false;
  String _nombre = '';

  /// Cuenta regresiva cuando hay demasiados intentos fallidos.
  int _espera = 0;
  Timer? _reloj;

  /// PIN correcto que no se pudo validar por falta de red: reintentar no
  /// obliga a escribirlo otra vez.
  String? _pinSinRed;

  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _shake.dispose();
    super.dispose();
  }

  /// La huella solo puede sustituir al PIN cuando la sesión YA está en memoria
  /// (modo "solo huella" o re-bloqueo por inactividad). En un arranque en frío
  /// con PIN las cookies están cifradas con la llave del PIN, así que ahí la
  /// huella no basta y se exige el PIN.
  bool get _canUseBio =>
      _bioAvailable && _bioEnabled && Locator.authState.account != null;

  bool get _usaTeclado => _mode == LockMode.pin;

  Future<void> _prepare() async {
    final local = Locator.localAuth;
    _mode = await local.lockMode();
    _bioAvailable = await local.biometricsAvailable();
    _bioEnabled = await local.isBiometricEnabled();
    final cuenta = Locator.authState.account;
    _nombre = cuenta?.displayName.trim().isNotEmpty == true
        ? cuenta!.displayName.trim().split(' ').first
        : (await local.lastName() ??
              cuenta?.username ??
              await local.lastUser() ??
              '');
    await _revisarEspera();
    if (!mounted) return;
    setState(() => _ready = true);
    if (_canUseBio) _tryBiometric();
  }

  Future<void> _revisarEspera() async {
    final secs = await Locator.localAuth.secondsUntilUnlock();
    if (!mounted) return;
    _reloj?.cancel();
    setState(() => _espera = secs);
    if (secs <= 0) return;
    _reloj = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _espera = math.max(0, _espera - 1));
      if (_espera == 0) {
        t.cancel();
        setState(() => _error = null);
      }
    });
  }

  Future<void> _tryBiometric() async {
    if (_showingBio || _busy) return;
    setState(() => _showingBio = true);
    final ok = await Locator.localAuth.authenticate(
      reason: 'Desbloquea AIENC Admin',
    );
    if (!mounted) return;
    setState(() => _showingBio = false);
    if (ok) {
      HapticFeedback.lightImpact();
      if (_enSitio) {
        await _quitarYDesbloquear();
      } else {
        await Locator.authState.unlock();
        _salir();
      }
    }
  }

  /// Bloqueo por inactividad con la sesión en memoria.
  bool get _enSitio =>
      widget.inPlace && Locator.authState.account != null && context.canPop();

  /// Primero se quita esta pantalla y LUEGO se desbloquea. El desbloqueo
  /// refresca el router; si eso ocurre antes de que el router registre que la
  /// pantalla ya se cerró (lo hace al terminar el cuadro), vuelve a ponerla
  /// encima con la ruta vieja. Por eso se espera a que pase ese cuadro.
  Future<void> _quitarYDesbloquear() async {
    context.pop();
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(const Duration(milliseconds: 60));
    await Locator.authState.unlock();
  }

  void _tecla(String d) {
    if (_busy || _espera > 0 || _pin.length >= _largoPin) return;
    HapticFeedback.selectionClick();
    setState(() {
      _pin += d;
      _error = null;
      _pinSinRed = null;
    });
    if (_pin.length == _largoPin) _verificar(_pin);
  }

  void _borrar() {
    if (_busy || _pin.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _verificar(String pin) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    // Deja pintar el estado "Verificando…" antes del cálculo del PIN, que es
    // intensivo a propósito (frena la fuerza bruta).
    await Future<void>.delayed(const Duration(milliseconds: 40));

    if (await Locator.localAuth.isLocked()) {
      await _fallo(null);
      return;
    }
    final ok = await Locator.localAuth.verifyPin(pin);
    if (!ok) {
      await _fallo('PIN incorrecto. Inténtalo de nuevo.');
      return;
    }
    if (_enSitio) {
      HapticFeedback.lightImpact();
      await _quitarYDesbloquear();
      return;
    }
    final outcome = await Locator.authState.unlock(pin: pin);
    if (!mounted) return;
    switch (outcome) {
      case UnlockOutcome.authenticated:
        HapticFeedback.lightImpact();
        _salir();
        break;
      case UnlockOutcome.sessionEnded:
        // La fase cambia sola (contraseña o bienvenida) y el router lleva allá.
        break;
      case UnlockOutcome.networkError:
        setState(() {
          _busy = false;
          _pinSinRed = pin;
          _error = 'No se pudo conectar con el servidor. Revisa tu conexión.';
        });
        break;
    }
  }

  Future<void> _fallo(String? mensaje) async {
    HapticFeedback.heavyImpact();
    _shake.forward(from: 0);
    await _revisarEspera();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _pin = '';
      _error = _espera > 0 ? null : mensaje;
    });
  }

  void _salir() {
    if (!mounted) return;
    context.go('/');
  }

  Future<void> _cerrarSesion() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cerrar sesión?'),
        content: const Text(
          'Tendrás que volver a ingresar con tu usuario y contraseña, y '
          'elegir otra vez cómo proteger la app.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: GemPalette.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await Locator.authState.signOut();
    if (mounted) context.go('/welcome');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final saludo = _nombre.isNotEmpty ? 'Hola, $_nombre' : 'Hola';
    final indicacion = !_ready
        ? ''
        : _usaTeclado
        ? 'Escribe tu PIN para volver al panel.'
        : 'Usa tu huella para volver al panel.';

    return PopScope(
      // Atrás no salta el bloqueo.
      canPop: false,
      child: Scaffold(
        body: Container(
          decoration: BoxDecoration(gradient: GemPalette.welcomeGradient),
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
                    child: Column(
                      children: [
                        const Align(
                          alignment: Alignment.centerRight,
                          child: ThemeToggleButton(),
                        ),
                        const SizedBox(height: 12),
                        _Emblema(busy: _busy || _showingBio),
                        const SizedBox(height: 18),
                        Text(
                          saludo,
                          style: theme.textTheme.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          indicacion,
                          style: TextStyle(color: GemPalette.textMuted),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 26),
                        if (_usaTeclado) ...[
                          _Puntos(
                            llenos: _pin.length,
                            shake: _shake,
                            busy: _busy,
                          ),
                          const SizedBox(height: 14),
                          _Estado(
                            busy: _busy,
                            error: _error,
                            espera: _espera,
                            onReintentar: _pinSinRed == null
                                ? null
                                : () => _verificar(_pinSinRed!),
                          ),
                          const SizedBox(height: 18),
                          _Teclado(
                            habilitado: !_busy && _espera == 0 && _ready,
                            onDigito: _tecla,
                            onBorrar: _borrar,
                            onHuella: _canUseBio ? _tryBiometric : null,
                          ),
                        ] else ...[
                          const SizedBox(height: 8),
                          if (_canUseBio)
                            _BotonHuella(
                              ocupado: _showingBio,
                              onTap: _tryBiometric,
                            )
                          else if (_ready)
                            _SinHuella(
                              onPassword: () =>
                                  Locator.authState.usePasswordInstead(),
                            ),
                          if (_error != null) ...[
                            const SizedBox(height: 14),
                            Text(
                              _error!,
                              style: TextStyle(color: GemPalette.danger),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ],
                        const SizedBox(height: 22),
                        TextButton(
                          onPressed: _busy ? null : _cerrarSesion,
                          style: TextButton.styleFrom(
                            foregroundColor: GemPalette.textMuted,
                          ),
                          child: const Text('Cerrar sesión'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Círculo con el candado. Mientras verifica, un anillo gira alrededor.
class _Emblema extends StatelessWidget {
  const _Emblema({required this.busy});
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96,
      height: 96,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: GemPalette.sapphireEmeraldGradient,
              boxShadow: [
                BoxShadow(
                  color: GemPalette.sapphire.withValues(alpha: 0.3),
                  blurRadius: 26,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: const Icon(
              Icons.lock_outline,
              color: Colors.white,
              size: 40,
            ),
          ),
          if (busy)
            SizedBox(
              width: 96,
              height: 96,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                valueColor: AlwaysStoppedAnimation(GemPalette.topaz),
              ),
            ),
        ],
      ),
    );
  }
}

/// Seis puntos que se llenan con cada dígito y tiemblan si el PIN falla.
class _Puntos extends StatelessWidget {
  const _Puntos({
    required this.llenos,
    required this.shake,
    required this.busy,
  });

  final int llenos;
  final Animation<double> shake;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$llenos de $_largoPin dígitos',
      child: AnimatedBuilder(
        animation: shake,
        builder: (context, child) {
          final t = shake.value;
          final dx = math.sin(t * math.pi * 6) * 12 * (1 - t);
          return Transform.translate(offset: Offset(dx, 0), child: child);
        },
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < _largoPin; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                curve: Curves.easeOut,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                width: i < llenos ? 16 : 14,
                height: i < llenos ? 16 : 14,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < llenos
                      ? (busy ? GemPalette.emerald : GemPalette.sapphire)
                      : Colors.transparent,
                  border: Border.all(
                    color: i < llenos
                        ? Colors.transparent
                        : GemPalette.textMuted.withValues(alpha: 0.55),
                    width: 1.6,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Línea de estado bajo los puntos: verificando, error, espera o reintento.
class _Estado extends StatelessWidget {
  const _Estado({
    required this.busy,
    required this.error,
    required this.espera,
    this.onReintentar,
  });

  final bool busy;
  final String? error;
  final int espera;
  final VoidCallback? onReintentar;

  @override
  Widget build(BuildContext context) {
    final Widget hijo;
    if (busy) {
      hijo = Text(
        'Verificando…',
        style: TextStyle(color: GemPalette.textMuted),
      );
    } else if (espera > 0) {
      hijo = Text(
        'Demasiados intentos. Espera $espera s para intentar de nuevo.',
        style: TextStyle(color: GemPalette.danger, fontWeight: FontWeight.w600),
        textAlign: TextAlign.center,
      );
    } else if (error != null) {
      hijo = Column(
        children: [
          Text(
            error!,
            style: TextStyle(
              color: GemPalette.danger,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
          ),
          if (onReintentar != null)
            TextButton(
              onPressed: onReintentar,
              child: const Text('Reintentar'),
            ),
        ],
      );
    } else {
      hijo = const SizedBox(height: 20);
    }
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: KeyedSubtree(key: ValueKey('$busy|$espera|$error'), child: hijo),
    );
  }
}

/// Teclado numérico grande, cómodo con el pulgar.
class _Teclado extends StatelessWidget {
  const _Teclado({
    required this.habilitado,
    required this.onDigito,
    required this.onBorrar,
    this.onHuella,
  });

  final bool habilitado;
  final ValueChanged<String> onDigito;
  final VoidCallback onBorrar;
  final VoidCallback? onHuella;

  @override
  Widget build(BuildContext context) {
    Widget fila(List<Widget> hijos) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: hijos,
      ),
    );
    Widget d(String n) =>
        _Tecla(etiqueta: n, onTap: habilitado ? () => onDigito(n) : null);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 320),
      child: Column(
        children: [
          fila([d('1'), d('2'), d('3')]),
          fila([d('4'), d('5'), d('6')]),
          fila([d('7'), d('8'), d('9')]),
          fila([
            onHuella != null
                ? _Tecla(
                    icono: Icons.fingerprint,
                    semantica: 'Desbloquear con huella',
                    sinFondo: true,
                    onTap: onHuella,
                  )
                : const SizedBox(width: _Tecla.size, height: _Tecla.size),
            d('0'),
            _Tecla(
              icono: Icons.backspace_outlined,
              semantica: 'Borrar',
              sinFondo: true,
              onTap: habilitado ? onBorrar : null,
            ),
          ]),
        ],
      ),
    );
  }
}

class _Tecla extends StatelessWidget {
  const _Tecla({
    this.etiqueta,
    this.icono,
    this.semantica,
    this.sinFondo = false,
    this.onTap,
  });

  static const double size = 74;

  final String? etiqueta;
  final IconData? icono;
  final String? semantica;
  final bool sinFondo;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final activo = onTap != null;
    return Semantics(
      button: true,
      label: semantica ?? etiqueta,
      child: Material(
        color: sinFondo
            ? Colors.transparent
            : GemPalette.surface.withValues(
                alpha: GemPalette.current.isDark ? 0.7 : 0.92,
              ),
        shape: CircleBorder(
          side: sinFondo
              ? BorderSide.none
              : BorderSide(color: GemPalette.borderSoft),
        ),
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Center(
              child: etiqueta != null
                  ? Text(
                      etiqueta!,
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w600,
                        color: GemPalette.textPrimary.withValues(
                          alpha: activo ? 1 : 0.35,
                        ),
                      ),
                    )
                  : Icon(
                      icono,
                      size: 28,
                      color: GemPalette.textPrimary.withValues(
                        alpha: activo ? 0.9 : 0.3,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BotonHuella extends StatelessWidget {
  const _BotonHuella({required this.ocupado, required this.onTap});
  final bool ocupado;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Material(
          color: GemPalette.surface,
          shape: CircleBorder(side: BorderSide(color: GemPalette.borderSoft)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: ocupado ? null : onTap,
            child: SizedBox(
              width: 92,
              height: 92,
              child: Icon(
                Icons.fingerprint,
                size: 52,
                color: GemPalette.sapphire,
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          ocupado ? 'Esperando tu huella…' : 'Toca para usar tu huella',
          style: TextStyle(color: GemPalette.textMuted),
        ),
      ],
    );
  }
}

/// Modo "solo huella" pero el teléfono ya no la ofrece (se quitó la huella
/// del sistema): en vez de dejar a la persona encerrada, entra con contraseña.
class _SinHuella extends StatelessWidget {
  const _SinHuella({required this.onPassword});
  final VoidCallback onPassword;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'La huella no está disponible en este teléfono.',
          style: TextStyle(color: GemPalette.textMuted),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: GemPalette.sapphire,
            foregroundColor: Colors.white,
            minimumSize: const Size(0, 48),
          ),
          onPressed: onPassword,
          icon: const Icon(Icons.key_outlined),
          label: const Text('Entrar con mi contraseña'),
        ),
      ],
    );
  }
}
