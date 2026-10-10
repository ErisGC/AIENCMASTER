import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  MAX_REPORT_DOCUMENT_BYTES,
  MAX_REPORT_DOCUMENTS_PER_UPLOAD,
  type ValidatableFile,
} from "../../common/validation/file-validation";
import { AdminAuditService } from "../admin-security/admin-audit.service";
import { AdminSessionService } from "../admin-security/admin-session.service";
import { AdminAuth } from "../admin-security/decorators/admin-auth.decorator";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { ReportsService, type ReportDocumentView } from "./reports.service";
import type { Report } from "./report.entity";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { QueryMetricsDto } from "./dto/query-metrics.dto";
import { QueryReportsDto } from "./dto/query-reports.dto";

interface MultipartPart {
  type: "file" | "field";
  filename: string;
  mimetype: string;
  fieldname: string;
  toBuffer(): Promise<Buffer>;
}

/** Alcance del permiso de subida directa: un informe concreto. */
const alcanceSubida = (reportId: string) => `report-documents:${reportId}`;

function userAgentDe(req: AdminRequest) {
  return typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"]
    : "";
}

/**
 * Lee los documentos del formulario multipart con límites propios: como
 * máximo los que admite una subida y un byte más del tope por archivo, para
 * no cargar en memoria archivos que de todos modos se van a rechazar.
 */
async function leerDocumentos(req: AdminRequest): Promise<ValidatableFile[]> {
  const files: ValidatableFile[] = [];
  try {
    const partes = req.parts({
      limits: {
        files: MAX_REPORT_DOCUMENTS_PER_UPLOAD,
        fileSize: MAX_REPORT_DOCUMENT_BYTES + 1,
      },
    }) as AsyncIterable<MultipartPart>;
    for await (const part of partes) {
      if (part.type !== "file") continue;
      files.push({
        filename: part.filename,
        mimetype: part.mimetype,
        buffer: await part.toBuffer(),
      });
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BadRequestException(
        "Uno de los archivos supera el tamaño máximo de 10 MB.",
      );
    }
    if (code === "FST_FILES_LIMIT") {
      throw new BadRequestException(
        `Se pueden subir hasta ${MAX_REPORT_DOCUMENTS_PER_UPLOAD} documentos a la vez.`,
      );
    }
    if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
      throw new BadRequestException(
        "Los documentos deben enviarse como formulario de archivos.",
      );
    }
    throw err;
  }
  return files;
}

async function auditarSubida(
  auditService: AdminAuditService,
  req: AdminRequest,
  actorAdminAccountId: string,
  actorDeviceId: string,
  report: Report,
  documents: ReportDocumentView[],
) {
  await auditService.log({
    actorAdminAccountId,
    actorDeviceId,
    actionType: "REPORT_DOCUMENT_ADDED",
    targetType: "REPORT",
    targetId: report.id,
    description:
      documents.length === 1
        ? `Documento adjunto al informe «${report.title}»: ${documents[0].fileName}`
        : `${documents.length} documentos adjuntos al informe «${report.title}»`,
    ip: req.ip ?? null,
    userAgent: userAgentDe(req),
    metadata: {
      churchId: report.churchId,
      reportType: report.reportType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      documents: documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        sizeBytes: d.sizeBytes,
      })),
    },
  });
}

@Controller("admin/reports")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly auditService: AdminAuditService,
    private readonly sessionService: AdminSessionService,
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
    return this.service.findOneForView(id, actor.account);
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
      userAgent: userAgentDe(req),
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
      userAgent: userAgentDe(req),
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
      description:
        result.documentsDeleted > 0
          ? `Informe eliminado junto con ${result.documentsDeleted} documento(s)`
          : "Informe eliminado",
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
    });

    return result;
  }

  /* ── Documentos ── */

  /** Subida con la sesión normal. La usa la aplicación móvil. */
  @Post(":id/documents")
  async addDocuments(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const files = await leerDocumentos(req);
    const out = await this.service.addDocuments(id, files, actor.account);
    await auditarSubida(
      this.auditService,
      req,
      actor.account.id,
      actor.device.id,
      out.report,
      out.documents,
    );
    return out.documents;
  }

  /**
   * Permiso de subida directa para la web, cuyo proxy no admite archivos de
   * más de 4,5 MB. Vence en diez minutos y solo sirve para este informe.
   */
  @Post(":id/documents/upload-ticket")
  @HttpCode(200)
  async uploadTicket(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    await this.service.assertPuedeAdjuntar(id, actor.account);
    const { ticket, expiresAt } = await this.sessionService.issueUploadTicket(
      actor,
      alcanceSubida(id),
      600,
    );
    return { ticket, expiresAt, uploadPath: `/admin/report-uploads/${id}` };
  }

  @Get(":id/documents/:documentId/url")
  async documentUrl(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("documentId", new ParseUUIDPipe({ version: "4" }))
    documentId: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const out = await this.service.documentDownloadUrl(
      id,
      documentId,
      actor.account,
    );

    // Abrir un documento privado queda en el historial.
    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "REPORT_DOCUMENT_VIEWED",
      targetType: "REPORT",
      targetId: id,
      description: `Documento consultado: ${out.fileName}`,
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
      metadata: { documentId, fileName: out.fileName },
    });

    return { url: out.url, expiresAt: out.expiresAt, fileName: out.fileName };
  }

  @Delete(":id/documents/:documentId")
  @HttpCode(200)
  async removeDocument(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("documentId", new ParseUUIDPipe({ version: "4" }))
    documentId: string,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const out = await this.service.removeDocument(
      id,
      documentId,
      actor.account,
    );

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "REPORT_DOCUMENT_DELETED",
      targetType: "REPORT",
      targetId: id,
      description: `Documento eliminado del informe: ${out.fileName}`,
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
      metadata: { documentId, fileName: out.fileName },
    });

    return out;
  }
}

/**
 * Subida directa desde la web, sin pasar por el proxy de Vercel.
 *
 * No lleva la guardia de sesión: el navegador no puede mandar aquí las
 * cookies de la web. La autorización es el permiso temporal emitido por
 * `POST /admin/reports/:id/documents/upload-ticket`, que se valida antes de
 * leer un solo byte del archivo. El origen también se exige.
 */
@Controller("admin/report-uploads")
@UseGuards(AdminOriginGuard)
export class ReportDirectUploadController {
  constructor(
    private readonly service: ReportsService,
    private readonly auditService: AdminAuditService,
    private readonly sessionService: AdminSessionService,
  ) {}

  @Post(":id")
  async upload(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("x-aienc-upload-ticket") ticket: string | undefined,
    @Req() req: AdminRequest,
  ) {
    const { account, device } = await this.sessionService.validateUploadTicket(
      ticket,
      alcanceSubida(id),
    );
    const files = await leerDocumentos(req);
    const out = await this.service.addDocuments(id, files, account);
    await auditarSubida(
      this.auditService,
      req,
      account.id,
      device.id,
      out.report,
      out.documents,
    );
    return out.documents;
  }
}
