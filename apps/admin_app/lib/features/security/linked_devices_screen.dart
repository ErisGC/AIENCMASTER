import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';
import 'approval_sheet.dart';

/// Sesiones y dispositivos de la cuenta, como en WhatsApp: los ingresos que
/// esperan aprobación, este teléfono y las demás sesiones (navegadores u otros
/// teléfonos), cada una con su estado y sus acciones.
class LinkedDevicesScreen extends StatefulWidget {
  const LinkedDevicesScreen({super.key});

  @override
  State<LinkedDevicesScreen> createState() => _LinkedDevicesScreenState();
}

class _LinkedDevicesScreenState extends State<LinkedDevicesScreen> {
  LinkedOverview? _data;
  List<PanelAccessRequest> _otras = const [];
  bool _loading = true;
  String? _error;

  bool get _esPrincipal => Locator.authState.isRootDevice;

  /// La lista se actualiza sola mientras está abierta: estados de las
  /// sesiones y solicitudes nuevas.
  Timer? _refresco;

  @override
  void initState() {
    super.initState();
    _load();
    _refresco = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _refresco?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await Locator.linkedDevices.overview();
      var otras = const <PanelAccessRequest>[];
      if (_esPrincipal) {
        final miId = Locator.authState.account?.id;
        otras = (await Locator.linkedDevices.panelRequests())
            .where((r) => r.accountId != miId)
            .toList();
      }
      if (!mounted) return;
      setState(() {
        _data = data;
        _otras = otras;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userMessageFor(e);
        _loading = false;
      });
    }
  }

  Future<void> _accion(
    Future<LinkedOverview> Function() fn,
    String exito,
  ) async {
    try {
      final data = await fn();
      if (!mounted) return;
      setState(() => _data = data);
      _aviso(exito);
    } on ApiException catch (e) {
      final raw = e.raw;
      _aviso(
        raw is Map && raw['message'] is String
            ? raw['message'] as String
            : e.message,
      );
    } catch (e) {
      _aviso(userMessageFor(e));
    }
  }

  void _aviso(String texto) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
  }

  Future<void> _renombrar(LinkedDevice d) async {
    final ctrl = TextEditingController(text: d.customName ?? d.deviceName);
    final nombre = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nombre de la sesión'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 60,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            hintText: 'Ej. Computador de la oficina',
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (nombre == null) return;
    await _accion(
      () => Locator.linkedDevices.rename(d.id, nombre),
      'Nombre guardado.',
    );
  }

  Future<bool> _confirmar(String titulo, String texto, String boton) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: GemPalette.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(boton),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _menu(LinkedDevice d, String opcion) async {
    switch (opcion) {
      case 'renombrar':
        await _renombrar(d);
      case 'pausar':
        await _accion(
          () => Locator.linkedDevices.pause(d.id),
          'Sesión pausada. Nadie puede usarla hasta que la reactives.',
        );
      case 'reactivar':
        await _accion(
          () => Locator.linkedDevices.resume(d.id),
          'Sesión reactivada.',
        );
      case 'cerrar':
        if (await _confirmar(
          '¿Cerrar esta sesión?',
          'En "${d.name}" se cerrará la sesión. Para volver a entrar tendrá '
              'que aprobarse otra vez desde esta app.',
          'Cerrar sesión',
        )) {
          await _accion(
            () => Locator.linkedDevices.signOut(d.id),
            'Sesión cerrada.',
          );
        }
      case 'quitar':
        if (await _confirmar(
          '¿Quitar de la lista?',
          'Se quita "${d.name}" de tus dispositivos. Si tenía la sesión '
              'abierta, se cierra.',
          'Quitar',
        )) {
          await _accion(
            () => Locator.linkedDevices.remove(d.id),
            'Quitado de la lista.',
          );
        }
    }
  }

  Future<void> _abrirSolicitud(LinkedRequest r) async {
    final res = await showApprovalSheet(context, r);
    if (res == ApprovalOutcome.approved) {
      _aviso('Listo: ese equipo ya entró al panel.');
    } else if (res == ApprovalOutcome.rejected) {
      _aviso('Ingreso rechazado.');
    }
    await _load();
  }

  Future<void> _resolverOtra(PanelAccessRequest r, bool aprobar) async {
    if (!aprobar &&
        !await _confirmar(
          '¿Rechazar este acceso?',
          '"${r.deviceName}" de ${r.accountName} no podrá entrar.',
          'Rechazar',
        )) {
      return;
    }
    if (!mounted) return;
    if (aprobar &&
        !await confirmarIdentidad(
          context,
          'Confirma que eres tú para aprobar el acceso',
        )) {
      return;
    }
    try {
      if (aprobar) {
        await Locator.linkedDevices.panelApprove(r.id);
      } else {
        await Locator.linkedDevices.panelReject(r.id);
      }
      _aviso(aprobar ? 'Acceso aprobado.' : 'Acceso rechazado.');
    } catch (e) {
      _aviso(userMessageFor(e));
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: GemAppBar(title: const Text('Sesiones y dispositivos')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : data == null
          ? GemListMessage(
              message: _error ?? 'No se pudieron cargar las sesiones.',
              isError: true,
              onRetry: _load,
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  Text(
                    'Cuando entres al panel web desde un equipo nuevo, '
                    'la aprobación llega aquí. Al cerrar sesión en la web, '
                    'ese equipo deja de estar aprobado.',
                    style: TextStyle(color: GemPalette.textMuted, height: 1.45),
                  ),
                  if (data.pending.isNotEmpty) ...[
                    _Titulo('Esperan tu aprobación'),
                    for (final r in data.pending)
                      _TarjetaSolicitud(
                        titulo: r.deviceName,
                        detalle: _detalle(r.browser, r.platform, r.ip),
                        cuando: r.requestedAt,
                        onTap: () => _abrirSolicitud(r),
                      ),
                  ],
                  if (_otras.isNotEmpty) ...[
                    _Titulo('Accesos de otras cuentas'),
                    for (final r in _otras)
                      _TarjetaOtra(
                        request: r,
                        onAprobar: () => _resolverOtra(r, true),
                        onRechazar: () => _resolverOtra(r, false),
                      ),
                  ],
                  _Titulo('Este teléfono'),
                  for (final d in data.devices.where((d) => d.current))
                    _TarjetaDispositivo(device: d, onMenu: null),
                  _Titulo('Otras sesiones'),
                  if (data.devices.where((d) => !d.current).isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        'No hay otras sesiones. Las que abras en el panel web '
                        'aparecerán aquí.',
                        style: TextStyle(color: GemPalette.textMuted),
                      ),
                    ),
                  for (final d in data.devices.where((d) => !d.current))
                    _TarjetaDispositivo(
                      device: d,
                      onMenu: (op) => _menu(d, op),
                    ),
                ],
              ),
            ),
    );
  }
}

