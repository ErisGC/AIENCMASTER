import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';
import '../../core/widgets/theme_toggle.dart';

/// Canal de soporte, como un chat: cada persona tiene UNA conversación con el
/// administrador principal.
///
/// El principal ve la lista de personas con lo último que se dijo; los demás
/// administradores entran directo a su conversación. La sensación de chat en
/// vivo se logra refrescando la conversación abierta cada pocos segundos.
class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final asRoot = Locator.authState.account?.isRoot ?? false;
    return asRoot
        ? const _InboxScreen()
        : const _ThreadScreen(conversation: null, asRoot: false);
  }
}

/* ── Bandeja del administrador principal ── */

class _InboxScreen extends StatefulWidget {
  const _InboxScreen();

  @override
  State<_InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<_InboxScreen> {
  List<SupportConversation> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      _items = await Locator.support.inbox();
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openThread(SupportConversation c) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _ThreadScreen(conversation: c, asRoot: true),
      ),
    );
    await _load();
  }

  String _cuando(DateTime d) {
    final hoy = DateTime.now();
    final mismoDia =
        d.year == hoy.year && d.month == hoy.month && d.day == hoy.day;
    return mismoDia
        ? DateFormat('HH:mm', 'es').format(d)
        : DateFormat('d MMM', 'es').format(d);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: GemAppBar(title: const Text('Bandeja de soporte')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  if (_error != null) ...[
                    GemErrorBanner(message: _error!),
                    const SizedBox(height: 12),
                  ],
                  if (_items.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 30),
                      child: Text(
                        'Todavía no te han escrito.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: GemPalette.textMuted),
                      ),
                    )
                  else
                    for (final c in _items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: GemCard(
                          onTap: () => _openThread(c),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            c.authorName,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 14.5,
                                            ),
                                          ),
                                        ),
                                        if (c.lastMessageAt != null)
                                          Text(
                                            _cuando(c.lastMessageAt!),
                                            style: TextStyle(
                                              color: c.unread > 0
                                                  ? GemPalette.emerald
                                                  : GemPalette.textMuted,
                                              fontSize: 11.5,
                                              fontWeight: c.unread > 0
                                                  ? FontWeight.w700
                                                  : FontWeight.w400,
                                            ),
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 3),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            c.preview == null
                                                ? c.subject
                                                : '${c.previewMine ? 'Tú: ' : ''}${c.preview}',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              color: GemPalette.textMuted,
                                              fontSize: 12.5,
                                            ),
                                          ),
                                        ),
                                        if (c.unread > 0)
                                          Container(
                                            margin: const EdgeInsets.only(
                                              left: 8,
                                            ),
                                            width: 10,
                                            height: 10,
                                            decoration: BoxDecoration(
                                              color: GemPalette.emerald,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                      ],
                                    ),
                                    if (c.status == 'BLOCKED')
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(
                                          'Bloqueada',
                                          style: TextStyle(
                                            color: GemPalette.danger,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 6),
                              Icon(
                                Icons.chevron_right,
                                color: GemPalette.textMuted,
                              ),
                            ],
                          ),
                        ),
                      ),
                ],
              ),
            ),
    );
  }
}

/* ── Conversación ── */

class _ThreadScreen extends StatefulWidget {
  /// La conversación abierta. Para un administrador que aún no ha escrito es
  /// null: su primer mensaje la crea.
  final SupportConversation? conversation;
  final bool asRoot;
  const _ThreadScreen({required this.conversation, required this.asRoot});

  @override
  State<_ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<_ThreadScreen> {
  final _bodyCtrl = TextEditingController();
  final _scroll = ScrollController();
  final _picker = ImagePicker();

  SupportConversation? _conv;
  List<SupportMessage> _messages = [];
  final List<File> _files = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _conv = widget.conversation;
    _load();
    // Refresco corto: es lo que da la sensación de conversación en vivo.
    _timer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _load(quiet: true),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _bodyCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    try {
      // El administrador entra directo a su conversación; si aún no tiene,
      // la pantalla queda lista para el primer mensaje.
      if (_conv == null && !widget.asRoot) {
        final mias = await Locator.support.mine();
        if (!mounted) return;
        if (mias.isEmpty) return;
        _conv = mias.first;
      }
      final conv = _conv;
      if (conv == null) return;
      final t = await Locator.support.thread(conv.id, asRoot: widget.asRoot);
      if (!mounted) return;

      // Sólo se repinta si de verdad cambió algo. El refresco cada cinco
      // segundos reconstruía la lista aunque no hubiera nada nuevo.
      final hayNovedad = _hayMensajesNuevos(t.messages);
      final cambioEstado = t.conversation.status != _conv?.status;
      if (!hayNovedad && !cambioEstado && _error == null) return;

      setState(() {
        _conv = t.conversation;
        _messages = t.messages;
        _error = null;
      });

      // Y sólo se baja al final si el usuario ya estaba al final: si no, era
      // imposible leer el historial porque saltaba solo cada cinco segundos.
      if (hayNovedad && _estabaAlFinal) _scrollToEnd();
    } catch (e) {
      if (!quiet && mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted && _loading) setState(() => _loading = false);
    }
  }

