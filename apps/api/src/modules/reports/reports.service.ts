import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import {
  ChurchPermission,
  GlobalPermission,
} from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { Church } from "../churches/church.entity";
import { CreateReportDto } from "./dto/create-report.dto";
import { QueryReportsDto } from "./dto/query-reports.dto";
import { UpdateReportDto } from "./dto/update-report.dto";
import { ReportType } from "./enums/report-type.enum";
import { Report } from "./report.entity";

const MAX_DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    private readonly permissions: PermissionsService,
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
      data: dto.data,
      createdByAdminAccountId: actor.id,
      createdByDisplayName: actor.displayName,
      lastUpdatedByAdminAccountId: null,
      lastUpdatedByDisplayName: null,
    });

    return this.reportRepo.save(entity);
  }

  async findAll(query: QueryReportsDto, actor: AdminAccount) {
    const where: FindOptionsWhere<Report> = {};

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
        return this.findAllForMultipleChurches(assigned, query);
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

    return { items, total };
  }

  /**
   * Helper para listar informes filtrando por múltiples iglesias
   * (cuando un admin tiene varias y no pidió ninguna específica).
   */
  private async findAllForMultipleChurches(
    churchIds: string[],
    query: QueryReportsDto,
  ) {
    const qb = this.reportRepo
      .createQueryBuilder("report")
      .leftJoinAndSelect("report.church", "church")
      .where("report.churchId IN (:...churchIds)", { churchIds });

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
    return { items, total };
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

    if (dto.data && (dto.reportType ?? report.reportType)) {
      this.validateData(dto.reportType ?? report.reportType, dto.data);
    }

    if (dto.periodStart && dto.periodEnd) {
      if (new Date(dto.periodEnd) < new Date(dto.periodStart)) {
        throw new BadRequestException(
          "periodEnd no puede ser anterior a periodStart",
        );
      }
    }

    Object.assign(report, {
      ...(dto.churchId && { churchId: dto.churchId }),
      ...(dto.reportType && { reportType: dto.reportType }),
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
      ...(dto.periodStart && { periodStart: new Date(dto.periodStart) }),
      ...(dto.periodEnd && { periodEnd: new Date(dto.periodEnd) }),
      ...(dto.data && { data: dto.data }),
      lastUpdatedByAdminAccountId: actor.id,
      lastUpdatedByDisplayName: actor.displayName,
    });

    return this.reportRepo.save(report);
  }

  async remove(id: string, actor: AdminAccount) {
    const report = await this.findOne(id, actor);
    await this.assertSubmitScope(actor, report.churchId);
    await this.reportRepo.remove(report);
    return { deleted: true, id };
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
        return typeof v === "number" ? v : Number(v) || 0;
      },
    );

    const expenses = groupByMonth(
      all.filter((r) => r.reportType === ReportType.EXPENSES),
      (r) => {
        const v = (r.data as { totalCop?: unknown }).totalCop;
        return typeof v === "number" ? v : Number(v) || 0;
      },
    );

    const attendance = groupByMonth(
      all.filter((r) => r.reportType === ReportType.ATTENDANCE),
      (r) => {
        const v = (r.data as { count?: unknown }).count;
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
