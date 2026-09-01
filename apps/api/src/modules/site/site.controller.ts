import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AdminAuditService } from "../admin-security/admin-audit.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { RootDeviceGuard } from "../admin-security/guards/root-device.guard";
import { RootRoleGuard } from "../admin-security/guards/root-role.guard";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "../admin-security/admin-security.types";
import { UpdateBackgroundDto } from "./dto/update-background.dto";
import { UpdateSiteSettingsDto } from "./dto/update-site-settings.dto";
import { SiteService } from "./site.service";
import type { ValidatableFile } from "../../common/validation/file-validation";

interface MultipartPart {
  type: "file" | "field";
  filename: string;
  mimetype: string;
  fieldname: string;
  value?: unknown;
  toBuffer(): Promise<Buffer>;
}

/**
 * Endpoint público — retorna las imágenes activas y el intervalo de rotación.
 */
@Controller("site")
export class PublicSiteController {
  constructor(private readonly service: SiteService) {}

  @Get("background")
  background() {
    return this.service.getPublicBackgrounds();
  }
}

/**
 * Endpoints administrativos — sólo ROOT desde ROOT_DEVICE.
 */
@Controller("admin/site")
@UseGuards(AdminOriginGuard, AdminAuthGuard, RootRoleGuard, RootDeviceGuard)
export class AdminSiteController {
  constructor(
    private readonly service: SiteService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get("settings")
  getSettings() {
    return this.service.getSettings();
  }

  @Patch("settings")
  async updateSettings(
    @Body() dto: UpdateSiteSettingsDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.updateSettings(dto);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "SITE_SETTINGS_UPDATED",
      targetType: "SITE_SETTINGS",
      description: "Configuración del sitio actualizada",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: dto as Record<string, unknown>,
    });

    return result;
  }

  @Get("backgrounds")
  list() {
    return this.service.findAllForAdmin();
  }

  @Post("backgrounds")
  async create(
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    let desktop: ValidatableFile | null = null;
    let mobile: ValidatableFile | null = null;
    let label = "";

    for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
      if (part.type === "file") {
        const file: ValidatableFile = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };
        if (part.fieldname === "desktop") desktop = file;
        else if (part.fieldname === "mobile") mobile = file;
      } else if (part.fieldname === "label" && typeof part.value === "string") {
        label = part.value;
      }
    }

    if (!desktop) {
      // Falta un dato de quien llama, no un fallo del servidor: con `Error` a
      // secas esto se respondía como error interno y ensuciaba el registro.
      throw new BadRequestException(
        "Falta la imagen principal (campo 'desktop').",
      );
    }

    const created = await this.service.create({
      desktop,
      mobile: mobile ?? undefined,
      label,
    });

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "SITE_BACKGROUND_CREATED",
      targetType: "SITE_BACKGROUND",
      targetId: created.id,
      description: `Fondo creado${label ? `: ${label}` : ""}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return created;
  }

  @Patch("backgrounds/:id")
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateBackgroundDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.update(id, dto);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "SITE_BACKGROUND_UPDATED",
      targetType: "SITE_BACKGROUND",
      targetId: id,
      description: "Fondo actualizado",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return result;
  }

  @Put("backgrounds/order")
  async reorder(
    @Body() body: { ids: string[] },
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.reorder(body.ids ?? []);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "SITE_BACKGROUND_REORDERED",
      targetType: "SITE_BACKGROUND",
      description: "Orden de fondos actualizado",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return result;
  }

  @Delete("backgrounds/:id")
  async remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.remove(id);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "SITE_BACKGROUND_DELETED",
      targetType: "SITE_BACKGROUND",
      targetId: id,
      description: "Fondo eliminado",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return result;
  }
}
