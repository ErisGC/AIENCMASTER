import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, In, LessThan, MoreThan, Repository } from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import {
  ChurchPermission,
  GlobalPermission,
} from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { ChurchDirector } from "../churches/church-director.entity";
import { Church } from "../churches/church.entity";
import { CheckEventDto } from "./dto/check-event.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { QueryEventsDto } from "./dto/query-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventConflictKind, EventScope, EventType } from "./enums/event.enums";
import { Event } from "./event.entity";
import {
  describirRepeticion,
  EventoLite,
  generarFechas,
  PROXIMIDAD_MS,
  relacionEntre,
} from "./events.conflicts";

const VENTANA_POR_DEFECTO_DIAS = 60;
const VENTANA_MAXIMA_DIAS = 366;
const DURACION_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;
/** Un año semanal son 53 fechas; se deja un margen. */
const MAX_REPETICIONES = 60;
const REPETICION_MAXIMA_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_DIRECTORES = 10;
/** Cuántos cruces se copian a la auditoría; el resto queda en el aviso. */
const MAX_CRUCES_EN_AUDITORIA = 10;
/** Alcance de la bandeja de avisos. */
const AVISOS_DIAS = 90;

export interface EventConflict {
  eventId: string;
  title: string;
  type: EventType;
  scope: EventScope;
  churchId: string | null;
  churchName: string | null;
  startsAt: string;
  endsAt: string;
  kind: EventConflictKind;
}

/** Cruces de una fecha concreta (importa en las repeticiones semanales). */
export interface ConflictsForDate {
  startsAt: string;
  endsAt: string;
  conflicts: EventConflict[];
}

type Actor = Pick<AdminAccount, "id" | "role" | "globalPermissions">;

/** Qué puede gestionar un actor, resuelto una sola vez por petición. */
interface Alcance {
  globales: boolean;
  /** null = todas las iglesias (principal). */
  iglesias: string[] | null;
}

/** Colombia no cambia de hora: basta un desplazamiento fijo. */
const DESPLAZAMIENTO_COLOMBIA_MS = -5 * 60 * 60 * 1000;

