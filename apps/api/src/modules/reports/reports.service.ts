import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";

import {
  MAX_REPORT_DOCUMENTS_PER_REPORT,
  MAX_REPORT_DOCUMENTS_PER_UPLOAD,
  type ValidatableFile,
  validateReportDocument,
} from "../../common/validation/file-validation";

import { AdminAccount } from "../admin-security/admin-account.entity";
import {
  ChurchPermission,
  GlobalPermission,
} from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { Church } from "../churches/church.entity";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { QueryReportsDto } from "./dto/query-reports.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { ReportType } from "./enums/report-type.enum";
import { Report } from "./report.entity";
import { ReportDocument } from "./report-document.entity";

/** Documento tal como lo ve quien tiene permiso: nunca incluye el archivo ni su ubicación. */
export interface ReportDocumentView {
  id: string;
  fileName: string;
  mimeType: string;
  kind: string;
  sizeBytes: number;
  uploadedByAdminAccountId: string;
  uploadedByDisplayName: string;
  createdAt: Date;
}

/** Marcas diacríticas que quedan sueltas tras normalizar a NFD (tildes, diéresis). */
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
);
const BARRA_INVERTIDA = String.fromCharCode(92);

/** Convierte el nombre de un archivo en un tramo seguro para un identificador. */
function slug(texto: string, max = 50): string {
  return (
    texto
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "documento"
  );
}

/** Nombre visible: sin rutas, sin caracteres de control y con un largo razonable. */
function nombreVisible(original: string): string {
  const base =
    (original ?? "").split("/").pop()?.split(BARRA_INVERTIDA).pop() ?? "";
  const limpio = Array.from(base)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c !== 127;
    })
    .join("")
    .trim();
  return (limpio || "documento").slice(0, 200);
}

