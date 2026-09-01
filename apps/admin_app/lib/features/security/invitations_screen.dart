import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

class InvitationsScreen extends StatefulWidget {
  const InvitationsScreen({super.key});

  @override
  State<InvitationsScreen> createState() => _InvitationsScreenState();
}

class _InvitationsScreenState extends State<InvitationsScreen> {
  List<AdminInvitation> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await Locator.invitations.list();
      if (mounted) setState(() => _items = list);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _newInvitation() async {
    final created = await Navigator.of(context).push<CreatedInvitation>(
      MaterialPageRoute(builder: (_) => const _NewInvitationScreen()),
    );
    if (created != null) {
      await _load();
      if (mounted) await _showLinkDialog(created);
    }
  }

  /// Describe cuánto vale la invitación a partir de la fecha que da el
  /// servidor, en vez de repetir un número escrito a mano que podría mentir.
  String _vigencia(DateTime expiraEn) {
    final restan = expiraEn.difference(DateTime.now());
    if (restan.isNegative) return 'Ya caducó';
    final horas = restan.inHours;
    if (horas >= 48) return 'Es válido por ${(horas / 24).round()} días';
    if (horas >= 1) return 'Es válido por $horas horas';
    return 'Caduca en menos de una hora';
  }

  Future<void> _showLinkDialog(CreatedInvitation inv) async {
    // Construimos el deep-link a la app para que el admin lo comparta. La web
    // también acepta el mismo token via /admin/invite/[token].
    final deepLink = 'aiencadmin://invite?token=${inv.token}';
    final isRoot = inv.targetRole == 'ROOT';
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          isRoot
              ? 'Invitación ROOT creada para @${inv.username}'
              : 'Invitación creada para @${inv.username}',
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isRoot)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 6),
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: GemPalette.amethyst.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Esta invitación creará otra cuenta ROOT al aceptarse.',
                    style: TextStyle(
                      color: GemPalette.amethyst,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    ),
                  ),
                ),
              Text(
                // La caducidad la decide el servidor; escribirla a mano hacía
                // que el texto mintiera si allí cambiaba.
                'Comparte este enlace con la persona invitada. '
                '${_vigencia(inv.expiresAt)} y sólo se puede usar una vez. ',
                style: const TextStyle(height: 1.45),
              ),
              const SizedBox(height: 8),
              const Text(
                'No volverá a mostrarse — guárdalo ahora.',
                style: TextStyle(
                  color: GemPalette.danger,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              SelectableText(
                deepLink,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: deepLink));
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('Enlace copiado.')),
              );
            },
            child: const Text('Copiar enlace'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  Future<void> _revoke(AdminInvitation inv) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revocar invitación'),
        content: Text(
          '¿Revocar la invitación de @${inv.username}? El enlace dejará de funcionar inmediatamente.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Revocar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Locator.invitations.revoke(inv.id);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessageFor(e))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Invitaciones')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: GemPalette.emerald,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nueva'),
        onPressed: _newInvitation,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _items.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: GemErrorBanner(message: _error!),
                )
              : _items.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Aún no se han generado invitaciones.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: GemPalette.textMuted),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemCount: _items.length,
                        itemBuilder: (_, i) => _InvitationTile(
                          inv: _items[i],
                          onRevoke: () => _revoke(_items[i]),
                        ),
                      ),
                    ),
    );
  }
}

class _InvitationTile extends StatelessWidget {
  final AdminInvitation inv;
  final VoidCallback onRevoke;
  const _InvitationTile({required this.inv, required this.onRevoke});