/** Medianoche de hoy en Colombia, expresada en UTC. */
function inicioDeHoyEnColombia(): Date {
  const local = new Date(Date.now() + DESPLAZAMIENTO_COLOMBIA_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - DESPLAZAMIENTO_COLOMBIA_MS);
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly repo: Repository<Event>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(ChurchDirector)
    private readonly directorRepo: Repository<ChurchDirector>,
    private readonly permissions: PermissionsService,
    private readonly dataSource: DataSource,
  ) {}

  /* ── Proyecciones ── */

  private toPublic(e: Event) {
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      type: e.type,
      scope: e.scope,
      churchId: e.churchId,
      churchName: e.church?.name ?? null,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      location: e.location,
      directors: (e.directors ?? []).map((d) => ({
        id: d.id,
        churchId: d.churchId,
        displayName: d.displayName,
        role: d.role,
        photoUrl: d.linkedAdminAccount?.profilePhotoUrl ?? d.photoUrl ?? null,
      })),
    };
  }

  private async alcanceDe(actor: Actor): Promise<Alcance> {
    return {
      globales: this.permissions.hasGlobalPermission(
        actor,
        GlobalPermission.MANAGE_GLOBAL_EVENTS,
      ),
      iglesias: await this.permissions.churchIdsWithPermission(
        actor,
        ChurchPermission.MANAGE_EVENTS,
      ),
    };
  }

  private gestionableCon(
    alcance: Alcance,
    e: Pick<Event, "scope" | "churchId">,
  ) {
    if (e.scope === EventScope.GLOBAL) return alcance.globales;
    if (!e.churchId) return false;
    return alcance.iglesias === null || alcance.iglesias.includes(e.churchId);
  }

  private toAdmin(e: Event, alcance: Alcance) {
    return {
      ...this.toPublic(e),
      seriesId: e.seriesId,
      seriesRule: e.seriesRule,
      /** "todos los jueves", "el primer sábado de cada mes"… o null. */
      seriesLabel:
        e.seriesRule === "WEEKLY" || e.seriesRule === "MONTHLY_BY_WEEKDAY"
          ? describirRepeticion(e.seriesRule, e.startsAt)
          : null,
      createdByAdminAccountId: e.createdByAdminAccountId,
      createdByDisplayName: e.createdByDisplayName,
      lastUpdatedByAdminAccountId: e.lastUpdatedByAdminAccountId,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      /** Si quien consulta puede editarlo o eliminarlo. */
      editable: this.gestionableCon(alcance, e),
    };
  }

  /* ── Autorización ── */

  private async assertPuedeGestionar(
    actor: Actor,
    scope: EventScope,
    churchId: string | null,
  ) {
    if (scope === EventScope.GLOBAL) {
      if (
        !this.permissions.hasGlobalPermission(
          actor,
          GlobalPermission.MANAGE_GLOBAL_EVENTS,
        )
      ) {
        throw new ForbiddenException(
          "Programar eventos globales requiere el permiso correspondiente.",
        );
      }
      return;
    }
    if (!churchId) {
      throw new BadRequestException(
        "Un evento local debe pertenecer a una iglesia.",
      );
    }
    await this.permissions.assertChurchPermission(
      actor,
      churchId,
      ChurchPermission.MANAGE_EVENTS,
    );
  }

  /** Iglesias sobre las que el actor puede ver eventos (vacío = todas). */
  private async iglesiasVisibles(actor: Actor): Promise<string[] | null> {
    if (this.permissions.isRoot(actor)) return null;
    if (
      this.permissions.hasGlobalPermission(
        actor,
        GlobalPermission.MANAGE_GLOBAL_EVENTS,
      )
    ) {
      return null;
    }
    return this.permissions.getAssignedChurchIds(actor);
  }

  /* ── Validaciones ── */

  private parsearRango(startsAt: string, endsAt: string) {
    const inicio = new Date(startsAt);
    const fin = new Date(endsAt);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException("Fechas inválidas.");
    }
    if (fin.getTime() <= inicio.getTime()) {
      throw new BadRequestException(
        "La hora de fin debe ser posterior a la de inicio.",
      );
    }
    if (fin.getTime() - inicio.getTime() > DURACION_MAXIMA_MS) {
      throw new BadRequestException(
        "Un evento no puede durar más de siete días.",
      );
    }
    return { inicio, fin };
  }

  private async validarIglesia(
    scope: EventScope,
    churchId: string | null | undefined,
  ): Promise<string | null> {
    if (scope === EventScope.LOCAL && !churchId) {
      throw new BadRequestException(
        "Un evento local debe pertenecer a una iglesia.",
      );
    }
    if (!churchId) return null;
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Iglesia no encontrada");
    return church.id;
  }

  /**
   * Los encargados deben existir y, en un evento local, pertenecer a la
   * iglesia del evento. En uno global pueden ser de varias iglesias.
   */
  private async validarDirectores(
    ids: string[] | undefined,
    scope: EventScope,
    churchId: string | null,
  ): Promise<ChurchDirector[]> {
    const unicos = Array.from(new Set(ids ?? []));
    if (unicos.length === 0) return [];
    if (unicos.length > MAX_DIRECTORES) {
      throw new BadRequestException(
        `Un evento admite hasta ${MAX_DIRECTORES} encargados.`,
      );
    }
    const encontrados = await this.directorRepo.find({
      where: { id: In(unicos) },
    });
    if (encontrados.length !== unicos.length) {
      throw new NotFoundException("Alguno de los encargados no existe.");
    }
    if (scope === EventScope.LOCAL) {
      const ajeno = encontrados.find((d) => d.churchId !== churchId);
      if (ajeno) {
        throw new BadRequestException(
          `${ajeno.displayName} no pertenece a la iglesia del evento.`,
        );
      }
    }
    return encontrados;
  }

  /** Fechas que genera una regla de repetición (o sólo la original). */
  private fechasDe(
    inicio: Date,
    repeat: {
      frequency: "WEEKLY" | "MONTHLY_BY_WEEKDAY";
      until: string;
    } | null,
  ): Date[] {
    if (!repeat) return [inicio];
    const hasta = new Date(repeat.until);
    if (Number.isNaN(hasta.getTime())) {
      throw new BadRequestException(
        "La fecha límite de repetición es inválida.",
      );
    }
    if (hasta.getTime() < inicio.getTime()) {
      throw new BadRequestException(
        "La fecha límite de repetición es anterior a la primera fecha.",
      );
    }
    if (hasta.getTime() - inicio.getTime() > REPETICION_MAXIMA_MS) {
      throw new BadRequestException(
        "La repetición puede abarcar como mucho un año.",
      );
    }
    return generarFechas(inicio, repeat.frequency, hasta, MAX_REPETICIONES);
  }

  /* ── Cruces ── */

  /**
   * Eventos que compiten con el candidato. Consulta sólo la ventana de tiempo
   * que puede cruzarse (con la holgura de proximidad) y aplica las reglas.
   */
  async detectarCruces(candidato: EventoLite): Promise<EventConflict[]> {
    const desde = new Date(candidato.startsAt.getTime() - PROXIMIDAD_MS);
    const hasta = new Date(candidato.endsAt.getTime() + PROXIMIDAD_MS);

    const vecinos = await this.repo.find({
      where: { startsAt: LessThan(hasta), endsAt: MoreThan(desde) },
      relations: { church: true },
      order: { startsAt: "ASC" },
    });

    const cruces: EventConflict[] = [];
    for (const otro of vecinos) {
      if (candidato.id && otro.id === candidato.id) continue;
      const kind = relacionEntre(candidato, {
        id: otro.id,
        scope: otro.scope,
        churchId: otro.churchId,
        startsAt: otro.startsAt,
        endsAt: otro.endsAt,
      });
      if (!kind) continue;
      cruces.push({
        eventId: otro.id,
        title: otro.title,
        type: otro.type,
        scope: otro.scope,
        churchId: otro.churchId,
        churchName: otro.church?.name ?? null,
        startsAt: otro.startsAt.toISOString(),
        endsAt: otro.endsAt.toISOString(),
        kind,
      });
    }
    return cruces;
  }

  /** Comprobación sin guardar, para los formularios. */
  async comprobar(dto: CheckEventDto): Promise<ConflictsForDate[]> {
    const { inicio, fin } = this.parsearRango(dto.startsAt, dto.endsAt);
    const churchId = dto.churchId ?? null;
    const duracion = fin.getTime() - inicio.getTime();

    const fechas = this.fechasDe(inicio, dto.repeat ?? null);

    const salida: ConflictsForDate[] = [];
    for (const f of fechas) {
      const finF = new Date(f.getTime() + duracion);
      const conflicts = await this.detectarCruces({
        id: dto.excludeId ?? null,
        scope: dto.scope,
        churchId,
        startsAt: f,
        endsAt: finF,
      });
      if (conflicts.length) {
        salida.push({
          startsAt: f.toISOString(),
          endsAt: finF.toISOString(),
          conflicts,
        });
      }
    }
    return salida;
  }

  /**
   * Bandeja de avisos: eventos próximos que hoy tienen cruces. Es el
   * recordatorio para los encargados hasta que existan notificaciones al
   * teléfono; la app y el panel muestran el conteo como insignia.
   */
  async avisos(actor: Actor) {
    const ahora = new Date();
    const limite = new Date(
      ahora.getTime() + AVISOS_DIAS * 24 * 60 * 60 * 1000,
    );

    const proximos = await this.repo.find({
      where: { endsAt: MoreThan(ahora), startsAt: LessThan(limite) },
      relations: { church: true },
      order: { startsAt: "ASC" },
    });

    const visibles = await this.iglesiasVisibles(actor);
    const esMia = (e: Event) =>
      visibles === null ||
      (e.churchId !== null && visibles.includes(e.churchId));

    const items: Array<{
      event: ReturnType<EventsService["toPublic"]>;
      conflicts: EventConflict[];
    }> = [];
    for (const e of proximos) {
      const conflicts: EventConflict[] = [];
      for (const otro of proximos) {
        const kind = relacionEntre(
          {
            id: e.id,
            scope: e.scope,
            churchId: e.churchId,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
          },
          {
            id: otro.id,
            scope: otro.scope,
            churchId: otro.churchId,
            startsAt: otro.startsAt,
            endsAt: otro.endsAt,
          },
        );
        if (!kind) continue;
        conflicts.push({
          eventId: otro.id,
          title: otro.title,
          type: otro.type,
          scope: otro.scope,
          churchId: otro.churchId,
          churchName: otro.church?.name ?? null,
          startsAt: otro.startsAt.toISOString(),
          endsAt: otro.endsAt.toISOString(),
          kind,
        });
      }
      if (conflicts.length === 0) continue;

      // A un admin local le interesan sus eventos y los globales que chocan
      // con alguno suyo; al principal (o quien gestione globales), todo.
      const relevante =
        esMia(e) ||
        conflicts.some(
          (c) =>
            c.churchId !== null && (visibles?.includes(c.churchId) ?? true),
        );
      if (!relevante) continue;

      items.push({ event: this.toPublic(e), conflicts });
    }

    return { count: items.length, items };
  }

  /* ── Lectura ── */

  private ventana(q: QueryEventsDto) {
    const desde = q.from ? new Date(q.from) : inicioDeHoyEnColombia();
    const hasta = q.to
      ? new Date(q.to)
      : new Date(
          desde.getTime() + VENTANA_POR_DEFECTO_DIAS * 24 * 60 * 60 * 1000,
        );
    if (q.to) hasta.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      throw new BadRequestException("Fechas inválidas.");
    }
    if (hasta.getTime() < desde.getTime()) {
      throw new BadRequestException("La fecha final es anterior a la inicial.");
    }
    if (
      hasta.getTime() - desde.getTime() >
      VENTANA_MAXIMA_DIAS * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        "La ventana consultada es demasiado amplia.",
      );
    }
    return { desde, hasta };
  }

  private consultaBase(q: QueryEventsDto) {
    const { desde, hasta } = this.ventana(q);
    const qb = this.repo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.church", "church")
      .leftJoinAndSelect("e.directors", "director")
      .leftJoinAndSelect("director.linkedAdminAccount", "linkedAdmin")
      .where("e.endsAt >= :desde", { desde })
      .andWhere("e.startsAt <= :hasta", { hasta })
      .orderBy("e.startsAt", "ASC");
    if (q.scope) qb.andWhere("e.scope = :scope", { scope: q.scope });
    return qb;
  }

  /** Cronograma público: eventos de iglesias activas y los de la Asociación. */
  async listarPublico(q: QueryEventsDto) {
    const qb = this.consultaBase(q).andWhere(
      "(e.churchId IS NULL OR church.isActive = true)",
    );
    if (q.churchId) {
      // Lo que ve una iglesia: sus eventos locales y todos los globales.
      qb.andWhere("(e.churchId = :churchId OR e.scope = :global)", {
        churchId: q.churchId,
        global: EventScope.GLOBAL,
      });
    }
    const rows = await qb.getMany();
    return rows.map((e) => this.toPublic(e));
  }

  async listarPublicoDeIglesia(churchId: string, q: QueryEventsDto) {
    const church = await this.churchRepo.findOne({
      where: { id: churchId, isActive: true },
    });
    if (!church) throw new NotFoundException("Iglesia no encontrada");
    return this.listarPublico({ ...q, churchId });
  }

  async listarAdmin(actor: Actor, q: QueryEventsDto) {
    const qb = this.consultaBase(q);
    const visibles = await this.iglesiasVisibles(actor);
    if (visibles !== null) {
      // Un admin local ve los de sus iglesias y todos los globales (los
      // globales le afectan aunque no pueda editarlos).
      if (visibles.length === 0) {
        qb.andWhere("e.scope = :global", { global: EventScope.GLOBAL });
      } else {
        qb.andWhere("(e.churchId IN (:...ids) OR e.scope = :global)", {
          ids: visibles,
          global: EventScope.GLOBAL,
        });
      }
    }
    if (q.churchId) {
      qb.andWhere("(e.churchId = :churchId OR e.scope = :global2)", {
        churchId: q.churchId,
        global2: EventScope.GLOBAL,
      });
    }
    const rows = await qb.getMany();
    const alcance = await this.alcanceDe(actor);
    return rows.map((e) => this.toAdmin(e, alcance));
  }

  private async cargar(id: string): Promise<Event> {
    const e = await this.repo.findOne({
      where: { id },
      relations: {
        church: true,
        directors: { linkedAdminAccount: true },
      },
    });
    if (!e) throw new NotFoundException("Evento no encontrado");
    return e;
  }

  async obtenerAdmin(actor: Actor, id: string) {
    const e = await this.cargar(id);
    const visibles = await this.iglesiasVisibles(actor);
    if (
      visibles !== null &&
      e.scope !== EventScope.GLOBAL &&
      (e.churchId === null || !visibles.includes(e.churchId))
    ) {
      throw new ForbiddenException("No tienes acceso a este evento.");
    }
    return this.toAdmin(e, await this.alcanceDe(actor));
  }

  /* ── Escritura ── */

  /**
   * Crea el evento (o la serie semanal). Si hay cruces y no se reconocieron,
   * responde 409 con el detalle para que la persona decida.
   */
  async crear(
    actor: Pick<
      AdminAccount,
      "id" | "role" | "globalPermissions" | "displayName"
    >,
    dto: CreateEventDto,
  ) {
    const churchId = await this.validarIglesia(dto.scope, dto.churchId);
    await this.assertPuedeGestionar(actor, dto.scope, churchId);
    const { inicio, fin } = this.parsearRango(dto.startsAt, dto.endsAt);
    const directores = await this.validarDirectores(
      dto.directorIds,
      dto.scope,
      churchId,
    );
    const duracion = fin.getTime() - inicio.getTime();

    const fechas = this.fechasDe(inicio, dto.repeat ?? null);

    const crucesPorFecha: ConflictsForDate[] = [];
    for (const f of fechas) {
      const finF = new Date(f.getTime() + duracion);
      const conflicts = await this.detectarCruces({
        id: null,
        scope: dto.scope,
        churchId,
        startsAt: f,
        endsAt: finF,
      });
      if (conflicts.length) {
        crucesPorFecha.push({
          startsAt: f.toISOString(),
          endsAt: finF.toISOString(),
          conflicts,
        });
      }
    }

    if (crucesPorFecha.length > 0 && !dto.acknowledgeConflicts) {
      throw new ConflictException({
        message: "El evento se cruza con otros ya programados.",
        conflicts: crucesPorFecha,
      });
    }

    const seriesId = fechas.length > 1 ? randomUUID() : null;
    const seriesRule =
      fechas.length > 1 ? (dto.repeat?.frequency ?? null) : null;

    const creados = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Event);
      const filas = fechas.map((f) =>
        repo.create({
          churchId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          type: dto.type,
          scope: dto.scope,
          startsAt: f,
          endsAt: new Date(f.getTime() + duracion),
          location: dto.location?.trim() || null,
          seriesId,
          seriesRule,
          directors: directores,
          createdByAdminAccountId: actor.id,
          createdByDisplayName: actor.displayName,
          lastUpdatedByAdminAccountId: null,
        }),
      );
      return repo.save(filas);
    });

    const recargados = await Promise.all(creados.map((c) => this.cargar(c.id)));
    const alcance = await this.alcanceDe(actor);
    return {
      events: recargados.map((e) => this.toAdmin(e, alcance)),
      seriesId,
      conflicts: crucesPorFecha,
    };
  }

  async actualizar(actor: Actor, id: string, dto: UpdateEventDto) {
    const e = await this.cargar(id);
    // Hay que poder gestionar el evento tal como está Y tal como quedará.
    await this.assertPuedeGestionar(actor, e.scope, e.churchId);

    const scope = dto.scope ?? e.scope;
    const churchId =
      dto.churchId !== undefined
        ? await this.validarIglesia(scope, dto.churchId)
        : await this.validarIglesia(scope, e.churchId);
    if (scope !== e.scope || churchId !== e.churchId) {
      await this.assertPuedeGestionar(actor, scope, churchId);
    }

    const { inicio, fin } = this.parsearRango(
      dto.startsAt ?? e.startsAt.toISOString(),
      dto.endsAt ?? e.endsAt.toISOString(),
    );

    const directores =
      dto.directorIds !== undefined
        ? await this.validarDirectores(dto.directorIds, scope, churchId)
        : scope === EventScope.LOCAL
          ? // Si cambió la iglesia, los encargados ajenos ya no aplican.
            (e.directors ?? []).filter((d) => d.churchId === churchId)
          : (e.directors ?? []);

    const cambiaTiempo =
      inicio.getTime() !== e.startsAt.getTime() ||
      fin.getTime() !== e.endsAt.getTime() ||
      scope !== e.scope ||
      churchId !== e.churchId;

    let conflicts: EventConflict[] = [];
    if (cambiaTiempo) {
      conflicts = await this.detectarCruces({
        id: e.id,
        scope,
        churchId,
        startsAt: inicio,
        endsAt: fin,
      });
      if (conflicts.length > 0 && !dto.acknowledgeConflicts) {
        throw new ConflictException({
          message: "El evento se cruza con otros ya programados.",
          conflicts: [
            {
              startsAt: inicio.toISOString(),
              endsAt: fin.toISOString(),
              conflicts,
            },
          ],
        });
      }
    }

    Object.assign(e, {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description?.trim() || null,
      }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.location !== undefined && {
        location: dto.location?.trim() || null,
      }),
      scope,
      churchId,
      startsAt: inicio,
      endsAt: fin,
      directors: directores,
      lastUpdatedByAdminAccountId: actor.id,
    });
    await this.repo.save(e);

    return {
      event: this.toAdmin(await this.cargar(e.id), await this.alcanceDe(actor)),
      conflicts,
    };
  }

  /** Elimina un evento, o toda su serie semanal si `series` es verdadero. */
  async eliminar(actor: Actor, id: string, series: boolean) {
    const e = await this.cargar(id);
    await this.assertPuedeGestionar(actor, e.scope, e.churchId);

    if (series && e.seriesId) {
      const hermanos = await this.repo.find({
        where: { seriesId: e.seriesId },
      });
      await this.repo.remove(hermanos);
      return {
        deleted: true,
        id,
        seriesId: e.seriesId,
        count: hermanos.length,
      };
    }
    await this.repo.remove(e);
    return { deleted: true, id, seriesId: null, count: 1 };
  }

  /** Recorte de cruces para la auditoría, que no debe crecer sin límite. */
  static resumenParaAuditoria(cruces: ConflictsForDate[]) {
    const planos = cruces.flatMap((f) =>
      f.conflicts.map((c) => ({
        fecha: f.startsAt,
        con: c.eventId,
        titulo: c.title,
        tipo: c.kind,
      })),
    );
    return {
      total: planos.length,
      primeros: planos.slice(0, MAX_CRUCES_EN_AUDITORIA),
    };
  }
}
