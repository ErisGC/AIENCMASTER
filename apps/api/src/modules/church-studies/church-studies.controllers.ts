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
  Req,
  UseGuards,
} from "@nestjs/common";

import { validateDto } from "../../common/validation/validate-dto";
import {
  ValidatableFile,
  validateStudyAudio,
} from "../../common/validation/file-validation";
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
import { ChurchStudiesService } from "./church-studies.service";
import { CreateChurchStudyDto } from "./dto/create-church-study.dto";
import { UpdateChurchStudyDto } from "./dto/update-church-study.dto";

interface MultipartPart {
  type: "file" | "field";
  filename: string;
  mimetype: string;
  fieldname: string;
  value?: unknown;
  toBuffer(): Promise<Buffer>;
}

async function parseMultipart(req: AdminRequest) {
  const fields: Record<string, string> = {};
  let audio: ValidatableFile | null = null;
  for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
    if (part.type === "file") {
      const file: ValidatableFile = {
        filename: part.filename,
        mimetype: part.mimetype,
        buffer: await part.toBuffer(),
      };
      if (part.fieldname === "audio") audio = file;
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, audio };
}

@Controller("churches/:churchId/studies")
export class PublicChurchStudiesController {
  constructor(private readonly service: ChurchStudiesService) {}

  @Get()
  list(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
  ) {
    return this.service.listForPublic(churchId);
  }

  @Get(":id")
  findOne(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) _churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.service.findOnePublic(id);
  }
}

@Controller("admin/churches/:churchId/studies")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminChurchStudiesController {
  constructor(
    private readonly service: ChurchStudiesService,
    private readonly permissions: PermissionsService,
    private readonly auditService: AdminAuditService,
  ) {}

  private async assertScope(
    actor: AuthenticatedAdminContext,
    churchId: string,
  ) {
    await this.permissions.assertChurchPermission(
      actor.account,
      churchId,
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    );
  }

  @Get()
  async list(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.assertScope(actor, churchId);
    return this.service.listForAdmin(churchId);
  }

  @Post()
  async create(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.assertScope(actor, churchId);

    const { fields, audio } = await parseMultipart(req);
    if (!audio) {
      throw new BadRequestException("Falta el archivo de audio del estudio.");
    }
    validateStudyAudio(audio);
    const dto = await validateDto(CreateChurchStudyDto, fields);

    const study = await this.service.create(churchId, dto, audio);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_STUDY_CREATED",
      targetType: "CHURCH_STUDY",
      targetId: study.id,
      description: `Estudio en audio creado: ${study.topic} (${study.teacherName})`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { churchId },
    });

    return study;
  }

  @Patch(":id")
  async update(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateChurchStudyDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.assertScope(actor, churchId);

    const study = await this.service.update(churchId, id, dto);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_STUDY_UPDATED",
      targetType: "CHURCH_STUDY",
      targetId: study.id,
      description: `Estudio en audio actualizado: ${study.topic}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: { churchId },
    });

    return study;
  }

  @Delete(":id")
  async remove(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.assertScope(actor, churchId);

    const result = await this.service.remove(churchId, id);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "CHURCH_STUDY_DELETED",
      targetType: "CHURCH_STUDY",
      targetId: id,
      description: "Estudio en audio eliminado",
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
