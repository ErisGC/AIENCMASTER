import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AdminAuditService } from "../admin-security/admin-audit.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { ReportsService } from "./reports.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { QueryMetricsDto } from "./dto/query-metrics.dto";
import { QueryReportsDto } from "./dto/query-reports.dto";

@Controller("admin/reports")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  findAll(
    @Query() query: QueryReportsDto,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.findAll(query, actor.account);
  }

  /**
   * Métricas agregadas para dashboards: serie temporal por mes de
   * ofrendas, egresos y asistencia, más agregados por iglesia.
   * Filtra automáticamente por el scope del actor.
   */
  @Get("metrics/timeline")
  metricsTimeline(
    @Query() query: QueryMetricsDto,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.metricsTimeline(actor.account, {
      churchId: query.churchId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  @Get(":id")
  findOne(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.findOne(id, actor.account);
  }

  @Post()
  async create(
    @Body() dto: CreateReportDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const report = await this.service.create(dto, actor.account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "REPORT_CREATED",
      targetType: "REPORT",
      targetId: report.id,
      description: `Informe creado (${report.reportType}): ${report.title}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
      metadata: {
        churchId: report.churchId,
        reportType: report.reportType,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
      },
    });

    return report;
  }

  @Patch(":id")
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateReportDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const report = await this.service.update(id, dto, actor.account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "REPORT_UPDATED",
      targetType: "REPORT",
      targetId: report.id,
      description: `Informe actualizado: ${report.title}`,
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return report;
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const result = await this.service.remove(id, actor.account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "REPORT_DELETED",
      targetType: "REPORT",
      targetId: id,
      description: "Informe eliminado",
      ip: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : "",
    });

    return result;
  }
}