String _detalle(String browser, String platform, String? ip) => [
  if (browser.isNotEmpty) browser,
  if (platform.isNotEmpty) platform,
  if (ip != null && ip.isNotEmpty) 'IP $ip',
].join(' · ');

String _hace(DateTime? t) {
  if (t == null) return '';
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return 'hace un momento';
  if (d.inMinutes < 60) return 'hace ${d.inMinutes} min';
  if (d.inHours < 24) return 'hace ${d.inHours} h';
  return DateFormat("d 'de' MMM, h:mm a", 'es').format(t);
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 22, 2, 10),
      child: Text(
        texto.toUpperCase(),
        style: TextStyle(
          color: GemPalette.textMuted,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.3,
        ),
      ),
    );
  }
}

/// Estado de la sesión en palabras y con su color.
(String, Color) _estado(LinkedDevice d) => switch (d.state) {
  'IN_USE' => ('En uso ahora', GemPalette.emerald),
  'OPEN' => ('Activa', GemPalette.sapphire),
  'WINDOW_CLOSED' => ('Activa · ventana cerrada', GemPalette.sapphire),
  'PAUSED' => ('Pausada', GemPalette.topaz),
  'SIGNED_OUT' => ('Sesión cerrada', GemPalette.textMuted),
  'REVOKED' => ('Revocada', GemPalette.danger),
  'REJECTED' => ('Rechazada', GemPalette.danger),
  _ => ('Pendiente', GemPalette.topaz),
};

