import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  ValidatableFile,
  validateChurchImage,
} from "../../common/validation/file-validation";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { AdminAccount } from "./admin-account.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AdminAuth } from "./decorators/admin-auth.decorator";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOriginGuard } from "./guards/admin-origin.guard";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "./admin-security.types";

interface MultipartPart {
  type: "file" | "field";
  filename: string;
  mimetype: string;
  fieldname: string;
  value?: unknown;
  toBuffer(): Promise<Buffer>;
}

const PROFILE_FOLDER = "admin-profiles";

/**
 * Endpoints sobre el propio perfil del admin autenticado.
 * Cualquier admin (root o no) puede subir/quitar su foto de perfil.
 * La foto se utiliza automáticamente cuando aparece como director vinculado.
 */
@Controller("admin/me")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminProfileController {
  constructor(
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    private readonly cloudinary: CloudinaryService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  async me(@AdminAuth() actor: AuthenticatedAdminContext) {
    const account = await this.accountRepo.findOne({
      where: { id: actor.account.id },
      relations: { assignedChurch: true },
    });
    if (!account) return null;
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      assignedChurchId: account.assignedChurchId,
      assignedChurchName: account.assignedChurch?.name ?? null,
      profilePhotoUrl: account.profilePhotoUrl ?? null,
    };
  }

  @Post("photo")
  async uploadPhoto(
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    let photo: ValidatableFile | null = null;
    for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
      if (part.type === "file" && part.fieldname === "photo") {
        photo = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };
      }
    }
    if (!photo) {
      throw new BadRequestException("Falta el archivo 'photo'");
    }
    validateChurchImage(photo);

    const account = await this.accountRepo.findOne({
      where: { id: actor.account.id },
    });
    if (!account) {
      throw new BadRequestException("Cuenta no encontrada");
    }

    // Se sube la nueva ANTES de borrar la anterior. Al revés, un fallo de red
    // o de cuota en la subida dejaba la cuenta apuntando a un archivo ya
    // borrado: la foto quedaba rota de forma permanente hasta volver a
    // subirla a mano.
    const anterior = account.profilePhotoPublicId;

    const uploaded = await this.cloudinary.uploadToFolder(
      photo.buffer,
      PROFILE_FOLDER,
    );
    account.profilePhotoUrl = uploaded.secure_url;
    account.profilePhotoPublicId = uploaded.public_id;
    await this.accountRepo.save(account);

    if (anterior) {
      await this.cloudinary.delete(anterior);
    }

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_PROFILE_PHOTO_UPDATED",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: "Foto de perfil actualizada",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return {
      profilePhotoUrl: account.profilePhotoUrl,
    };
  }

  @Delete("photo")
  @HttpCode(200)
  async removePhoto(
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: actor.account.id },
    });
    if (!account) return { ok: false };

    if (account.profilePhotoPublicId) {
      await this.cloudinary.delete(account.profilePhotoPublicId);
    }
    account.profilePhotoUrl = null;
    account.profilePhotoPublicId = null;
    await this.accountRepo.save(account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_PROFILE_PHOTO_REMOVED",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: "Foto de perfil eliminada",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return { ok: true };
  }
}
