import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/services/local_auth_service.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';

/// Resultado de la hoja de aprobación.
enum ApprovalOutcome { approved, rejected, dismissed }

/// "¿Eres tú?": alguien entró con tu usuario y contraseña en un navegador y
/// espera que lo apruebes. Se toca el número que muestra esa pantalla (de
/// tres opciones) y se confirma con la huella o el PIN de la app.
Future<ApprovalOutcome> showApprovalSheet(
  BuildContext context,
  LinkedRequest request,
) async {
  final r = await showModalBottomSheet<ApprovalOutcome>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _ApprovalSheet(request: request),
  );
  return r ?? ApprovalOutcome.dismissed;
}

/// Pide la huella o el PIN de la app antes de una acción sensible. Si la app
/// no tiene protección configurada, basta con la confirmación en pantalla.
Future<bool> confirmarIdentidad(BuildContext context, String motivo) async {
  final local = Locator.localAuth;
  final modo = await local.lockMode();
  if (modo == LockMode.bio && await local.isBiometricEnabled()) {
    return local.authenticate(reason: motivo);
  }
  if (modo == LockMode.pin && await local.hasPin()) {
    if (!context.mounted) return false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _PinDialog(motivo: motivo),
    );
    return ok == true;
  }
  return true;
}

class _ApprovalSheet extends StatefulWidget {
  const _ApprovalSheet({required this.request});
  final LinkedRequest request;

  @override
  State<_ApprovalSheet> createState() => _ApprovalSheetState();
}

class _ApprovalSheetState extends State<_ApprovalSheet> {
  bool _busy = false;
  String? _error;

  /// La solicitud ya no se puede aprobar (número equivocado o vencida): solo
  /// queda cerrar el aviso.
  bool _cancelada = false;

  Timer? _vigencia;

  @override
  void initState() {
    super.initState();
    // Si ese ingreso deja de esperar (se resolvió en otro lado, venció o se
    // cerró la ventana), el aviso se cierra solo en vez de quedarse encima.
    _vigencia = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (_busy || _cancelada) return;
      try {
        final data = await Locator.linkedDevices.overview();
        final sigue = data.pending.any((r) => r.id == widget.request.id);
        if (!sigue && mounted) _cerrarSiEstaArriba(context);
      } catch (_) {
        // Sin red: se vuelve a mirar en la próxima vuelta.
      }
    });
  }

  @override
  void dispose() {
    _vigencia?.cancel();
    super.dispose();
  }

  Future<void> _elegir(String codigo) async {
    if (_busy || _cancelada) return;
    HapticFeedback.selectionClick();
    final ok = await confirmarIdentidad(
      context,
      'Confirma que eres tú para aprobar el ingreso',
    );
    if (!ok || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Locator.linkedDevices.approve(widget.request.id, codigo);
      HapticFeedback.lightImpact();
      if (mounted) Navigator.pop(context, ApprovalOutcome.approved);
    } on ApiException catch (e) {
      // El servidor explica qué pasó (número equivocado, ya venció...).
      final raw = e.raw;
      final msg = raw is Map && raw['message'] is String
          ? raw['message'] as String
          : e.message;
      if (mounted) {
        setState(() {
          _busy = false;
          _error = msg;
          _cancelada = e.statusCode == 400 || e.statusCode == 409;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = userMessageFor(e);
        });
      }
    }
  }

  Future<void> _rechazar() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await Locator.linkedDevices.reject(widget.request.id);
      if (mounted) Navigator.pop(context, ApprovalOutcome.rejected);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = userMessageFor(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    final theme = Theme.of(context);
    final detalle = [
      if (r.browser.isNotEmpty) r.browser,
      if (r.platform.isNotEmpty) r.platform,
      if (r.ip != null && r.ip!.isNotEmpty) 'IP ${r.ip}',
    ].join(' · ');

    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        0,
        22,
        22 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: GemPalette.sapphireEmeraldGradient,
                ),
                child: const Icon(Icons.computer_outlined, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text('¿Eres tú?', style: theme.textTheme.headlineSmall),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'Alguien entró con tu usuario y contraseña en "${r.deviceName}" y '
            'espera tu aprobación.',
            style: TextStyle(color: GemPalette.textPrimary, height: 1.45),
          ),
          if (detalle.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(detalle, style: TextStyle(color: GemPalette.textMuted)),
          ],
          const SizedBox(height: 18),
          Text(
            'Toca el número que ves en esa pantalla:',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final c in r.codeOptions) ...[
                Expanded(
                  child: _BotonNumero(
                    numero: c,
                    onTap: _busy || _cancelada ? null : () => _elegir(c),
                  ),
                ),
                if (c != r.codeOptions.last) const SizedBox(width: 10),
              ],
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(
              _error!,
              style: TextStyle(
                color: GemPalette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 18),
          if (_busy)
            const Center(child: CircularProgressIndicator())
          else if (_cancelada)
            FilledButton(
              onPressed: () =>
                  Navigator.pop(context, ApprovalOutcome.dismissed),
              child: const Text('Cerrar'),
            )
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GemPalette.danger,
                    ),
                    icon: const Icon(Icons.block),
                    label: const Text('No fui yo'),
                    onPressed: _rechazar,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextButton(
                    onPressed: () =>
                        Navigator.pop(context, ApprovalOutcome.dismissed),
                    child: const Text('Ahora no'),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _BotonNumero extends StatelessWidget {
  const _BotonNumero({required this.numero, required this.onTap});
  final String numero;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: GemPalette.surface,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 76,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: GemPalette.borderSoft, width: 1.5),
          ),
          child: Text(
            numero,
            semanticsLabel: 'Número $numero',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: GemPalette.sapphire,
            ),
          ),
        ),
      ),
    );
  }
}

