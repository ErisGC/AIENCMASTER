import {
  Body,
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
import { validateUploadedFiles } from "../../common/validation/file-validation";
import { AdminAuditService } from "../admin-security/admin-audit.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { ChurchPermission } from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { ChurchAnnouncementsService } from "./church-announcements.service";
import { CreateChurchAnnouncementDto } from "./dto/create-church-announcement.dto";
import { UpdateChurchAnnouncementDto } from "./dto/update-church-announcement.dto";

interface IncomingFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

@Controller("churches/:churchId/announcements")
export class PublicChurchAnnouncementsController {
  constructor(private readonly service: ChurchAnnouncementsService) {}

  @Get()
  list(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
  ) {
    return this.service.listForPublic(churchId);
  }

  @Get(":id")
  findOne(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.findOnePublic(churchId, id);
  }
}

@Controller("admin/churches/:churchId/announcements")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminChurchAnnouncementsController {
  constructor(
    private readonly service: ChurchAnnouncementsService,
    private readonly permissions: PermissionsService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  async list(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );
    return this.service.listForAdmin(churchId);
  }

  @Get(":id")
  async findOne(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );
    return this.service.findOneForAdmin(churchId, id);
  }

  @Post()
  async create(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );

    const dto: CreateChurchAnnouncementDto = {
      title: "",
      description: "",
      author: "",
    };
    const files: IncomingFile[] = [];

    for await (const part of req.parts()) {
      if (part.type === "file") {
        files.push({
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        });
      } else {
        dto[part.fieldname as keyof CreateChurchAnnouncementDto] =
          part.value as string;
      }
    }

    const validated = await validateDto(CreateChurchAnnouncementDto, dto);
    validateUploadedFiles(files);

    const announcement = await this.service.create(
      churchId,
      validated,
      files,
      actor.account,
    );

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_ANNOUNCEMENT_CREATED",
      targetType: "CHURCH_ANNOUNCEMENT",
      targetId: announcement.id,
      description: `Anuncio creado en iglesia: ${announcement.title}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { churchId },
    });

    return announcement;
  }

  @Patch(":id")
  async update(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateChurchAnnouncementDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );

    const announcement = await this.service.update(
      churchId,
      id,
      dto,
      actor.account,
    );

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_ANNOUNCEMENT_UPDATED",
      targetType: "CHURCH_ANNOUNCEMENT",
      targetId: announcement.id,
      description: `Anuncio actualizado: ${announcement.title}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { churchId },
    });

    return announcement;
  }

  @Delete(":id")
  async remove(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );

    const result = await this.service.remove(churchId, id);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_ANNOUNCEMENT_DELETED",
      targetType: "CHURCH_ANNOUNCEMENT",
      targetId: id,
      description: "Anuncio de iglesia eliminado",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { churchId },
    });

    return result;
  }
}
