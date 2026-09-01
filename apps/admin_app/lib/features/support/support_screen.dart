import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/domain.dart';
import '../../core/state/locator.dart';
import '../../core/theme/gem_palette.dart';
import '../../core/widgets/gem_widgets.dart';

/// Canal de soporte.
///
/// El administrador principal ve la bandeja con todos los reportes recibidos;
/// los demás administradores ven sus propias conversaciones y pueden abrir una
/// nueva. La sensación de conversación en vivo se logra refrescando el hilo
/// abierto cada pocos segundos.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  List<SupportConversation> _items = [];
  bool _loading = true;
  String? _error;

  bool get _asRoot => Locator.authState.account?.isRoot ?? false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      _items = _asRoot
          ? await Locator.support.inbox()
          : await Locator.support.mine();
    } catch (e) {
      _error = userMessageFor(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openThread(SupportConversation c) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _ThreadScreen(conversation: c, asRoot: _asRoot),
      ),
    );
    await _load();
  }

  Future<void> _newConversation() async {
    final creada = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _NewConversationScreen()),
    );
    if (creada == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM, HH:mm', 'es');
    return Scaffold(
      appBar: AppBar(
        title: Text(_asRoot ? 'Bandeja de soporte' : 'Soporte'),
      ),
      floatingActionButton: _asRoot
          ? null
          : FloatingActionButton.extended(
              backgroundColor: GemPalette.emerald,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Nuevo reporte'),
              onPressed: _newConversation,
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  if (_error != null) ...[
                    GemErrorBanner(message: _error!),
                    const SizedBox(height: 12),
                  ],
                  if (_items.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 30),
                      child: Text(
                        _asRoot
                            ? 'Todavía no hay reportes.'
                            : 'Aquí verás tus conversaciones con el administrador principal.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: GemPalette.textMuted),
                      ),
                    )
                  else
                    ..._items.map((c) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: GemCard(
                            onTap: () => _openThread(c),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              _asRoot ? c.authorName : c.subject,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 14.5),
                                            ),
                                          ),
                                          if (c.unread > 0)
                                            Container(
                                              width: 9,
                                              height: 9,
                                              decoration: const BoxDecoration(
                                                color: GemPalette.danger,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        _asRoot ? c.subject : _estado(c.status),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            color: GemPalette.textMuted,
                                            fontSize: 12),
                                      ),
                                      if (c.lastMessageAt != null)
                                        Text(
                                          df.format(c.lastMessageAt!),
                                          style: const TextStyle(
                                              color: GemPalette.textMuted,
                                              fontSize: 11),
                                        ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right,
                                    color: GemPalette.textMuted),
                              ],
                            ),
                          ),
                        )),
                ],
              ),
            ),
    );
  }

  String _estado(String s) => switch (s) {
        'CLOSED' => 'Conversación cerrada',
        'BLOCKED' => 'Conversación bloqueada',
        _ => 'Abierta',
      };
}

/* ── Hilo ── */

class _ThreadScreen extends StatefulWidget {
  final SupportConversation conversation;
  final bool asRoot;
  const _ThreadScreen({required this.conversation, required this.asRoot});

  @override
  State<_ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<_ThreadScreen> {
  final _bodyCtrl = TextEditingController();
  final _scroll = ScrollController();
  final _picker = ImagePicker();

  List<SupportMessage> _messages = [];
  final List<File> _files = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    // Refresco corto: es lo que da la sensación de conversación en vivo.
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load(quiet: true));
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
      final t = await Locator.support
          .thread(widget.conversation.id, asRoot: widget.asRoot);
      if (!mounted) return;

      // Sólo se repinta si de verdad cambió algo. El refresco cada cinco
      // segundos reconstruía la lista aunque no hubiera nada nuevo.
      final hayNovedad = _hayMensajesNuevos(t.messages);
      if (!hayNovedad && _error == null) return;

      setState(() {
        _messages = t.messages;
        _error = null;
      });