  @override
  Widget build(BuildContext context) {
    final isPending = inv.status == 'PENDING';
    final isRoot = inv.targetRole == 'ROOT';
    final statusColor = switch (inv.status) {
      'PENDING' => GemPalette.topaz,
      'ACCEPTED' => GemPalette.emerald,
      'REVOKED' => GemPalette.danger,
      'EXPIRED' => GemPalette.textMuted,
      _ => GemPalette.textMuted,
    };
    return GemCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(inv.displayName,
                        style: Theme.of(context).textTheme.titleMedium),
                    Text('@${inv.username}',
                        style: const TextStyle(
                            color: GemPalette.textMuted, fontSize: 12.5)),
                  ],
                ),
              ),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  GemBadge(
                    label: isRoot ? 'Principal' : 'Admin',
                    color: isRoot ? GemPalette.amethyst : GemPalette.sapphire,
                  ),
                  GemBadge(
                    label: invitationStatusLabel(inv.status),
                    color: statusColor,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            isRoot
                ? 'Sin iglesia asignada — acceso total al sistema'
                : 'Iglesia: ${inv.assignedChurchName ?? "—"}',
            style: const TextStyle(
                color: GemPalette.textPrimary, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            'Expira: ${DateFormat("d MMM yyyy, HH:mm", 'es').format(inv.expiresAt.toLocal())}',
            style: const TextStyle(color: GemPalette.textMuted, fontSize: 12),
          ),
          if (isPending) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.block, size: 16),
                label: const Text('Revocar'),
                onPressed: onRevoke,
                style: OutlinedButton.styleFrom(
                  foregroundColor: GemPalette.danger,
                  side: const BorderSide(color: GemPalette.danger),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _NewInvitationScreen extends StatefulWidget {
  const _NewInvitationScreen();
  @override
  State<_NewInvitationScreen> createState() => _NewInvitationScreenState();
}

class _NewInvitationScreenState extends State<_NewInvitationScreen> {
  final _username = TextEditingController();
  final _displayName = TextEditingController();

  String? _churchId;
  List<Church> _churches = [];

  PermissionsCatalog? _catalog;
  String _templateKey = 'PASTOR';
  Set<ChurchPermission> _churchPerms = {};

  /// Si está activado, la invitación crea otra cuenta ROOT (administrador
  /// principal). Sólo otra cuenta ROOT puede hacerlo — el backend valida.
  bool _rootInvitation = false;

  bool _submitting = false;
  bool _loadingCatalog = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _username.dispose();
    _displayName.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      final results = await Future.wait([
        Locator.churches.list(),
        Locator.security.catalog(),
      ]);
      final c = results[0] as List<Church>;
      final cat = results[1] as PermissionsCatalog;
      final pastor = cat.templates.firstWhere(
        (t) => t.key == 'PASTOR',
        orElse: () => cat.templates.first,
      );
      if (mounted) {
        setState(() {
          _churches = c;
          _catalog = cat;
          _templateKey = pastor.key;
          _churchPerms = pastor.churchPermissions.toSet();
          _loadingCatalog = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = userMessageFor(e);
          _loadingCatalog = false;
        });
      }
    }
  }

  void _applyTemplate(PermissionTemplate t) {
    setState(() {
      _templateKey = t.key;
      _churchPerms = t.churchPermissions.toSet();
    });
  }

  void _togglePerm(ChurchPermission p) {
    setState(() {
      _templateKey = 'CUSTOM';
      if (_churchPerms.contains(p)) {
        _churchPerms.remove(p);
      } else {
        _churchPerms.add(p);
      }
    });
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final user = _username.text.trim();
    final name = _displayName.text.trim();
    if (!RegExp(r'^[a-zA-Z0-9_.\-]+$').hasMatch(user) ||
        user.length < 3 ||
        user.length > 50) {
      setState(() => _error =
          'Usuario inválido (3–50 caracteres, sin espacios ni acentos).');
      return;
    }
    if (name.length < 2 || name.length > 100) {
      setState(() => _error = 'Nombre visible inválido (2–100 caracteres).');
      return;
    }
    if (!_rootInvitation && _churchId == null) {
      setState(() => _error = 'Selecciona la iglesia asignada.');
      return;
    }

    // Confirmación adicional para invitaciones ROOT — es la acción más
    // sensible del sistema.
    if (_rootInvitation) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Crear otra cuenta ROOT'),
          content: const Text(
            'Vas a generar una invitación para crear OTRA cuenta de '
            'administrador principal (ROOT). La nueva cuenta tendrá '
            'acceso total al sistema, igual que la tuya. ¿Continuar?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Generar invitación ROOT'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await Locator.invitations.create(
        username: user,
        displayName: name,
        targetRole: _rootInvitation ? 'ROOT' : 'ADMIN',
        assignedChurchId: _rootInvitation ? null : _churchId,
        churchPermissions:
            _rootInvitation ? const [] : _churchPerms.toList(),
      );
      if (!mounted) return;
      Navigator.pop(context, created);
    } catch (e) {
      setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingCatalog) {
      return Scaffold(
        appBar: AppBar(title: const Text('Nueva invitación')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final cat = _catalog;
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva invitación')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GemCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Datos del nuevo administrador',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _username,
                      decoration: const InputDecoration(
                        labelText: 'Usuario',
                        hintText: 'pastor.juan',
                      ),
                      autocorrect: false,
                      maxLength: 50,
                    ),
                    TextField(
                      controller: _displayName,
                      decoration: const InputDecoration(
                        labelText: 'Nombre visible',
                        hintText: 'Pastor Juan Pérez',
                      ),
                      maxLength: 100,
                    ),
                    if (!_rootInvitation) ...[
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: _churchId,
                        isExpanded: true,
                        decoration: const InputDecoration(
                            labelText: 'Iglesia asignada'),
                        items: [
                          for (final c in _churches)
                            DropdownMenuItem(
                              value: c.id,
                              child: Text('${c.name} — ${c.city}'),
                            ),
                        ],
                        onChanged: (v) => setState(() => _churchId = v),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'El nuevo admin podrá gestionar la iglesia que '
                        'selecciones. Más adelante puedes asignarle otras.',
                        style: TextStyle(
                            color: GemPalette.textMuted, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),
              // Toggle "Crear como administrador principal" — sólo visible
              // a ROOTs (esta pantalla ya lo es, está dentro de la tab
              // Seguridad que sólo se muestra a ROOT). El backend además
              // valida que el actor sea ROOT.
              GemCard(
                borderGradient: const LinearGradient(
                  colors: [GemPalette.amethyst, GemPalette.sapphire],
                ),
                child: CheckboxListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: GemPalette.amethyst,
                  value: _rootInvitation,
                  onChanged: (v) =>
                      setState(() => _rootInvitation = v ?? false),
                  title: const Text(
                    'Crear como administrador principal (ROOT)',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: GemPalette.amethyst),
                  ),
                  subtitle: const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      'La nueva cuenta tendrá los mismos privilegios totales '
                      'que tú: gestiona todas las iglesias, todos los admins, '
                      'y puede a su vez invitar a otras cuentas ROOT.',
                      style: TextStyle(
                          color: GemPalette.textMuted, fontSize: 12, height: 1.4),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              if (!_rootInvitation && cat != null) ...[
                GemCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Rol que va a tener',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final t in cat.templates)
                            GemPill(
                              label: t.name,
                              selected: _templateKey == t.key,
                              onTap: () => _applyTemplate(t),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        cat.templates
                                .firstWhere((t) => t.key == _templateKey,
                                    orElse: () => cat.templates.first)
                                .description,
                        style: const TextStyle(
                            color: GemPalette.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                GemCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Permisos efectivos sobre la iglesia',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      ...cat.catalog
                          .where((d) => d.group == 'church')
                          .map((d) {
                        final perm = churchPermissionFromString(d.key);
                        if (perm == null) return const SizedBox.shrink();
                        return CheckboxListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          controlAffinity:
                              ListTileControlAffinity.leading,
                          activeColor: GemPalette.emerald,
                          value: _churchPerms.contains(perm),
                          onChanged: (_) => _togglePerm(perm),
                          title: Text(d.label,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14)),
                          subtitle: Text(d.description,
                              style: const TextStyle(
                                  color: GemPalette.textMuted,
                                  fontSize: 12)),
                        );
                      }),
                    ],
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                GemErrorBanner(message: _error!),
              ],
              const SizedBox(height: 16),
              GemPrimaryButton(
                label: 'Generar invitación',
                loading: _submitting,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
