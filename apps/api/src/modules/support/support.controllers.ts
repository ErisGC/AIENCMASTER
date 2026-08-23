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

async function parseMultipart(req: AdminRequest) {
  const fields: Record<string, string> = {};
  const files: ValidatableFile[] = [];
  for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
    if (part.type === "file") {
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
  constructor(private readonly service: SupportService) {}

  /** Abre un hilo. Devuelve el token que el navegador debe guardar. */
  @Post("guest/start")
  async start(@Req() req: AdminRequest) {
    const { fields, files } = await parseMultipart(req);
    return this.service.guestStart({
      name: fields.name ?? "",
      subject: fields.subject ?? "",
      body: fields.body ?? "",
      files,
      existingToken: fields.token ?? null,
    });
  }

  @Get("guest/conversations")
  list(@Query("token") token: string) {
    if (!token) throw new BadRequestException("Falta el identificador.");
    return this.service.guestList(token);
  }

  @Get("guest/conversations/:id")
  thread(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("token") token: string,
  ) {
    return this.service.threadForAuthor(id, { guestToken: token });
  }

  @Post("guest/conversations/:id/messages")
  async reply(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
  ) {
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
