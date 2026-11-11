'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  myConversations,
  myReply,
  myStart,
  myThread,
  setConversationStatus,
  type SupportConversation,
  type SupportMessage,
} from '@/app/lib/support';
import styles from './SupportWidget.module.css';

/**
 * - `guest`: visitante del portal (se identifica con un token de su navegador).
 * - `admin`: administrador del panel que no es el principal (su cuenta).
 * - `root`: bandeja del administrador principal.
 */
type Mode = 'guest' | 'admin' | 'root';
type View = 'list' | 'thread';

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
 * Canal de soporte. Cada persona tiene UNA conversación con el administrador
 * principal, como en un chat: el visitante y el administrador entran directo a
 * ella; el principal ve la lista de personas con lo último que se dijo.
 */
export function SupportWidget({ mode }: { mode: Mode }) {
  const isRoot = mode === 'root';
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(isRoot ? 'list' : 'thread');
  const [convs, setConvs] = useState<SupportConversation[]>([]);
  const [current, setCurrent] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nombre del visitante: solo se pide antes de su primer mensaje.
  const [name, setName] = useState('');

  // Redacción
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Foto abierta en grande.
  const [visor, setVisor] = useState<{ src: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(false);

  // Hilo que el usuario tiene abierto ahora mismo. Las cargas comparan contra
  // esta referencia antes de pintar: si se cambia de hilo mientras una carga
  // sigue en vuelo, la respuesta que llegue tarde pertenece al hilo anterior y
  // se descarta. Sin esto se veía el hilo equivocado, y el administrador podía
  // responder en una conversación creyendo estar en otra.
  const currentIdRef = useRef<string | null>(null);

  /* ── Carga ── */

  const fetchList = useCallback(async (): Promise<SupportConversation[]> => {
    if (isRoot) return inbox();
    if (mode === 'admin') return myConversations();
    if (!guestToken()) return [];
    return guestConversations();
  }, [isRoot, mode]);

  const loadList = useCallback(async () => {
    try {
      if (isRoot) {
        const [list, u] = await Promise.all([inbox(), inboxUnread()]);
        setConvs(list);
        setUnread(u.unread);
        return list;
      }
      const list = await fetchList();
      setConvs(list);
      setUnread(list.filter((c) => c.unread > 0).length);
      return list;
    } catch {
      /* silencioso: el widget no debe estorbar si el servidor no responde */
      return null;
    }
  }, [isRoot, fetchList]);

  const loadThread = useCallback(
    async (id: string) => {
      try {
        const t = isRoot
          ? await inboxThread(id)
          : mode === 'admin'
            ? await myThread(id)
            : await guestThread(id);
        // Llegó tarde y el usuario ya está en otro hilo: se descarta.
        if (currentIdRef.current !== id) return;
        setCurrent(t.conversation);
        setMessages(t.messages);
      } catch (e) {
        if (currentIdRef.current !== id) return;
        setError(e instanceof Error ? e.message : 'No se pudo abrir la conversación.');
      } finally {
        if (currentIdRef.current === id) setLoadingThread(false);
      }
    },
    [isRoot, mode],
  );

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), POLL_LIST_MS);
    return () => clearInterval(t);
  }, [loadList]);

  // Mientras la conversación está abierta se refresca seguido, que es lo que
  // da la sensación de chat en vivo. Depende del ID, no del objeto: cada
  // respuesta trae una conversación nueva y el temporizador se recreaba.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!open || view !== 'thread' || !currentId) return;
    const t = setInterval(() => void loadThread(currentId), POLL_THREAD_MS);
    return () => clearInterval(t);
  }, [open, view, currentId, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Cortar la grabación al desmontar: si se iba sin pulsar "detener", el
  // micrófono quedaba abierto indefinidamente.
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

  // Escape cierra primero la foto, después el panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (visor) {
        setVisor(null);
        setZoom(false);
      } else {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, visor]);

  /* ── Acciones ── */

  function openThread(c: SupportConversation) {
    currentIdRef.current = c.id;
    setCurrent(c);
    setMessages([]);
    setLoadingThread(true);
    setView('thread');
    setError(null);
    void loadThread(c.id);
  }

  /** Abre el panel. El visitante y el administrador entran directo a su chat. */
  async function abrir() {
    setOpen(true);
    setError(null);
    const list = await loadList();
    if (isRoot) return;
    const propia = list?.[0];
    if (propia) openThread(propia);
    else {
      currentIdRef.current = null;
      setCurrent(null);
      setMessages([]);
      setView('thread');
    }
  }

  function buildForm(text: string) {
    const fd = new FormData();
    fd.append('body', text);
    files.forEach((f) => fd.append('files', f));
    return fd;
  }

  async function send() {
    if (busy) return;
    if (!draft.trim() && files.length === 0) return;
    if (!isRoot && !current && mode === 'guest' && name.trim().length < 2) {
      setError('Escribe tu nombre para saber a quién respondemos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = buildForm(draft);
      if (current) {
        if (isRoot) await inboxReply(current.id, fd);
        else if (mode === 'admin') await myReply(current.id, fd);
        else await guestReply(current.id, fd);
      } else if (mode === 'admin') {
        const conv = await myStart(fd);
        currentIdRef.current = conv.id;
        setCurrent(conv);
      } else {
        fd.append('name', name.trim());
        const out = await guestStart(fd);
        currentIdRef.current = out.conversation.id;
        setCurrent(out.conversation);
      }
      setDraft('');
      setFiles([]);
      if (currentIdRef.current) await loadThread(currentIdRef.current);
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
    if (!window.confirm(`¿Bloquear la conversación de ${current.authorName}? Ya no podrá escribirte.`)) return;
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

  function volverALista() {
    currentIdRef.current = null;
    setView('list');
    setCurrent(null);
    void loadList();
  }

  /* ── Vistas ── */

  if (!open) {
    return (
      <button
        type="button"
        className={styles.fab}
        onClick={() => void abrir()}
        aria-label={isRoot ? 'Abrir bandeja de soporte' : 'Escribirle al administrador'}
      >
        {isRoot ? 'Soporte' : '¿Algo no funciona?'}
        {unread > 0 && <span className={styles.badge}>{unread}</span>}
      </button>
    );
  }

  const bloqueada = current?.status === 'BLOCKED';
  const nuevoVisitante = mode === 'guest' && !current;

  const visorPortal =
    visor && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Foto ampliada"
            onClick={() => {
              setVisor(null);
              setZoom(false);
            }}
          >
            <div className={styles.lightboxBar} onClick={(e) => e.stopPropagation()}>
              <span className={styles.lightboxHint}>
                {zoom ? 'Toca la foto para alejar' : 'Toca la foto para acercar'}
              </span>
              <a className={styles.lightboxBtn} href={visor.src} target="_blank" rel="noreferrer">
                Abrir original
              </a>
              <button
                type="button"
                className={styles.lightboxBtn}
                onClick={() => {
                  setVisor(null);
                  setZoom(false);
                }}
                aria-label="Cerrar foto"
              >
                ✕
              </button>
            </div>
            <div
              className={`${styles.lightboxStage} ${zoom ? styles.lightboxStageZoom : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={visor.src}
                alt={visor.name}
                className={`${styles.lightboxImg} ${zoom ? styles.lightboxImgZoom : ''}`}
                onClick={() => setZoom((z) => !z)}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section className={styles.panel} aria-label="Canal de soporte">
      <header className={styles.head}>
        <div>
          <p className={styles.headTitle}>
            {isRoot
              ? view === 'thread' && current
                ? current.authorName
                : 'Bandeja de soporte'
              : 'Escríbele al administrador'}
          </p>
          <p className={styles.headSub}>
            {isRoot
              ? view === 'thread' && current
                ? current.authorKind === 'ADMIN'
                  ? 'Administrador del panel'
                  : 'Visitante del portal'
                : 'Una conversación por persona'
              : 'Fallos, faltantes o sugerencias. Te respondemos por aquí.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isRoot && view === 'thread' && (
            <button type="button" className={styles.iconBtn} onClick={volverALista} aria-label="Volver">
              ←
            </button>
          )}
          <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Cerrar">
            ✕
          </button>
        </div>
      </header>

      {view === 'thread' ? (
        <>
          <div className={styles.body}>
            {loadingThread && messages.length === 0 && <p className={styles.empty}>Cargando…</p>}
            {!loadingThread && messages.length === 0 && !isRoot && (
              <p className={styles.intro}>
                Cuéntanos qué pasó, qué falta o qué se te ocurre. Puedes adjuntar fotos o una
                nota de voz. Todo queda en esta misma conversación.
              </p>
            )}
            {messages.map((m) => {
              const mine = isRoot ? m.senderKind === 'ROOT' : m.senderKind === 'AUTHOR';
              return (
                <div key={m.id} className={`${styles.msg} ${mine ? styles.mine : styles.theirs}`}>
                  {m.body}
                  {m.attachments.map((a) =>
                    a.kind === 'audio' ? (
                      <audio key={a.url} className={styles.audio} controls preload="none" src={a.url} />
                    ) : (
                      <button
                        key={a.url}
                        type="button"
                        className={styles.thumbBtn}
                        onClick={() => {
                          setZoom(false);
                          setVisor({ src: a.url, name: a.name });
                        }}
                        aria-label="Ver la foto en grande"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={styles.thumb} src={a.url} alt={a.name} loading="lazy" />
                      </button>
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
              <button type="button" className={styles.ghost} onClick={() => setFiles([])}>
                Quitar
              </button>
            </div>
          )}

          {bloqueada ? (
            <p className={styles.empty}>Esta conversación está bloqueada.</p>
          ) : (
            <>
              {nuevoVisitante && (
                <label className={`${styles.field} ${styles.nameRow}`}>
                  <span>Tu nombre</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </label>
              )}
              <div className={styles.composer}>
                <label className={styles.ghost} style={{ cursor: 'pointer' }}>
                  Foto
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])}
                  />
                </label>
                <button type="button" className={styles.ghost} onClick={() => void toggleRecording()}>
                  {recording ? 'Detener' : 'Voz'}
                </button>
                <textarea
                  rows={1}
                  value={draft}
                  placeholder="Escribe un mensaje"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.send}
                  disabled={busy}
                  onClick={() => void send()}
                  aria-label="Enviar"
                >
                  ➤
                </button>
              </div>
            </>
          )}

          {isRoot && current && !bloqueada && (
            <div className={styles.attachRow}>
              <button type="button" className={styles.ghost} onClick={() => void block()}>
                Bloquear a esta persona
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.body}>
          {convs.length === 0 ? (
            <p className={styles.empty}>Todavía no te han escrito.</p>
          ) : (
            <ul className={styles.list}>
              {convs.map((c) => (
                <li key={c.id}>
                  <button type="button" className={styles.item} onClick={() => openThread(c)}>
                    <span className={styles.itemTop}>
                      <span className={styles.itemSubject}>
                        {c.authorName}
                        {c.unread > 0 && <span className={styles.dot} aria-label="Sin leer" />}
                      </span>
                      <span className={styles.itemMeta}>{timeOf(c.lastMessageAt)}</span>
                    </span>
                    <span className={styles.itemPreview}>
                      {c.preview ? `${c.previewMine ? 'Tú: ' : ''}${c.preview}` : c.subject}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
      {visorPortal}
    </section>
  );
}