class _PinDialog extends StatefulWidget {
  const _PinDialog({required this.motivo});
  final String motivo;

  @override
  State<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<_PinDialog> {
  final _ctrl = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _verificar() async {
    if (_busy || _ctrl.text.length != 6) return;
    setState(() => _busy = true);
    final ok = await Locator.localAuth.verifyPin(_ctrl.text);
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
      return;
    }
    final espera = await Locator.localAuth.secondsUntilUnlock();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _ctrl.clear();
      _error = espera > 0
          ? 'Demasiados intentos. Espera $espera s.'
          : 'PIN incorrecto.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Escribe tu PIN'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.motivo, style: TextStyle(color: GemPalette.textMuted)),
          const SizedBox(height: 12),
          TextField(
            controller: _ctrl,
            autofocus: true,
            obscureText: true,
            maxLength: 6,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, letterSpacing: 8),
            decoration: InputDecoration(counterText: '', errorText: _error),
            onChanged: (v) {
              if (v.length == 6) _verificar();
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
      ],
    );
  }
}

/// Acceso nuevo de otra cuenta (por ejemplo, alguien que acaba de aceptar
/// su invitación y entra por primera vez): la cuenta principal lo aprueba o
/// lo rechaza desde su teléfono.
Future<ApprovalOutcome> showPanelRequestSheet(
  BuildContext context,
  PanelAccessRequest request,
) async {
  final r = await showModalBottomSheet<ApprovalOutcome>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _PanelRequestSheet(request: request),
  );
  return r ?? ApprovalOutcome.dismissed;
}

class _PanelRequestSheet extends StatefulWidget {
  const _PanelRequestSheet({required this.request});
  final PanelAccessRequest request;

  @override
  State<_PanelRequestSheet> createState() => _PanelRequestSheetState();
}

class _PanelRequestSheetState extends State<_PanelRequestSheet> {
  bool _busy = false;
  String? _error;
  Timer? _vigencia;

  @override
  void initState() {
    super.initState();
    _vigencia = Timer.periodic(const Duration(seconds: 4), (_) async {
      if (_busy) return;
      try {
        final pendientes = await Locator.linkedDevices.panelRequests();
        final sigue = pendientes.any((r) => r.id == widget.request.id);
        if (!sigue && mounted) _cerrarSiEstaArriba(context);
      } catch (_) {
        // Sin red: se vuelve a mirar en la próxima vuelta.
      }
    });
  }

  @override
  void dispose() {
    _vigencia?.cancel();
    super.dispose();
  }

  Future<void> _resolver(bool aprobar) async {
    if (_busy) return;
    if (aprobar &&
        !await confirmarIdentidad(
          context,
          'Confirma que eres tú para aprobar el acceso',
        )) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (aprobar) {
        await Locator.linkedDevices.panelApprove(widget.request.id);
      } else {
        await Locator.linkedDevices.panelReject(widget.request.id);
      }
      if (mounted) {
        Navigator.pop(
          context,
          aprobar ? ApprovalOutcome.approved : ApprovalOutcome.rejected,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = userMessageFor(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    final esApp = r.browser == 'AIENC Admin app';
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: GemPalette.sapphireEmeraldGradient,
                ),
                child: Icon(
                  esApp ? Icons.smartphone_outlined : Icons.computer_outlined,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Acceso por aprobar',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            '${r.accountName} (@${r.username}) quiere entrar al panel desde '
            '"${r.deviceName}".',
            style: TextStyle(color: GemPalette.textPrimary, height: 1.45),
          ),
          const SizedBox(height: 6),
          Text(
            esApp
                ? 'Es su teléfono. Al aprobarlo, desde ahí aprobará después sus propios ingresos al panel web.'
                : 'Todavía no tiene la app vinculada, por eso lo apruebas tú.',
            style: TextStyle(color: GemPalette.textMuted, height: 1.4),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(
                color: GemPalette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 18),
          if (_busy)
            const Center(child: CircularProgressIndicator())
          else ...[
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: GemPalette.emerald,
                foregroundColor: Colors.white,
                minimumSize: const Size(0, 50),
              ),
              onPressed: () => _resolver(true),
              child: const Text('Aprobar'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GemPalette.danger,
                    ),
                    onPressed: () => _resolver(false),
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextButton(
                    onPressed: () =>
                        Navigator.pop(context, ApprovalOutcome.dismissed),
                    child: const Text('Ahora no'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Cierra el aviso solo si no hay nada encima (por ejemplo, el PIN a medio
/// escribir): así no se lleva por delante otra ventana.
void _cerrarSiEstaArriba(BuildContext context) {
  if (!context.mounted) return;
  final ruta = ModalRoute.of(context);
  if (ruta == null || !ruta.isCurrent) return;
  Navigator.of(context).pop(ApprovalOutcome.dismissed);
}