  /// Compara contra lo que ya está en pantalla: cantidad y último mensaje.
  bool _hayMensajesNuevos(List<SupportMessage> entrantes) {
    if (entrantes.length != _messages.length) return true;
    if (entrantes.isEmpty) return false;
    return entrantes.last.id != _messages.last.id;
  }

  /// Cerca del final (con holgura para no exigir precisión al dedo). Si aún no
  /// hay scroll —conversación corta o primera carga—, cuenta como "al final".
  bool get _estabaAlFinal {
    if (!_scroll.hasClients) return true;
    final pos = _scroll.position;
    return pos.pixels >= pos.maxScrollExtent - 120;
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _pickImage() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1800,
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _files.add(File(picked.path)));
    }
  }

  Future<void> _send() async {
    if (_sending) return;
    if (_bodyCtrl.text.trim().isEmpty && _files.isEmpty) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final adjuntos = <MultipartFile>[];
      for (final f in _files) {
        adjuntos.add(await MultipartFile.fromFile(f.path));
      }
      final conv = _conv;
      if (conv == null) {
        // Primer mensaje: crea la conversación (si ya existía una, el
        // servidor suma el mensaje a esa).
        _conv = await Locator.support.start(
          body: _bodyCtrl.text,
          files: adjuntos,
        );
      } else {
        await Locator.support.reply(
          conv.id,
          body: _bodyCtrl.text,
          asRoot: widget.asRoot,
          files: adjuntos,
        );
      }
      _bodyCtrl.clear();
      setState(_files.clear);
      await _load();
      // Tras enviar siempre se baja al final: es el mensaje propio recién
      // escrito y el usuario espera verlo.
      _scrollToEnd();
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _verFoto(SupportAttachment a) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black,
        pageBuilder: (_, _, _) => _FotoScreen(url: a.url, nombre: a.name),
        transitionsBuilder: (_, anim, _, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  Future<void> _bloquear() async {
    final conv = _conv;
    if (conv == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('¿Bloquear a ${conv.authorName}?'),
        content: const Text('Ya no podrá escribirte por este canal.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Bloquear'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Locator.support.setStatus(conv.id, 'BLOCKED');
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM, HH:mm', 'es');
    final bloqueada = _conv?.status == 'BLOCKED';
    return Scaffold(
      appBar: GemAppBar(
        title: Text(widget.asRoot ? (_conv?.authorName ?? '') : 'Soporte'),
        actions: [
          if (widget.asRoot && _conv != null && !bloqueada)
            PopupMenuButton<String>(
              onSelected: (_) => _bloquear(),
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'bloquear',
                  child: Text('Bloquear a esta persona'),
                ),
              ],
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 40),
                      Icon(
                        Icons.forum_outlined,
                        size: 48,
                        color: GemPalette.textMuted,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        widget.asRoot
                            ? 'Esta conversación todavía no tiene mensajes.'
                            : 'Escríbele al administrador principal: qué falla, '
                                  'qué falta o qué se te ocurre. Puedes adjuntar '
                                  'fotos. Todo queda en esta misma conversación.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: GemPalette.textMuted,
                          height: 1.5,
                        ),
                      ),
                    ],
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      final mio = widget.asRoot
                          ? m.senderKind == 'ROOT'
                          : m.senderKind == 'AUTHOR';
                      return Align(
                        alignment: mio
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(11),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.of(context).size.width * 0.78,
                          ),
                          decoration: BoxDecoration(
                            color: mio
                                ? GemPalette.sapphire
                                : GemPalette.surfaceElevated,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (m.body.isNotEmpty)
                                Text(
                                  m.body,
                                  style: TextStyle(
                                    color: mio
                                        ? Colors.white
                                        : GemPalette.textPrimary,
                                    fontSize: 13.5,
                                    height: 1.4,
                                  ),
                                ),
                              ...m.attachments.map(
                                (a) => Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: a.kind == 'audio'
                                      ? TextButton.icon(
                                          icon: const Icon(
                                            Icons.play_circle_outline,
                                            size: 18,
                                          ),
                                          label: const Text('Escuchar nota'),
                                          onPressed: () => launchUrl(
                                            Uri.parse(a.url),
                                            mode:
                                                LaunchMode.externalApplication,
                                          ),
                                        )
                                      : Semantics(
                                          button: true,
                                          label: 'Ver la foto en grande',
                                          child: GestureDetector(
                                            onTap: () => _verFoto(a),
                                            child: Hero(
                                              tag: a.url,
                                              child: ClipRRect(
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                                child: ConstrainedBox(
                                                  constraints:
                                                      const BoxConstraints(
                                                        maxHeight: 280,
                                                      ),
                                                  child: Image.network(
                                                    a.url,
                                                    fit: BoxFit.cover,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                ),
                              ),
                              if (m.createdAt != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    df.format(m.createdAt!),
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      color: mio
                                          ? Colors.white70
                                          : GemPalette.textMuted,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GemErrorBanner(message: _error!),
            ),
          if (_files.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  Text(
                    _files.length == 1
                        ? '1 foto lista para enviar'
                        : '${_files.length} fotos listas para enviar',
                    style: TextStyle(color: GemPalette.emerald, fontSize: 12),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => setState(_files.clear),
                    child: const Text('Quitar'),
                  ),
                ],
              ),
            ),
          if (bloqueada)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Esta conversación está bloqueada.',
                style: TextStyle(color: GemPalette.textMuted),
              ),
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.image_outlined),
                      onPressed: _pickImage,
                      tooltip: 'Adjuntar foto',
                    ),
                    Expanded(
                      child: TextField(
                        controller: _bodyCtrl,
                        minLines: 1,
                        maxLines: 4,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          hintText: 'Escribe un mensaje',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filled(
                      icon: _sending
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send_rounded),
                      onPressed: _sending ? null : _send,
                      tooltip: 'Enviar',
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/* ── Foto en grande ── */

/// La foto a pantalla completa, como en WhatsApp: se acerca con dos dedos o
/// con doble toque, se recorre arrastrando y se cierra con la X o con atrás.
class _FotoScreen extends StatefulWidget {
  const _FotoScreen({required this.url, required this.nombre});
  final String url;
  final String nombre;

  @override
  State<_FotoScreen> createState() => _FotoScreenState();
}

class _FotoScreenState extends State<_FotoScreen>
    with SingleTickerProviderStateMixin {
  final _zoom = TransformationController();
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  Animation<Matrix4>? _hacia;
  TapDownDetails? _dobleToque;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      final h = _hacia;
      if (h != null) _zoom.value = h.value;
    });
  }

  @override
  void dispose() {
    _anim.dispose();
    _zoom.dispose();
    super.dispose();
  }

  /// Doble toque: acerca donde se tocó, o vuelve al tamaño normal.
  void _alternarZoom() {
    final acercada = _zoom.value.getMaxScaleOnAxis() > 1.05;
    final Matrix4 destino;
    if (acercada) {
      destino = Matrix4.identity();
    } else {
      final p = _dobleToque?.localPosition ?? Offset.zero;
      const escala = 2.6;
      destino = Matrix4.identity()
        ..translateByDouble(-p.dx * (escala - 1), -p.dy * (escala - 1), 0, 1)
        ..scaleByDouble(escala, escala, 1, 1);
    }
    _hacia = Matrix4Tween(
      begin: _zoom.value,
      end: destino,
    ).animate(CurvedAnimation(parent: _anim, curve: Curves.easeOut));
    _anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        // El tema general pinta los íconos oscuros; sobre negro no se veían.
        iconTheme: const IconThemeData(color: Colors.white),
        actionsIconTheme: const IconThemeData(color: Colors.white),
        systemOverlayStyle: SystemUiOverlayStyle.light,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'Cerrar',
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_new),
            tooltip: 'Abrir el original',
            onPressed: () => launchUrl(
              Uri.parse(widget.url),
              mode: LaunchMode.externalApplication,
            ),
          ),
        ],
      ),
      body: GestureDetector(
        onDoubleTapDown: (d) => _dobleToque = d,
        onDoubleTap: _alternarZoom,
        child: InteractiveViewer(
          transformationController: _zoom,
          minScale: 1,
          maxScale: 6,
          child: Center(
            child: Hero(
              tag: widget.url,
              child: Image.network(
                widget.url,
                fit: BoxFit.contain,
                semanticLabel: widget.nombre,
                loadingBuilder: (_, child, progreso) => progreso == null
                    ? child
                    : const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      ),
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'No se pudo cargar la foto.',
                    style: TextStyle(color: Colors.white70),
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
