'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  guestConversations,
  guestReply,
  guestStart,
  guestThread,
  guestToken,
  inbox,
  inboxReply,
  inboxThread,
  inboxUnread,
  setConversationStatus,
  type SupportConversation,
  type SupportMessage,
} from '@/app/lib/support';
import styles from './SupportWidget.module.css';

type Mode = 'guest' | 'root';
type View = 'list' | 'form' | 'thread';

const POLL_THREAD_MS = 5000;
const POLL_LIST_MS = 20000;

function timeOf(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

/**
 * Canal de soporte. El mismo componente sirve para el visitante del portal
 * (`guest`) y para la bandeja del administrador principal (`root`); cambian el
 * origen de los datos y quién aparece a cada lado de la conversación.
 */
export function SupportWidget({ mode }: { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [convs, setConvs] = useState<SupportConversation[]>([]);
  const [current, setCurrent] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulario de apertura (visitante)
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Redacción
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Hilo que el usuario tiene abierto ahora mismo. Las cargas comparan contra
  // esta referencia antes de pintar: si se cambia de hilo mientras una carga
  // sigue en vuelo, la respuesta que llegue tarde pertenece al hilo anterior y
  // se descarta. Sin esto se veía el hilo equivocado, y el administrador podía
  // responder en una conversación creyendo estar en otra.
  const currentIdRef = useRef<string | null>(null);

  const isRoot = mode === 'root';

  /* ── Carga ── */

  const loadList = useCallback(async () => {
    try {
      if (isRoot) {
        const [list, u] = await Promise.all([inbox(), inboxUnread()]);
        setConvs(list);
        setUnread(u.unread);
      } else {
        if (!guestToken()) { setConvs([]); return; }
        const list = await guestConversations();
        setConvs(list);
        setUnread(list.filter((c) => c.unread > 0).length);
      }
    } catch {
      /* silencioso: el widget no debe estorbar si el servidor no responde */
    }
  }, [isRoot]);

  const loadThread = useCallback(
    async (id: string) => {
      try {
        const t = isRoot ? await inboxThread(id) : await guestThread(id);
        // Llegó tarde y el usuario ya está en otro hilo: se descarta.
        if (currentIdRef.current !== id) return;
        setCurrent(t.conversation);
        setMessages(t.messages);
      } catch (e) {
        if (currentIdRef.current !== id) return;
        setError(e instanceof Error ? e.message : 'No se pudo abrir el hilo.');
      }
    },
    [isRoot],
  );

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), POLL_LIST_MS);
    return () => clearInterval(t);
  }, [loadList]);

  // Mientras un hilo está abierto se refresca seguido, que es lo que da la
  // sensación de conversación en vivo.
  // Depende del ID, no del objeto: cada respuesta del sondeo devuelve una
  // conversación nueva, así que con el objeto como dependencia el temporizador
  // se destruía y recreaba en cada vuelta.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!open || view !== 'thread' || !currentId) return;
    const t = setInterval(() => void loadThread(currentId), POLL_THREAD_MS);
    return () => clearInterval(t);
  }, [open, view, currentId, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Cortar la grabación al desmontar. Si el usuario empieza una nota de voz y
  // se va sin pulsar "detener", el micrófono se quedaba abierto: el navegador
  // seguía mostrando el indicador de grabación indefinidamente.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stream.getTracks().forEach((t) => t.stop());
        rec.stop();
      }
    };
  }, []);

  // Lo mismo al cerrar el panel: cerrar equivale a dejar de grabar.
  useEffect(() => {
    if (open) return;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, [open]);

  /* ── Acciones ── */

  function openThread(c: SupportConversation) {
    currentIdRef.current = c.id;
    setCurrent(c);
    setMessages([]);
    setView('thread');
    setError(null);
    void loadThread(c.id);
  }

  function buildForm(text: string) {
    const fd = new FormData();
    fd.append('body', text);
    files.forEach((f) => fd.append('files', f));
    return fd;
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = buildForm(body);
      fd.append('name', name);
      fd.append('subject', subject);
      const out = await guestStart(fd);
      setName('');
      setSubject('');
      setBody('');
      setFiles([]);
      await loadList();
      openThread(out.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy || !current) return;
    if (!draft.trim() && files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fd = buildForm(draft);
      if (isRoot) await inboxReply(current.id, fd);
      else await guestReply(current.id, fd);
      setDraft('');
      setFiles([]);
      await loadThread(current.id);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setFiles((prev) => [
          ...prev,
          new File([blob], `nota-de-voz-${Date.now()}.webm`, { type: 'audio/webm' }),
        ]);
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError('No se pudo usar el micrófono. Revisa los permisos.');
    }
  }

  async function block() {
    if (!current) return;
    if (!window.confirm(`¿Bloquear la conversación de ${current.authorName}?`)) return;
    try {
      await setConversationStatus(current.id, 'BLOCKED');
      currentIdRef.current = null;
      setCurrent(null);
      await loadList();
      setView('list');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo bloquear.');
    }
  }

  /* ── Vistas ── */

  if (!open) {
    return (
      <button
        type="button"
        className={styles.fab}
        onClick={() => { setOpen(true); void loadList(); }}
        aria-label={isRoot ? 'Abrir bandeja de soporte' : 'Reportar un problema'}
      >
        {isRoot ? 'Soporte' : '¿Algo no funciona?'}
        {unread > 0 && <span className={styles.badge}>{unread}</span>}
      </button>
    );
  }

  const puedeEscribir =
    !!current && current.status !== 'BLOCKED' && (isRoot || current.status !== 'CLOSED');

  return (
    <section className={styles.panel} aria-label="Canal de soporte">
      <header className={styles.head}>
        <div>
          <p className={styles.headTitle}>
            {view === 'thread' && current
              ? isRoot ? current.authorName : current.subject
              : isRoot ? 'Bandeja de soporte' : 'Escríbele al administrador'}
          </p>
          <p className={styles.headSub}>
            {view === 'thread' && current
              ? isRoot ? current.subject : 'Te responderemos por aquí'
              : isRoot ? 'Reportes recibidos' : 'Fallos, faltantes o sugerencias'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {view === 'thread' && (
            <button type="button" className={styles.iconBtn}
              onClick={() => { currentIdRef.current = null; setView('list'); setCurrent(null); void loadList(); }}
              aria-label="Volver">←</button>
          )}
          <button type="button" className={styles.iconBtn}
            onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
        </div>
      </header>

      {view === 'thread' ? (
        <>
          <div className={styles.body}>
            {messages.length === 0 && <p className={styles.empty}>Cargando…</p>}
            {messages.map((m) => {
              const mine = isRoot ? m.senderKind === 'ROOT' : m.senderKind === 'AUTHOR';
              return (
                <div key={m.id} className={`${styles.msg} ${mine ? styles.mine : styles.theirs}`}>
                  {m.body}
                  {m.attachments.map((a) =>
                    a.kind === 'audio' ? (
                      <audio key={a.url} className={styles.audio} controls preload="none" src={a.url} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                        <img className={styles.thumb} src={a.url} alt={a.name} loading="lazy" />
                      </a>
                    ),
                  )}
                  <span className={styles.msgTime}>{timeOf(m.createdAt)}</span>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {files.length > 0 && (
            <div className={styles.attachRow}>
              {files.length} archivo(s) listo(s)
              <button type="button" className={styles.ghost} onClick={() => setFiles([])}>Quitar</button>
            </div>
          )}

          {puedeEscribir ? (
            <div className={styles.composer}>
              <label className={styles.ghost} style={{ cursor: 'pointer' }}>
                Foto
                <input type="file" accept="image/*" multiple hidden
                  onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])} />
              </label>
              <button type="button" className={styles.ghost} onClick={() => void toggleRecording()}>
                {recording ? 'Detener' : 'Voz'}
              </button>
              <textarea rows={1} value={draft} placeholder="Escribe un mensaje"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }} />
              <button type="button" className={styles.send} disabled={busy} onClick={() => void send()} aria-label="Enviar">➤</button>
            </div>
          ) : (
            <p className={styles.empty}>Esta conversación está cerrada.</p>
          )}

          {isRoot && current && current.status !== 'BLOCKED' && (
            <div className={styles.attachRow}>
              <button type="button" className={styles.ghost} onClick={() => void block()}>
                Bloquear a esta persona
              </button>
            </div>
          )}
        </>
      ) : view === 'form' ? (
        <form className={styles.body} onSubmit={submitNew}>
          <p className={styles.intro}>
            Cuéntanos qué pasó. Puedes adjuntar una captura para que se entienda mejor.
          </p>
          <label className={styles.field}>
            <span>Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <label className={styles.field}>
            <span>Asunto</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              maxLength={150} placeholder="Ej: no carga la página de una iglesia" required />
          </label>
          <label className={styles.field}>
            <span>Descripción</span>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </label>
          <div className={styles.actions}>
            <label className={styles.ghost} style={{ cursor: 'pointer' }}>
              Adjuntar captura
              <input type="file" accept="image/*" multiple hidden
                onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])} />
            </label>
            <button type="button" className={styles.ghost} onClick={() => void toggleRecording()}>
              {recording ? 'Detener' : 'Nota de voz'}
            </button>
          </div>
          {files.length > 0 && (
            <p className={styles.intro}>{files.length} archivo(s) adjunto(s).</p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <button type="button" className={styles.ghost} onClick={() => setView('list')}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className={styles.body}>
          {!isRoot && (
            <button type="button" className={styles.primary} onClick={() => { setView('form'); setError(null); }}>
              Escribir un reporte
            </button>
          )}
          {convs.length === 0 ? (
            <p className={styles.empty}>
              {isRoot ? 'Todavía no hay reportes.' : 'Aquí verás tus conversaciones.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {convs.map((c) => (
                <li key={c.id}>
                  <button type="button" className={styles.item} onClick={() => openThread(c)}>
                    <span className={styles.itemTop}>
                      <span className={styles.itemSubject}>
                        {isRoot ? c.authorName : c.subject}
                        {c.unread > 0 && <span className={styles.dot} />}
                      </span>
                      <span className={styles.itemMeta}>{timeOf(c.lastMessageAt)}</span>
                    </span>
                    {isRoot && <span className={styles.itemMeta}>{c.subject}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </section>
  );
}
