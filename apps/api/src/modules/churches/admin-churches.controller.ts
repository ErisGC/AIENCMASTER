import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { validateDto } from "../../common/validation/validate-dto";
import { validateChurchImage } from "../../common/validation/file-validation";
import { AdminAuditService } from "../admin-security/admin-audit.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import type {
  AuthenticatedAdminContext,
  AdminRequest,
} from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { GlobalPermissionsGuard } from "../admin-security/permissions/global-permissions.guard";
import { RequireGlobalPermission } from "../admin-security/permissions/require-permission.decorator";
import {
  ChurchPermission,
  GlobalPermission,
} from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { ChurchesService } from "./churches.service";
import { CreateChurchDto } from "./dto/create-church.dto";
import { UpdateChurchDto } from "./dto/update-church.dto";

type IncomingFile = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const normalized =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? String(value).toLowerCase()
      : undefined;

  if (!normalized) return undefined;
  if (normalized === "true" || normalized === "1" || normalized === "on")
    return true;
  if (normalized === "false" || normalized === "0" || normalized === "off")
    return false;
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInt(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function normalizeOptionalText(
  value: string | undefined,
  emptyValue: null | undefined = undefined,
) {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  return normalized || emptyValue;
}

@Controller("admin/churches")
@UseGuards(AdminOriginGuard, AdminAuthGuard, GlobalPermissionsGuard)
export class AdminChurchesController {
  constructor(
    private readonly service: ChurchesService,
    private readonly auditService: AdminAuditService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAllForAdmin();
  }

  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.findByIdForAdmin(id);
  }

  @Post()
  @RequireGlobalPermission(GlobalPermission.MANAGE_CHURCHES)
  async create(
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const rawFields: Record<string, string> = {};
    const files: {
      mainImage?: IncomingFile;
      coverImage?: IncomingFile;
    } = {};

    for await (const part of req.parts()) {
      if (part.type === "file") {
        const incoming: IncomingFile = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };

        if (part.fieldname === "mainImage") files.mainImage = incoming;
        if (part.fieldname === "coverImage") files.coverImage = incoming;
      } else {
        rawFields[part.fieldname] = part.value as string;
      }
    }

    const payload: Record<string, unknown> = {
      ...rawFields,
      name: (rawFields.name ?? "").trim(),
      city: (rawFields.city ?? "").trim(),
      mapsLat: toNumber(rawFields.mapsLat),
      mapsLng: toNumber(rawFields.mapsLng),
      avgAttendance: toInt(rawFields.avgAttendance),
    };

    const address = normalizeOptionalText(rawFields.address);
    if (address !== undefined) payload.address = address;

    const mapsUrl = normalizeOptionalText(rawFields.mapsUrl);
    if (mapsUrl !== undefined) payload.mapsUrl = mapsUrl;

    const active = toBool(rawFields.isActive);
    if (active !== undefined) payload.isActive = active;

    const dto = await validateDto(CreateChurchDto, payload);
    if (files.mainImage) validateChurchImage(files.mainImage);
    if (files.coverImage) validateChurchImage(files.coverImage);
    const church = await this.service.create(dto, files);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_CREATED",
      targetType: "CHURCH",
      targetId: church.id,
      description: `Iglesia creada: ${church.name}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return church;
  }

  @Patch(":id")
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    // Autorización: o eres gestor global de iglesias, o tienes el permiso
    // por-iglesia EDIT_CHURCH_INFO sobre ESTA iglesia. Sin esto, cualquier
    // admin autenticado podía editar cualquier iglesia (IDOR).
    if (
      !this.permissions.hasGlobalPermission(
        actor.account,
        GlobalPermission.MANAGE_CHURCHES,
      )
    ) {
      await this.permissions.assertChurchPermission(
        actor.account,
        id,
        ChurchPermission.EDIT_CHURCH_INFO,
      );
    }

    const rawFields: Record<string, string> = {};
    const files: {
      mainImage?: IncomingFile;
      coverImage?: IncomingFile;
    } = {};

    for await (const part of req.parts()) {
      if (part.type === "file") {
        const incoming: IncomingFile = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };

        if (part.fieldname === "mainImage") files.mainImage = incoming;
        if (part.fieldname === "coverImage") files.coverImage = incoming;
      } else {
        rawFields[part.fieldname] = part.value as string;
      }
    }

    const payload: Record<string, unknown> = { ...rawFields };

    if (rawFields.name !== undefined) payload.name = rawFields.name.trim();
    if (rawFields.city !== undefined) payload.city = rawFields.city.trim();

    const address = normalizeOptionalText(rawFields.address, null);
    if (address !== undefined) payload.address = address;

    const mapsUrl = normalizeOptionalText(rawFields.mapsUrl, null);
    if (mapsUrl !== undefined) payload.mapsUrl = mapsUrl;

    if (rawFields.mapsLat !== undefined) {
      payload.mapsLat =
        rawFields.mapsLat === "" ? null : toNumber(rawFields.mapsLat);
    }

    if (rawFields.mapsLng !== undefined) {
      payload.mapsLng =
        rawFields.mapsLng === "" ? null : toNumber(rawFields.mapsLng);
    }

    if (rawFields.avgAttendance !== undefined) {
      payload.avgAttendance =
        rawFields.avgAttendance === "" ? null : toInt(rawFields.avgAttendance);
    }

    const active = toBool(rawFields.isActive);
    if (active !== undefined) payload.isActive = active;

    const dto = await validateDto(UpdateChurchDto, payload);
    if (files.mainImage) validateChurchImage(files.mainImage);
    if (files.coverImage) validateChurchImage(files.coverImage);
    const church = await this.service.update(id, dto, files);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_UPDATED",
      targetType: "CHURCH",
      targetId: church.id,
      description: `Iglesia actualizada: ${church.name}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return church;
  }

  @Patch(":id/toggle")
  @RequireGlobalPermission(GlobalPermission.MANAGE_CHURCHES)
  async toggleActive(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const church = await this.service.toggleActive(id);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_TOGGLED",
      targetType: "CHURCH",
      targetId: church.id,
      description: `Estado de iglesia actualizado: ${church.name}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { isActive: church.isActive },
    });

    return church;
  }

  @Delete(":id")
  @RequireGlobalPermission(GlobalPermission.MANAGE_CHURCHES)
  async remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.remove(id);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_DELETED",
      targetType: "CHURCH",
      targetId: id,
      description: "Iglesia eliminada",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return result;
  }
}
