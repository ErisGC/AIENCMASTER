import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ValidatableFile } from "../../common/validation/file-validation";
import { AdminAccount } from "../admin-security/admin-account.entity";
import { AdminRole } from "../admin-security/enums/admin-role.enum";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import {
  SupportAuthorKind,
  SupportConversation,
  SupportConversationStatus,
} from "./support-conversation.entity";
import {
  SupportAttachment,
  SupportMessage,
  SupportSenderKind,
} from "./support-message.entity";
import {
  createGuestToken,
  decryptBody,
  encryptBody,
  hashGuestToken,
  hashesMatch,
} from "./support-crypto";

const FOLDER = "support";

/** Tope de mensajes por visitante en una ventana de tiempo. */
const GUEST_MAX_MESSAGES = 20;
const GUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_BODY_CHARS = 4000;
const MAX_ATTACHMENTS = 5;

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportConversation)
    private readonly convRepo: Repository<SupportConversation>,
    @InjectRepository(SupportMessage)
    private readonly msgRepo: Repository<SupportMessage>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ── Serialización ── */

  private toMessage(m: SupportMessage) {
    return {
      id: m.id,
      senderKind: m.senderKind,
      body: decryptBody(m.bodyCipher),
      attachments: (m.attachments ?? []).map((a) => ({
        url: a.url,
        kind: a.kind,
        name: a.name,
        bytes: a.bytes,
      })),
      createdAt: m.createdAt,
    };
  }

  private toConversation(
    c: SupportConversation,
    unread = 0,
    last?: SupportMessage | null,
    viewer?: "root" | "author",
  ) {
    return {
      id: c.id,
      subject: c.subject,
      authorKind: c.authorKind,
      authorName: c.authorName,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      unread,
      /** Lo último que se dijo, para la lista (como en un chat). */
      preview: last ? this.previewOf(last) : null,
      /** Si ese último mensaje lo escribió quien mira la lista. */
      previewMine:
        !!last &&
        !!viewer &&
        (viewer === "root"
          ? last.senderKind === SupportSenderKind.ROOT
          : last.senderKind === SupportSenderKind.AUTHOR),
    };
  }

  private previewOf(m: SupportMessage) {
    const texto = decryptBody(m.bodyCipher).replace(/\s+/g, " ").trim();
    if (texto) return texto.length > 90 ? `${texto.slice(0, 90)}…` : texto;
    const adjuntos = m.attachments ?? [];
    if (adjuntos.some((a) => a.kind === "audio")) return "Nota de voz";
    if (adjuntos.length > 1) return `${adjuntos.length} fotos`;
    return adjuntos.length === 1 ? "Foto" : "";
  }

  /** Último mensaje de cada conversación, en una sola consulta. */
  private async lastMessages(ids: string[]) {
    const out = new Map<string, SupportMessage>();
    if (ids.length === 0) return out;
    const rows = (await this.msgRepo.query(
      `SELECT DISTINCT ON ("conversationId") *
         FROM support_messages
        WHERE "conversationId" = ANY($1)
        ORDER BY "conversationId", "createdAt" DESC`,
      [ids],
    )) as SupportMessage[];
    for (const r of rows) out.set(r.conversationId, r);
    return out;
  }

  private async withPreviews(
    convs: SupportConversation[],
    viewer: "root" | "author",
  ) {
    const last = await this.lastMessages(convs.map((c) => c.id));
    return convs.map((c) =>
      this.toConversation(
        c,
        this.unreadFor(c, viewer),
        last.get(c.id) ?? null,
        viewer,
      ),
    );
  }

  /**
   * Asunto interno de la conversación: el que se escribió o, si no, el
   * comienzo del primer mensaje. Ya no se le pide a nadie: cada persona tiene
   * una sola conversación, como en un chat.
   */
  private subjectFrom(
    subject: string | undefined,
    body: string,
    files: ValidatableFile[],
  ) {
    const s = (subject ?? "").replace(/\s+/g, " ").trim();
    if (s.length >= 3) return s.slice(0, 150);
    const t = body.replace(/\s+/g, " ").trim();
    if (t) return t.length > 60 ? `${t.slice(0, 60)}…` : t;
    return files.some((f) => f.mimetype.startsWith("audio/"))
      ? "Nota de voz"
      : "Foto";
  }

  /* ── Adjuntos ── */

  private async upload(files: ValidatableFile[]): Promise<SupportAttachment[]> {
    if (files.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `Máximo ${MAX_ATTACHMENTS} archivos por mensaje.`,
      );
    }
    const out: SupportAttachment[] = [];
    for (const f of files) {
      const up = await this.cloudinary.uploadToFolder(f.buffer, FOLDER);
      out.push({
        url: up.secure_url,
        publicId: up.public_id,
        kind: f.mimetype.startsWith("audio/") ? "audio" : "image",
        resourceType: up.resource_type ?? "image",
        name: f.filename,
        bytes: typeof up.bytes === "number" ? up.bytes : f.buffer.byteLength,
      });
    }
    return out;
  }

  private assertBody(body: string, files: ValidatableFile[]) {
    const clean = body.trim();
    if (!clean && files.length === 0) {
      throw new BadRequestException("El mensaje no puede ir vacío.");
    }
    if (clean.length > MAX_BODY_CHARS) {
      throw new BadRequestException(
        `El mensaje no puede superar ${MAX_BODY_CHARS} caracteres.`,
      );
    }
    return clean;
  }

  /* ── Visitante del portal público ── */

  /**
   * Abre un hilo nuevo. Devuelve el token que el navegador debe guardar para
   * reconocer al visitante en visitas posteriores.
   */
  async guestStart(input: {
    name: string;
    subject: string;
    body: string;
    files: ValidatableFile[];
    existingToken?: string | null;
  }) {
    const body = this.assertBody(input.body, input.files);

    // Una sola conversación por persona: si este navegador ya escribió antes,
    // el mensaje se suma a su conversación en vez de abrir otra.
    const previo = input.existingToken?.trim() || null;
    if (previo) {
      const hash = hashGuestToken(previo);
      await this.assertGuestNotFlooding(hash);
      const conv = await this.convRepo.findOne({
        where: { guestTokenHash: hash },
        order: { lastMessageAt: "DESC" },
      });
      if (conv) {
        await this.append(conv, SupportSenderKind.AUTHOR, body, input.files, null);
        return { token: previo, conversation: this.toConversation(conv) };
      }
    }

    const name = input.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException("Escribe tu nombre (entre 2 y 80 letras).");
    }
    const subject = this.subjectFrom(input.subject, body, input.files);

    const token = previo || createGuestToken();
    const tokenHash = hashGuestToken(token);

    await this.assertGuestNotFlooding(tokenHash);

    // Los adjuntos se suben ANTES de crear la conversación. Al revés, si la
    // subida fallaba quedaba un hilo sin un solo mensaje: aparecía vacío en la
    // bandeja del administrador principal y no había forma de borrarlo,
    // porque no existe un endpoint para eliminar conversaciones.
    const attachments = await this.upload(input.files);

    const now = new Date();
    const conv = await this.convRepo.save(
      this.convRepo.create({
        subject,
        authorKind: SupportAuthorKind.GUEST,
        authorName: name,
        guestTokenHash: tokenHash,
        status: SupportConversationStatus.OPEN,
        lastMessageAt: now,
      }),
    );

    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conv.id,
        senderKind: SupportSenderKind.AUTHOR,
        bodyCipher: encryptBody(body),
        attachments,
      }),
    );

    return { token, conversation: this.toConversation(conv) };
  }

  /** Corta el abuso: tope de mensajes por visitante en la ventana. */
  private async assertGuestNotFlooding(tokenHash: string) {
    const since = new Date(Date.now() - GUEST_WINDOW_MS);
    const convs = await this.convRepo.find({
      where: { guestTokenHash: tokenHash },
      select: ["id", "status"],
    });
    if (convs.some((c) => c.status === SupportConversationStatus.BLOCKED)) {
      throw new ForbiddenException(
        "Esta conversación fue bloqueada. Comunícate por otro medio.",
      );
    }
    if (convs.length === 0) return;

    const recent = await this.msgRepo
      .createQueryBuilder("m")
      .where("m.conversationId IN (:...ids)", { ids: convs.map((c) => c.id) })
      .andWhere("m.senderKind = :k", { k: SupportSenderKind.AUTHOR })
      .andWhere("m.createdAt > :since", { since })
      .getCount();

    if (recent >= GUEST_MAX_MESSAGES) {
      throw new ForbiddenException(
        "Has enviado demasiados mensajes seguidos. Intenta de nuevo más tarde.",
      );
    }
  }

  /** Hilos que pertenecen a un visitante concreto. */
  async guestList(token: string) {
    const tokenHash = hashGuestToken(token);
    const convs = await this.convRepo.find({
      where: { guestTokenHash: tokenHash },
      order: { lastMessageAt: "DESC" },
    });
    return this.withPreviews(convs, "author");
  }

  private unreadFor(c: SupportConversation, who: "root" | "author") {
    const readAt = who === "root" ? c.rootReadAt : c.authorReadAt;
    if (!readAt) return 1;
    return c.lastMessageAt > readAt ? 1 : 0;
  }

  /* ── Acceso a un hilo ── */

  private async loadConversation(id: string) {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException("Conversación no encontrada");
    return conv;
  }

  /** Comprueba que quien pide el hilo es su autor (visitante o admin). */
  private assertAuthor(
    conv: SupportConversation,
    opts: { guestToken?: string | null; account?: AdminAccount | null },
  ) {
    if (conv.authorKind === SupportAuthorKind.GUEST) {
      const hash = opts.guestToken ? hashGuestToken(opts.guestToken) : "";
      if (!conv.guestTokenHash || !hashesMatch(conv.guestTokenHash, hash)) {
        throw new ForbiddenException("Esta conversación no es tuya.");
      }
      return;
    }
    if (!opts.account || conv.authorAdminAccountId !== opts.account.id) {
      throw new ForbiddenException("Esta conversación no es tuya.");
    }
  }

  async threadForAuthor(
    id: string,
    opts: { guestToken?: string | null; account?: AdminAccount | null },
  ) {
    const conv = await this.loadConversation(id);
    this.assertAuthor(conv, opts);
    conv.authorReadAt = new Date();
    await this.convRepo.save(conv);
    return this.thread(conv);
  }

  private async thread(conv: SupportConversation) {
    const msgs = await this.msgRepo.find({
      where: { conversationId: conv.id },
      order: { createdAt: "ASC" },
    });
    return {
      conversation: this.toConversation(conv),
      messages: msgs.map((m) => this.toMessage(m)),
    };
  }

  /** Responde el autor del hilo. */
  async replyAsAuthor(
    id: string,
    body: string,
    files: ValidatableFile[],
    opts: { guestToken?: string | null; account?: AdminAccount | null },
  ) {
    const conv = await this.loadConversation(id);
    this.assertAuthor(conv, opts);
    if (conv.status === SupportConversationStatus.BLOCKED) {
      throw new ForbiddenException("Esta conversación fue bloqueada.");
    }
    const clean = this.assertBody(body, files);
    if (conv.authorKind === SupportAuthorKind.GUEST && conv.guestTokenHash) {
      await this.assertGuestNotFlooding(conv.guestTokenHash);
    }
    return this.append(conv, SupportSenderKind.AUTHOR, clean, files, null);
  }

  private async append(
    conv: SupportConversation,
    senderKind: SupportSenderKind,
    body: string,
    files: ValidatableFile[],
    senderAdminAccountId: string | null,
  ) {
    const attachments = await this.upload(files);
    const msg = await this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conv.id,
        senderKind,
        senderAdminAccountId,
        bodyCipher: encryptBody(body),
        attachments,
      }),
    );
    conv.lastMessageAt = msg.createdAt;
    if (senderKind === SupportSenderKind.ROOT) conv.rootReadAt = msg.createdAt;
    else conv.authorReadAt = msg.createdAt;
    // Es una sola conversación por persona: si estaba cerrada y vuelve a
    // escribir, se reabre (bloqueada sigue bloqueada).
    if (
      senderKind === SupportSenderKind.AUTHOR &&
      conv.status === SupportConversationStatus.CLOSED
    ) {
      conv.status = SupportConversationStatus.OPEN;
    }
    await this.convRepo.save(conv);
    return this.toMessage(msg);
  }

  /* ── Administrador autenticado que abre un hilo ── */

  async adminStart(
    account: AdminAccount,
    input: { subject: string; body: string; files: ValidatableFile[] },
  ) {
    const body = this.assertBody(input.body, input.files);

    // Una sola conversación por cuenta: si ya existe, el mensaje se suma ahí
    // (antes cada "nuevo reporte" abría otra y la bandeja se llenaba de
    // conversaciones repetidas de la misma persona).
    const previa = await this.convRepo.findOne({
      where: { authorAdminAccountId: account.id },
      order: { lastMessageAt: "DESC" },
    });
    if (previa) {
      if (previa.status === SupportConversationStatus.BLOCKED) {
        throw new ForbiddenException("Esta conversación fue bloqueada.");
      }
      await this.append(
        previa,
        SupportSenderKind.AUTHOR,
        body,
        input.files,
        account.id,
      );
      return this.toConversation(previa);
    }
    const subject = this.subjectFrom(input.subject, body, input.files);

    // Igual que en el canal de visitantes: los adjuntos primero, para que un
    // fallo de subida no deje un hilo sin mensajes en la bandeja.
    const attachments = await this.upload(input.files);

    const now = new Date();
    const conv = await this.convRepo.save(
      this.convRepo.create({
        subject,
        authorKind: SupportAuthorKind.ADMIN,
        authorName: account.displayName,
        authorAdminAccountId: account.id,
        status: SupportConversationStatus.OPEN,
        lastMessageAt: now,
      }),
    );

    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conv.id,
        senderKind: SupportSenderKind.AUTHOR,
        senderAdminAccountId: account.id,
        bodyCipher: encryptBody(body),
        attachments,
      }),
    );
    return this.toConversation(conv);
  }

  async listForAdmin(account: AdminAccount) {
    const convs = await this.convRepo.find({
      where: { authorAdminAccountId: account.id },
      order: { lastMessageAt: "DESC" },
    });
    return this.withPreviews(convs, "author");
  }

  /* ── Bandeja del administrador principal ── */

  private assertRoot(account: AdminAccount) {
    if (account.role !== AdminRole.ROOT) {
      throw new ForbiddenException("Sólo el administrador principal.");
    }
  }

  async inbox(account: AdminAccount) {
    this.assertRoot(account);
    const convs = await this.convRepo.find({
      order: { lastMessageAt: "DESC" },
      take: 200,
    });
    return this.withPreviews(convs, "root");
  }

  /** Número de hilos con mensajes que el principal aún no ha visto. */
  async unreadCount(account: AdminAccount) {
    this.assertRoot(account);
    const convs = await this.convRepo.find({
      select: ["id", "lastMessageAt", "rootReadAt"],
      take: 500,
    });
    return {
      unread: convs.filter((c) => this.unreadFor(c, "root") > 0).length,
    };
  }

  async threadForRoot(account: AdminAccount, id: string) {
    this.assertRoot(account);
    const conv = await this.loadConversation(id);
    conv.rootReadAt = new Date();
    await this.convRepo.save(conv);
    return this.thread(conv);
  }

  async replyAsRoot(
    account: AdminAccount,
    id: string,
    body: string,
    files: ValidatableFile[],
  ) {
    this.assertRoot(account);
    const conv = await this.loadConversation(id);
    const clean = this.assertBody(body, files);
    return this.append(conv, SupportSenderKind.ROOT, clean, files, account.id);
  }

  async setStatus(
    account: AdminAccount,
    id: string,
    status: SupportConversationStatus,
  ) {
    this.assertRoot(account);
    const conv = await this.loadConversation(id);
    conv.status = status;
    await this.convRepo.save(conv);
    return this.toConversation(conv);
  }
}
