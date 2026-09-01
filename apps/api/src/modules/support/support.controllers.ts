import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  ValidatableFile,
} from "../../common/validation/file-validation";
import { AdminRateLimitService } from "../admin-security/admin-rate-limit.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { SupportConversationStatus } from "./support-conversation.entity";
import { SupportService } from "./support.service";

interface MultipartPart {
  type: "file" | "field";
  filename: string;
  mimetype: string;
  fieldname: string;
  value?: unknown;
  toBuffer(): Promise<Buffer>;
}

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

/** Sólo capturas y notas de voz; con tope de tamaño por tipo. */
function validateSupportFile(f: ValidatableFile) {
  if (ALLOWED_IMAGE.has(f.mimetype)) {
    if (f.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `La imagen ${f.filename} supera el máximo de 10 MB.`,
      );
    }
    return;
  }
  if (ALLOWED_AUDIO.has(f.mimetype)) {
    if (f.buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `El audio ${f.filename} supera el máximo de 25 MB.`,
      );
    }
    return;
  }
  throw new BadRequestException(
    `Sólo se permiten imágenes y audios (recibido: ${f.mimetype}).`,
  );
}

/**
 * Tope de adjuntos por mensaje. Debe coincidir con el que aplica el servicio;
 * aquí se comprueba DURANTE la lectura para no llegar a acumular en memoria
 * más de lo permitido. El endpoint de visitantes no exige autenticación, así
 * que validar sólo al final dejaba una vía para tumbar el proceso enviando
 * muchos archivos en una única petición.
 */
const MAX_SUPPORT_FILES = 5;

async function parseMultipart(req: AdminRequest) {
  const fields: Record<string, string> = {};
  const files: ValidatableFile[] = [];
  for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
    if (part.type === "file") {
      if (files.length >= MAX_SUPPORT_FILES) {
        throw new BadRequestException(
          `Máximo ${MAX_SUPPORT_FILES} archivos por mensaje.`,
        );
      }
      const file: ValidatableFile = {
        filename: part.filename,
        mimetype: part.mimetype,
        buffer: await part.toBuffer(),
      };
      validateSupportFile(file);
      files.push(file);
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, files };
}

/* ── Público: visitantes del portal ─────────────────────────────────────── */

@Controller("support")
export class PublicSupportController {
  constructor(
    private readonly service: SupportService,
    private readonly rateLimit: AdminRateLimitService,
  ) {}

  /**
   * Freno por dirección IP para los envíos de visitantes.
   *
   * El tope de mensajes por hora del servicio se cuenta contra el token que
   * guarda el navegador, y ese token lo elige quien llama: bastaba con no
   * enviarlo para estrenar identidad y saltarse el límite (y también el
   * bloqueo de una conversación). Como estos endpoints no piden
   * autenticación, hace falta un freno que el cliente no controle.
   *
   * La IP es fiable porque el arranque confía en exactamente un proxy
   * (Railway) y no reenviamos las cabeceras de IP que manda el cliente.
   */
  private enforceIpLimit(req: AdminRequest) {
    this.rateLimit.consume({
      scope: "support-guest",
      windowSeconds: 60 * 60,
      blockSeconds: 15 * 60,
      message:
        "Has enviado demasiados mensajes seguidos. Intenta de nuevo más tarde.",
      dimensions: [
        {
          label: "ip",
          value: req.ip,
          maxAttempts: 30,
        },
      ],
    });
  }

  /** Abre un hilo. Devuelve el token que el navegador debe guardar. */
  @Post("guest/start")
  async start(@Req() req: AdminRequest) {
    this.enforceIpLimit(req);
    const { fields, files } = await parseMultipart(req);
    return this.service.guestStart({
      name: fields.name ?? "",
      subject: fields.subject ?? "",
      body: fields.body ?? "",
      files,
      existingToken: fields.token ?? null,
    });
  }

  /**
   * Identificador del visitante, de la cabecera y con respaldo en la
   * dirección.
   *
   * Este valor da acceso al historial de quien escribe. En la dirección
   * quedaba registrado en los accesos del servidor, del proxy y de cualquier
   * intermediario, así que quien leyera esos registros podía suplantar a un
   * visitante; por eso el portal lo manda ahora en una cabecera.
   *
   * Se sigue aceptando en la dirección para no dejar tirado a quien tenga el
   * portal viejo cargado en el navegador mientras se despliega. Se puede
   * retirar pasados unos días.
   */
  private guestTokenDe(
    cabecera: string | undefined,
    enDireccion: string | undefined,
  ): string {
    return (cabecera ?? enDireccion ?? "").trim();
  }

  @Get("guest/conversations")
  list(
    @Headers("x-aienc-support-token") tokenCabecera: string | undefined,
    @Query("token") tokenDireccion: string | undefined,
  ) {
    const token = this.guestTokenDe(tokenCabecera, tokenDireccion);
    if (!token) throw new BadRequestException("Falta el identificador.");
    return this.service.guestList(token);
  }

  @Get("guest/conversations/:id")
  thread(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("x-aienc-support-token") tokenCabecera: string | undefined,
    @Query("token") tokenDireccion: string | undefined,
  ) {
    return this.service.threadForAuthor(id, {
      guestToken: this.guestTokenDe(tokenCabecera, tokenDireccion),
    });
  }

  @Post("guest/conversations/:id/messages")
  async reply(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
  ) {
    this.enforceIpLimit(req);
    const { fields, files } = await parseMultipart(req);
    return this.service.replyAsAuthor(id, fields.body ?? "", files, {
      guestToken: fields.token ?? null,
    });
  }
}

/* ── Administradores autenticados ───────────────────────────────────────── */

@Controller("admin/support")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminSupportController {
  constructor(private readonly service: SupportService) {}

  /** Hilos propios del administrador que consulta. */
  @Get("conversations")
  mine(@AdminAuth() actor: AuthenticatedAdminContext) {
    return this.service.listForAdmin(actor.account);
  }

  @Post("conversations")
  async start(
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const { fields, files } = await parseMultipart(req);
    return this.service.adminStart(actor.account, {
      subject: fields.subject ?? "",
      body: fields.body ?? "",
      files,
    });
  }

  @Get("conversations/:id")
  thread(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.threadForAuthor(id, { account: actor.account });
  }

  @Post("conversations/:id/messages")
  async reply(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const { fields, files } = await parseMultipart(req);
    return this.service.replyAsAuthor(id, fields.body ?? "", files, {
      account: actor.account,
    });
  }

  /* ── Bandeja del administrador principal ── */

  @Get("inbox")
  inbox(@AdminAuth() actor: AuthenticatedAdminContext) {
    return this.service.inbox(actor.account);
  }

  /** Contador para el botón flotante y el aviso dentro de la app. */
  @Get("inbox/unread")
  unread(@AdminAuth() actor: AuthenticatedAdminContext) {
    return this.service.unreadCount(actor.account);
  }

  @Get("inbox/:id")
  rootThread(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.threadForRoot(actor.account, id);
  }

  @Post("inbox/:id/messages")
  async rootReply(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const { fields, files } = await parseMultipart(req);
    return this.service.replyAsRoot(
      actor.account,
      id,
      fields.body ?? "",
      files,
    );
  }

  @Patch("inbox/:id/status")
  setStatus(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: { status?: string },
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const value = dto?.status;
    if (
      value !== SupportConversationStatus.OPEN &&
      value !== SupportConversationStatus.CLOSED &&
      value !== SupportConversationStatus.BLOCKED
    ) {
      throw new BadRequestException("Estado no válido.");
    }
    return this.service.setStatus(actor.account, id, value);
  }
}