      // Y sólo se baja al final si el usuario ya estaba al final. Antes se
      // bajaba siempre, así que era imposible leer el historial de una
      // conversación larga: el hilo saltaba solo cada cinco segundos.
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
      await Locator.support.reply(
        widget.conversation.id,
        body: _bodyCtrl.text,
        asRoot: widget.asRoot,
        files: adjuntos,
      );
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

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('d MMM, HH:mm', 'es');
    final bloqueada = widget.conversation.status == 'BLOCKED';
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.asRoot
            ? widget.conversation.authorName
            : widget.conversation.subject),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
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
                        alignment:
                            mio ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(11),
                          constraints: BoxConstraints(
                            maxWidth:
                                MediaQuery.of(context).size.width * 0.78,
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
                                Text(m.body,
                                    style: TextStyle(
                                        color: mio
                                            ? Colors.white
                                            : GemPalette.textPrimary,
                                        fontSize: 13.5,
                                        height: 1.4)),
                              ...m.attachments.map((a) => Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: a.kind == 'audio'
                                        ? TextButton.icon(
                                            icon: const Icon(
                                                Icons.play_circle_outline,
                                                size: 18),
                                            label: const Text('Escuchar nota'),
                                            onPressed: () => launchUrl(
                                                Uri.parse(a.url),
                                                mode: LaunchMode
                                                    .externalApplication),
                                          )
                                        : ClipRRect(
                                            borderRadius:
                                                BorderRadius.circular(10),
                                            child: Image.network(a.url,
                                                fit: BoxFit.cover),
                                          ),
                                  )),
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
                  Text('${_files.length} imagen(es) lista(s)',
                      style: const TextStyle(
                          color: GemPalette.emerald, fontSize: 12)),
                  const Spacer(),
                  TextButton(
                    onPressed: () => setState(_files.clear),
                    child: const Text('Quitar'),
                  ),
                ],
              ),
            ),
          if (bloqueada)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Esta conversación está bloqueada.',
                  style: TextStyle(color: GemPalette.textMuted)),
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
                      tooltip: 'Adjuntar captura',
                    ),
                    Expanded(
                      child: TextField(
                        controller: _bodyCtrl,
                        minLines: 1,
                        maxLines: 4,
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send_rounded),
                      onPressed: _sending ? null : _send,
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

/* ── Nuevo reporte (administradores) ── */

class _NewConversationScreen extends StatefulWidget {
  const _NewConversationScreen();

  @override
  State<_NewConversationScreen> createState() => _NewConversationScreenState();
}

class _NewConversationScreenState extends State<_NewConversationScreen> {
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _picker = ImagePicker();
  final List<File> _files = [];
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) return;
    if (_subjectCtrl.text.trim().length < 3) {
      setState(() => _error = 'Describe el asunto en pocas palabras.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final adjuntos = <MultipartFile>[];
      for (final f in _files) {
        adjuntos.add(await MultipartFile.fromFile(f.path));
      }
      await Locator.support.start(
        subject: _subjectCtrl.text,
        body: _bodyCtrl.text,
        files: adjuntos,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = userMessageFor(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo reporte')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: GemCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Cuéntale al administrador principal qué falla, qué falta o '
                  'qué sugieres. Puedes adjuntar capturas.',
                  style: TextStyle(
                      color: GemPalette.textMuted, fontSize: 12.5, height: 1.45),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _subjectCtrl,
                  maxLength: 150,
                  decoration: const InputDecoration(
                      labelText: 'Asunto', counterText: ''),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _bodyCtrl,
                  maxLength: 4000,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    labelText: 'Descripción',
                    alignLabelWithHint: true,
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.image_outlined, size: 18),
                  label: Text(_files.isEmpty
                      ? 'Adjuntar captura'
                      : '${_files.length} adjunta(s)'),
                  onPressed: () async {
                    final p = await _picker.pickImage(
                        source: ImageSource.gallery,
                        maxWidth: 1800,
                        imageQuality: 85);
                    if (p != null && mounted) {
                      setState(() => _files.add(File(p.path)));
                    }
                  },
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  GemErrorBanner(message: _error!),
                ],
                const SizedBox(height: 14),
                GemPrimaryButton(
                  label: 'Enviar reporte',
                  loading: _saving,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