const MAX_DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ReportDocument)
    private readonly documentRepo: Repository<ReportDocument>,
    private readonly permissions: PermissionsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ── Helpers ── */

  /**
   * Verifica que el admin puede crear/editar/eliminar informes sobre la
   * iglesia dada. ROOT siempre puede. Un admin normal necesita estar
   * asignado a esa iglesia con el permiso SUBMIT_REPORTS.
   */
  private async assertSubmitScope(actor: AdminAccount, churchId: string) {
    if (this.permissions.isRoot(actor)) return;
    const ok = await this.permissions.hasChurchPermission(
      actor,
      churchId,
      ChurchPermission.SUBMIT_REPORTS,
    );
    if (!ok) {
      throw new ForbiddenException(
        "No tienes permiso para gestionar informes de esta iglesia.",
      );
    }
  }

  /**
   * Verifica que el admin puede LEER un informe específico.
   * ROOT siempre puede. Un admin con VIEW_ALL_REPORTS global ve todos.
   * Resto: solo informes de las iglesias asignadas.
   */
  private async canView(actor: AdminAccount, churchId: string) {
    if (this.permissions.isRoot(actor)) return true;
    if (
      this.permissions.hasGlobalPermission(
        actor,
        GlobalPermission.VIEW_ALL_REPORTS,
      )
    ) {
      return true;
    }
    const assigned = await this.permissions.getAssignedChurchIds(actor);
    return assigned.includes(churchId);
  }

  private validateData(reportType: ReportType, data: Record<string, unknown>) {
    if (!data || typeof data !== "object") {
      throw new BadRequestException("data debe ser un objeto");
    }

    // Informe entregado solo como documento: los datos del formulario no
    // aplican. El documento se adjunta justo después de crearlo.
    if ((data as { documentOnly?: unknown }).documentOnly === true) return;

    switch (reportType) {
      case ReportType.OFFERINGS: {
        const total = Number((data as { totalCop?: unknown }).totalCop);
        if (!Number.isFinite(total) || total < 0) {
          throw new BadRequestException(
            "data.totalCop debe ser un número >= 0",
          );
        }
        break;
      }

      case ReportType.EXPENSES: {
        const total = Number((data as { totalCop?: unknown }).totalCop);
        if (!Number.isFinite(total) || total < 0) {
          throw new BadRequestException(
            "data.totalCop debe ser un número >= 0",
          );
        }
        // category opcional pero si viene debe ser válida
        const cat = (data as { category?: unknown }).category;
        if (cat !== undefined) {
          const valid = [
            "PURCHASE",
            "REPAIR",
            "DAMAGE",
            "THEFT",
            "UTILITIES",
            "OTHER",
          ];
          if (typeof cat !== "string" || !valid.includes(cat)) {
            throw new BadRequestException(
              "data.category debe ser PURCHASE|REPAIR|DAMAGE|THEFT|UTILITIES|OTHER",
            );
          }
        }
        // description corta opcional
        const desc = (data as { description?: unknown }).description;
        if (
          desc !== undefined &&
          typeof desc === "string" &&
          desc.length > 2000
        ) {
          throw new BadRequestException(
            "data.description excede el máximo (2000 caracteres)",
          );
        }
        break;
      }

      case ReportType.ATTENDANCE: {
        // scope discriminado: 'session' o 'month'
        const scopeRaw = (data as { scope?: unknown }).scope;
        const scope = scopeRaw === "session" ? "session" : "month";

        const count = Number((data as { count?: unknown }).count);
        if (!Number.isInteger(count) || count < 0) {
          throw new BadRequestException("data.count debe ser entero >= 0");
        }

        if (scope === "session") {
          const sessionDate = (data as { sessionDate?: unknown }).sessionDate;
          if (
            typeof sessionDate !== "string" ||
            Number.isNaN(Date.parse(sessionDate))
          ) {
            throw new BadRequestException(
              "data.sessionDate (ISO) es obligatorio para asistencia por culto",
            );
          }
        }
        break;
      }

      case ReportType.EVENT: {
        const raw = (data as { name?: unknown }).name;
        const name = typeof raw === "string" ? raw.trim() : "";
        if (!name || name.length > 200) {
          throw new BadRequestException(
            "data.name es obligatorio (máx 200 caracteres)",
          );
        }
        break;
      }

      case ReportType.REQUEST: {
        const subject = (data as { subject?: unknown }).subject;
        if (typeof subject !== "string" || subject.trim().length < 3) {
          throw new BadRequestException(
            "data.subject es obligatorio (mín 3 caracteres)",
          );
        }
        const status = (data as { status?: unknown }).status;
        if (status !== undefined) {
          const valid = ["PENDING", "APPROVED", "REJECTED", "RESOLVED"];
          if (typeof status !== "string" || !valid.includes(status)) {
            throw new BadRequestException(
              "data.status debe ser PENDING|APPROVED|REJECTED|RESOLVED",
            );
          }
        }
        const body = (data as { body?: unknown }).body;
        if (
          body !== undefined &&
          typeof body === "string" &&
          body.length > 4000
        ) {
          throw new BadRequestException(
            "data.body excede el máximo (4000 caracteres)",
          );
        }
        break;
      }

      case ReportType.OTHER: {
        const raw = (data as { freeText?: unknown }).freeText;
        const free = typeof raw === "string" ? raw : "";
        if (free.length > 8000) {
          throw new BadRequestException(
            "data.freeText excede el máximo (8000 caracteres)",
          );
        }
        break;
      }
    }
  }

  /* ── CRUD ── */

  async create(dto: CreateReportDto, actor: AdminAccount): Promise<Report> {
    await this.assertSubmitScope(actor, dto.churchId);
    this.validateData(dto.reportType, dto.data);

    const church = await this.churchRepo.findOne({
      where: { id: dto.churchId },
    });
    if (!church) {
      throw new NotFoundException("Iglesia no encontrada");
    }

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException(
        "periodEnd no puede ser anterior a periodStart",
      );
    }

    const entity = this.reportRepo.create({
      churchId: dto.churchId,
      reportType: dto.reportType,
      title: dto.title.trim(),
      notes: (dto.notes ?? "").trim(),
      periodStart,
      periodEnd,
      data: this.normalizarDatos(dto.data),
      createdByAdminAccountId: actor.id,
      createdByDisplayName: actor.displayName,
      lastUpdatedByAdminAccountId: null,
      lastUpdatedByDisplayName: null,
    });

    return this.reportRepo.save(entity);
  }

  async findAll(query: QueryReportsDto, actor: AdminAccount) {
    const where: FindOptionsWhere<Report> = {};

    let conDocs: string[] | null = null;
    if (query.withDocuments) {
      conDocs = await this.informesConDocumentos(actor);
      if (conDocs.length === 0) return { items: [], total: 0 };
      where.id = In(conDocs);
    }

    // Scope:
    //  - ROOT ve todo (puede filtrar por churchId si quiere).
    //  - Admin con VIEW_ALL_REPORTS también ve todo.
    //  - Resto sólo ve informes de sus iglesias asignadas.
    const canSeeAll =
      this.permissions.isRoot(actor) ||
      this.permissions.hasGlobalPermission(
        actor,
        GlobalPermission.VIEW_ALL_REPORTS,
      );

    if (canSeeAll) {
      if (query.churchId) where.churchId = query.churchId;
    } else {
      const assigned = await this.permissions.getAssignedChurchIds(actor);
      if (assigned.length === 0) return { items: [], total: 0 };
      // Si pidieron una iglesia específica, debe estar en sus asignadas.
      if (query.churchId) {
        if (!assigned.includes(query.churchId)) {
          return { items: [], total: 0 };
        }
        where.churchId = query.churchId;
      } else {
        // Filtrar por TODAS sus iglesias.
        // Como `where` no soporta IN nativo en este shape, usamos
        // una segunda búsqueda con QueryBuilder más abajo.
        return this.findAllForMultipleChurches(assigned, query, actor, conDocs);
      }
    }

    if (query.reportType) {
      where.reportType = query.reportType;
    }

    if (query.fromDate && query.toDate) {
      where.periodStart = Between(
        new Date(query.fromDate),
        new Date(query.toDate),
      );
    } else if (query.fromDate) {
      where.periodStart = MoreThanOrEqual(new Date(query.fromDate));
    } else if (query.toDate) {
      where.periodStart = LessThanOrEqual(new Date(query.toDate));
    }

    const limit = Math.min(MAX_LIMIT, query.limit ?? MAX_DEFAULT_LIMIT);
    const offset = query.offset ?? 0;

    const [items, total] = await this.reportRepo.findAndCount({
      where,
      relations: ["church"],
      order: { periodStart: "DESC", createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return { items: await this.conDocumentos(items, actor), total };
  }

  /**
   * Helper para listar informes filtrando por múltiples iglesias
   * (cuando un admin tiene varias y no pidió ninguna específica).
   */
  private async findAllForMultipleChurches(
    churchIds: string[],
    query: QueryReportsDto,
    actor: AdminAccount,
    conDocs: string[] | null,
  ) {
    const qb = this.reportRepo
      .createQueryBuilder("report")
      .leftJoinAndSelect("report.church", "church")
      .where("report.churchId IN (:...churchIds)", { churchIds });

    if (conDocs) {
      qb.andWhere("report.id IN (:...conDocs)", { conDocs });
    }

    if (query.reportType) {
      qb.andWhere("report.reportType = :reportType", {
        reportType: query.reportType,
      });
    }

    if (query.fromDate) {
      qb.andWhere("report.periodStart >= :from", {
        from: new Date(query.fromDate),
      });
    }
    if (query.toDate) {
      qb.andWhere("report.periodStart <= :to", {
        to: new Date(query.toDate),
      });
    }

    qb.orderBy("report.periodStart", "DESC").addOrderBy(
      "report.createdAt",
      "DESC",
    );

    const limit = Math.min(MAX_LIMIT, query.limit ?? MAX_DEFAULT_LIMIT);
    const offset = query.offset ?? 0;
    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items: await this.conDocumentos(items, actor), total };
  }

  async findOne(id: string, actor: AdminAccount): Promise<Report> {
    // NO se carga la relación `createdByAdminAccount`: el controlador devuelve
    // esta entidad tal cual y AdminAccount lleva `passwordHash`, `tokenVersion`
    // y los permisos globales del autor. Nadie consume el objeto (la web usa
    // `createdByAdminAccountId` y el snapshot `createdByDisplayName`), así que
    // cargarlo solo servía para filtrar el hash de contraseña de un admin a
    // cualquier otro que pudiera leer el informe.
    const report = await this.reportRepo.findOne({
      where: { id },
      relations: ["church"],
    });
    if (!report) {
      throw new NotFoundException("Informe no encontrado");
    }
    const canRead = await this.canView(actor, report.churchId);
    if (!canRead) {
      throw new ForbiddenException("No tienes permiso para leer este informe.");
    }
    return report;
  }

  async update(
    id: string,
    dto: UpdateReportDto,
    actor: AdminAccount,
  ): Promise<Report> {
    const report = await this.findOne(id, actor);

    // El que edita necesita SUBMIT_REPORTS sobre la iglesia destino.
    await this.assertSubmitScope(actor, report.churchId);

    // Si cambian la iglesia, validar también el scope sobre la nueva.
    if (dto.churchId && dto.churchId !== report.churchId) {
      await this.assertSubmitScope(actor, dto.churchId);
    }

    // Se revalidan los datos si cambian ELLOS o el TIPO. Antes sólo se
    // revalidaban al enviar `data`, así que cambiar el tipo sin reenviarlos
    // dejaba unos datos que no correspondían al tipo nuevo: un informe "otro"
    // convertido en "ofrendas" se quedaba sin total y las métricas lo sumaban
    // como cero en silencio.
    const tipoFinal = dto.reportType ?? report.reportType;
    if (dto.data || (dto.reportType && dto.reportType !== report.reportType)) {
      this.validateData(tipoFinal, dto.data ?? report.data);
    }

    // El período se compara contra lo que quedará guardado, no sólo contra lo
    // que venga en esta edición: enviando un único extremo se podía dejar la
    // fecha final antes de la inicial, algo que el alta sí impide.
    const inicioFinal = dto.periodStart
      ? new Date(dto.periodStart)
      : report.periodStart;
    const finFinal = dto.periodEnd ? new Date(dto.periodEnd) : report.periodEnd;
    if (finFinal < inicioFinal) {
      throw new BadRequestException(
        "periodEnd no puede ser anterior a periodStart",
      );
    }

    Object.assign(report, {
      ...(dto.churchId && { churchId: dto.churchId }),
      ...(dto.reportType && { reportType: dto.reportType }),
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
      ...(dto.periodStart && { periodStart: new Date(dto.periodStart) }),
      ...(dto.periodEnd && { periodEnd: new Date(dto.periodEnd) }),
      ...(dto.data && { data: this.normalizarDatos(dto.data) }),
      lastUpdatedByAdminAccountId: actor.id,
      lastUpdatedByDisplayName: actor.displayName,
    });

    return this.reportRepo.save(report);
  }

  async remove(id: string, actor: AdminAccount) {
    const report = await this.findOne(id, actor);
    await this.assertSubmitScope(actor, report.churchId);
    // Las filas de documentos se van con el informe (CASCADE); los archivos
    // se borran de Cloudinary después, para no dejarlos huérfanos.
    const docs = await this.documentRepo.find({ where: { reportId: id } });
    // Los documentos son privados de quien los subió: otro administrador de
    // la misma iglesia no puede hacerlos desaparecer borrando el informe.
    if (
      !this.permissions.isRoot(actor) &&
      docs.some((d) => d.uploadedByAdminAccountId !== actor.id)
    ) {
      throw new ForbiddenException(
        "Este informe tiene documentos de otra persona. Solo el administrador principal puede eliminarlo.",
      );
    }
    await this.reportRepo.remove(report);
    await Promise.all(
      docs.map((d) => this.cloudinary.deletePrivateDocument(d.publicId)),
    );
    return { deleted: true, id, documentsDeleted: docs.length };
  }

  /* ── Documentos ── */

  /** Un informe entregado solo como documento guarda únicamente esa marca. */
  private normalizarDatos(data: Record<string, unknown>) {
    return (data as { documentOnly?: unknown }).documentOnly === true
      ? { documentOnly: true }
      : data;
  }

  /** Los documentos son privados: solo el principal y quien los subió. */
  private puedeVerDocumento(actor: AdminAccount, doc: ReportDocument) {
    return (
      this.permissions.isRoot(actor) ||
      doc.uploadedByAdminAccountId === actor.id
    );
  }

  private vistaDocumento(doc: ReportDocument): ReportDocumentView {
    return {
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      kind: doc.kind,
      sizeBytes: doc.sizeBytes,
      uploadedByAdminAccountId: doc.uploadedByAdminAccountId,
      uploadedByDisplayName: doc.uploadedByDisplayName,
      createdAt: doc.createdAt,
    };
  }

  /** Documentos que el actor puede ver, agrupados por informe. */
  private async documentosVisibles(reportIds: string[], actor: AdminAccount) {
    const porInforme = new Map<string, ReportDocumentView[]>();
    if (reportIds.length === 0) return porInforme;
    const docs = await this.documentRepo.find({
      where: {
        reportId: In(reportIds),
        ...(this.permissions.isRoot(actor)
          ? {}
          : { uploadedByAdminAccountId: actor.id }),
      },
      order: { createdAt: "ASC" },
    });
    for (const d of docs) {
      const lista = porInforme.get(d.reportId) ?? [];
      lista.push(this.vistaDocumento(d));
      porInforme.set(d.reportId, lista);
    }
    return porInforme;
  }

  private async conDocumentos(items: Report[], actor: AdminAccount) {
    const docs = await this.documentosVisibles(
      items.map((r) => r.id),
      actor,
    );
    return items.map((r) => ({ ...r, documents: docs.get(r.id) ?? [] }));
  }

  /** Informes con algún documento visible para el actor (filtro «con documentos»). */
  private async informesConDocumentos(actor: AdminAccount): Promise<string[]> {
    const qb = this.documentRepo
      .createQueryBuilder("d")
      .select('DISTINCT "d"."reportId"', "reportId");
    if (!this.permissions.isRoot(actor)) {
      qb.where('"d"."uploadedByAdminAccountId" = :actor', { actor: actor.id });
    }
    const filas = await qb.getRawMany<{ reportId: string }>();
    return filas.map((f) => f.reportId);
  }

  async findOneForView(id: string, actor: AdminAccount) {
    const report = await this.findOne(id, actor);
    const [conDocs] = await this.conDocumentos([report], actor);
    return conDocs;
  }

  /** Verifica que el actor puede adjuntar documentos a este informe. */
  async assertPuedeAdjuntar(reportId: string, actor: AdminAccount) {
    const report = await this.findOne(reportId, actor);
    await this.assertSubmitScope(actor, report.churchId);
    return report;
  }

  /**
   * Identificador del archivo en Cloudinary. Lleva el período, el tipo y el
   * nombre original, para que también allá quede claro a qué corresponde.
   */
  private publicIdDocumento(
    report: Report,
    fileName: string,
    extension: string,
  ) {
    const periodo = report.periodStart.toISOString().slice(0, 7);
    const tipo = report.reportType.toLowerCase();
    const sinExtension = fileName.replace(/[.][^.]*$/, "");
    const azar = randomBytes(4).toString("hex");
    return `informes/${report.churchId}/${periodo}_${tipo}_${slug(sinExtension)}_${azar}.${extension}`;
  }

  async addDocuments(
    reportId: string,
    files: ValidatableFile[],
    actor: AdminAccount,
  ) {
    if (files.length === 0) {
      throw new BadRequestException("Adjunta al menos un documento.");
    }
    if (files.length > MAX_REPORT_DOCUMENTS_PER_UPLOAD) {
      throw new BadRequestException(
        `Se pueden subir hasta ${MAX_REPORT_DOCUMENTS_PER_UPLOAD} documentos a la vez.`,
      );
    }
    const report = await this.assertPuedeAdjuntar(reportId, actor);
    const existentes = await this.documentRepo.count({ where: { reportId } });
    if (existentes + files.length > MAX_REPORT_DOCUMENTS_PER_REPORT) {
      throw new BadRequestException(
        `Un informe admite hasta ${MAX_REPORT_DOCUMENTS_PER_REPORT} documentos y este ya tiene ${existentes}.`,
      );
    }

    // Se valida todo antes de subir nada: un archivo malo no deja la mitad arriba.
    const validados = files.map((file) => ({
      file,
      info: validateReportDocument(file),
    }));

    const subidos: string[] = [];
    try {
      const entidades: ReportDocument[] = [];
      for (const { file, info } of validados) {
        const nombre = nombreVisible(file.filename);
        const subido = await this.cloudinary.uploadPrivateDocument(
          file.buffer,
          this.publicIdDocumento(report, nombre, info.extension),
        );
        subidos.push(subido.publicId);
        entidades.push(
          this.documentRepo.create({
            reportId: report.id,
            fileName: nombre,
            mimeType: info.mimeType,
            kind: info.kind,
            sizeBytes: file.buffer.byteLength,
            publicId: subido.publicId,
            uploadedByAdminAccountId: actor.id,
            uploadedByDisplayName: actor.displayName,
          }),
        );
      }
      const guardados = await this.documentRepo.save(entidades);
      return {
        report,
        documents: guardados.map((d) => this.vistaDocumento(d)),
      };
    } catch (err) {
      // Si algo falla a mitad de camino, no quedan archivos huérfanos.
      await Promise.all(
        subidos.map((id) => this.cloudinary.deletePrivateDocument(id)),
      );
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        "No se pudieron guardar los documentos. Intenta de nuevo.",
      );
    }
  }

  private async documentoVisible(
    reportId: string,
    documentId: string,
    actor: AdminAccount,
  ) {
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, reportId },
    });
    // Mismo error si no existe o si no le corresponde: no se confirma que exista.
    if (!doc || !this.puedeVerDocumento(actor, doc)) {
      throw new NotFoundException("Documento no encontrado");
    }
    return doc;
  }

  /** Enlace para abrir el documento. Vence a los cinco minutos. */
  async documentDownloadUrl(
    reportId: string,
    documentId: string,
    actor: AdminAccount,
  ) {
    const doc = await this.documentoVisible(reportId, documentId, actor);
    const { url, expiresAt } = this.cloudinary.privateDownloadUrl(
      doc.publicId,
      300,
    );
    return {
      url,
      expiresAt,
      fileName: doc.fileName,
      document: this.vistaDocumento(doc),
    };
  }

  async removeDocument(
    reportId: string,
    documentId: string,
    actor: AdminAccount,
  ) {
    const doc = await this.documentoVisible(reportId, documentId, actor);
    const publicId = doc.publicId;
    const fileName = doc.fileName;
    await this.documentRepo.remove(doc);
    await this.cloudinary.deletePrivateDocument(publicId);
    return { deleted: true, id: documentId, fileName };
  }

  /* ────────── Métricas / Agregados ────────── */

  /**
   * Devuelve agregados de ofrendas/egresos/asistencia agrupados por
   * mes para un rango dado. Filtra por scope del actor.
   */
  async metricsTimeline(
    actor: AdminAccount,
    options: {
      churchId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    // Determinar churchIds permitidos.
    let allowedChurches: string[] | null = null; // null = todos
    if (
      !this.permissions.isRoot(actor) &&
      !this.permissions.hasGlobalPermission(
        actor,
        GlobalPermission.VIEW_ALL_REPORTS,
      )
    ) {
      const assigned = await this.permissions.getAssignedChurchIds(actor);
      if (assigned.length === 0) {
        return { offerings: [], expenses: [], attendance: [], byChurch: [] };
      }
      allowedChurches = assigned;
    }

    if (options.churchId) {
      if (allowedChurches && !allowedChurches.includes(options.churchId)) {
        return { offerings: [], expenses: [], attendance: [], byChurch: [] };
      }
      allowedChurches = [options.churchId];
    }

    const qb = this.reportRepo.createQueryBuilder("r");
    if (allowedChurches) {
      qb.andWhere("r.churchId IN (:...churchIds)", {
        churchIds: allowedChurches,
      });
    }
    if (options.fromDate) {
      qb.andWhere("r.periodStart >= :from", {
        from: new Date(options.fromDate),
      });
    }
    if (options.toDate) {
      qb.andWhere("r.periodStart <= :to", { to: new Date(options.toDate) });
    }

    const all = await qb.getMany();

    /** Agrupa por mes (YYYY-MM) y suma `picker` sobre data. */
    const groupByMonth = (
      items: Report[],
      picker: (r: Report) => number | null,
    ) => {
      const map = new Map<string, number>();
      for (const r of items) {
        const value = picker(r);
        if (value === null || !Number.isFinite(value)) continue;
        const ym = r.periodStart.toISOString().slice(0, 7);
        map.set(ym, (map.get(ym) ?? 0) + value);
      }
      return Array.from(map.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));
    };

    const offerings = groupByMonth(
      all.filter((r) => r.reportType === ReportType.OFFERINGS),
      (r) => {
        const v = (r.data as { totalCop?: unknown }).totalCop;
        if (v === undefined || v === null) return null;
        return typeof v === "number" ? v : Number(v) || 0;
      },
    );

    const expenses = groupByMonth(
      all.filter((r) => r.reportType === ReportType.EXPENSES),
      (r) => {
        const v = (r.data as { totalCop?: unknown }).totalCop;
        if (v === undefined || v === null) return null;
        return typeof v === "number" ? v : Number(v) || 0;
      },
    );

    const attendance = groupByMonth(
      all.filter((r) => r.reportType === ReportType.ATTENDANCE),
      (r) => {
        const v = (r.data as { count?: unknown }).count;
        if (v === undefined || v === null) return null;
        return typeof v === "number" ? v : Number(v) || 0;
      },
    );

    // Agregados por iglesia
    const churchMap = new Map<
      string,
      {
        churchId: string;
        offerings: number;
        expenses: number;
        attendance: number;
      }
    >();
    for (const r of all) {
      const e = churchMap.get(r.churchId) ?? {
        churchId: r.churchId,
        offerings: 0,
        expenses: 0,
        attendance: 0,
      };
      const v =
        Number(
          (r.data as { totalCop?: unknown; count?: unknown }).totalCop ?? 0,
        ) || 0;
      const c = Number((r.data as { count?: unknown }).count ?? 0) || 0;
      if (r.reportType === ReportType.OFFERINGS) e.offerings += v;
      if (r.reportType === ReportType.EXPENSES) e.expenses += v;
      if (r.reportType === ReportType.ATTENDANCE) e.attendance += c;
      churchMap.set(r.churchId, e);
    }

    return {
      offerings,
      expenses,
      attendance,
      byChurch: Array.from(churchMap.values()),
    };
  }
}