class _TarjetaDispositivo extends StatelessWidget {
  const _TarjetaDispositivo({required this.device, required this.onMenu});
  final LinkedDevice device;
  final ValueChanged<String>? onMenu;

  @override
  Widget build(BuildContext context) {
    final d = device;
    final (etiqueta, color) = _estado(d);
    final cuando = d.state == 'SIGNED_OUT'
        ? _hace(d.signedOutAt ?? d.lastSeenAt)
        : _hace(d.lastSeenAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: GemPalette.sapphire.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                d.isApp ? Icons.smartphone_outlined : Icons.computer_outlined,
                color: GemPalette.sapphire,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    d.name,
                    style: Theme.of(context).textTheme.titleMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _detalle(d.browser, d.platform, null),
                    style: TextStyle(
                      color: GemPalette.textMuted,
                      fontSize: 12.5,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      GemBadge(label: etiqueta, color: color),
                      if (d.principal)
                        GemBadge(
                          label: 'Principal',
                          color: GemPalette.amethyst,
                        ),
                      if (d.ephemeral)
                        GemBadge(
                          label: 'Ventana privada',
                          color: GemPalette.textMuted,
                        ),
                      if (cuando.isNotEmpty)
                        Text(
                          cuando,
                          style: TextStyle(
                            color: GemPalette.textMuted,
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            if (onMenu != null)
              PopupMenuButton<String>(
                tooltip: 'Opciones',
                onSelected: onMenu,
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'renombrar',
                    child: Text('Cambiar nombre'),
                  ),
                  if (d.isOpen)
                    const PopupMenuItem(value: 'pausar', child: Text('Pausar')),
                  if (d.isPaused)
                    const PopupMenuItem(
                      value: 'reactivar',
                      child: Text('Reactivar'),
                    ),
                  if (d.isOpen || d.isPaused)
                    const PopupMenuItem(
                      value: 'cerrar',
                      child: Text('Cerrar sesión'),
                    ),
                  const PopupMenuItem(
                    value: 'quitar',
                    child: Text('Quitar de la lista'),
                  ),
                ],
              )
            else
              const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }
}

class _TarjetaSolicitud extends StatelessWidget {
  const _TarjetaSolicitud({
    required this.titulo,
    required this.detalle,
    required this.cuando,
    required this.onTap,
  });
  final String titulo;
  final String detalle;
  final DateTime? cuando;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        gradientBorder: true,
        onTap: onTap,
        child: Row(
          children: [
            Icon(Icons.how_to_reg_outlined, color: GemPalette.emerald),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo, style: Theme.of(context).textTheme.titleMedium),
                  Text(
                    [
                      detalle,
                      _hace(cuando),
                    ].where((s) => s.isNotEmpty).join(' · '),
                    style: TextStyle(
                      color: GemPalette.textMuted,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              'Revisar',
              style: TextStyle(
                color: GemPalette.emerald,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TarjetaOtra extends StatelessWidget {
  const _TarjetaOtra({
    required this.request,
    required this.onAprobar,
    required this.onRechazar,
  });
  final PanelAccessRequest request;
  final VoidCallback onAprobar;
  final VoidCallback onRechazar;

  @override
  Widget build(BuildContext context) {
    final r = request;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GemCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${r.accountName} (@${r.username})',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 2),
            Text(
              [
                r.deviceName,
                _detalle(r.browser, r.platform, r.ip),
                _hace(r.requestedAt),
              ].where((s) => s.isNotEmpty).join(' · '),
              style: TextStyle(color: GemPalette.textMuted, fontSize: 12.5),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GemPalette.danger,
                    ),
                    onPressed: onRechazar,
                    child: const Text('Rechazar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: GemPalette.emerald,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 48),
                    ),
                    onPressed: onAprobar,
                    child: const Text('Aprobar'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
