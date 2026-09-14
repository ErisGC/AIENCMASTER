import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CheckEventDto } from "./dto/check-event.dto";
import { CreateEventDto } from "./dto/create-event.dto";
import { QueryEventsDto } from "./dto/query-events.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventsService } from "./events.service";

function userAgentDe(req: AdminRequest): string {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : "";
}

/* ── Público ─────────────────────────────────────────────────────────────── */

@Controller("events")
export class PublicEventsController {
  constructor(private readonly service: EventsService) {}

  /** Cronograma general: por defecto, los próximos 60 días. */
  @Get()
  list(@Query() query: QueryEventsDto) {
    return this.service.listarPublico(query);
  }
}

@Controller("churches/:churchId/events")
export class PublicChurchEventsController {
  constructor(private readonly service: EventsService) {}

  /** Lo que ve una iglesia: sus eventos locales y todos los globales. */
  @Get()
  list(
    @Param("churchId", new ParseUUIDPipe({ version: "4" })) churchId: string,
    @Query() query: QueryEventsDto,
  ) {
    return this.service.listarPublicoDeIglesia(churchId, query);
  }
}

/* ── Administración ──────────────────────────────────────────────────────── */

@Controller("admin/events")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminEventsController {
  constructor(
    private readonly service: EventsService,
    private readonly auditService: AdminAuditService,
  ) {}

  // Las rutas fijas van ANTES que `:id`, o `alerts` y `check` caerían en el
  // parámetro y fallarían por no ser un UUID.

  @Get("alerts")
  alerts(@AdminAuth() actor: AuthenticatedAdminContext) {
    return this.service.avisos(actor.account);
  }

  @Post("check")
  check(@Body() dto: CheckEventDto) {
    return this.service.comprobar(dto);
  }

  @Get()
  list(
    @Query() query: QueryEventsDto,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.listarAdmin(actor.account, query);
  }

  @Get(":id")
  findOne(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.obtenerAdmin(actor.account, id);
  }

  @Post()
  async create(
    @Body() dto: CreateEventDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const out = await this.service.crear(actor.account, dto);
    const primero = out.events[0];
    const esSerie = out.events.length > 1;

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: esSerie ? "EVENT_SERIES_CREATED" : "EVENT_CREATED",
      targetType: "EVENT",
      targetId: esSerie ? (out.seriesId ?? primero.id) : primero.id,
      description: esSerie
        ? `Serie de ${out.events.length} eventos creada: ${primero.title}`
        : `Evento creado: ${primero.title}`,
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
      metadata: {
        churchId: primero.churchId,
        scope: primero.scope,
        type: primero.type,
        startsAt: primero.startsAt,
        endsAt: primero.endsAt,
        count: out.events.length,
        // Si se guardó con cruces reconocidos, queda constancia de cuáles.
        cruces: EventsService.resumenParaAuditoria(out.conflicts),
      },
    });

    return out;
  }

  @Patch(":id")
  async update(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const out = await this.service.actualizar(actor.account, id, dto);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "EVENT_UPDATED",
      targetType: "EVENT",
      targetId: out.event.id,
      description: `Evento actualizado: ${out.event.title}`,
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
      metadata: {
        churchId: out.event.churchId,
        scope: out.event.scope,
        type: out.event.type,
        startsAt: out.event.startsAt,
        endsAt: out.event.endsAt,
        cruces: EventsService.resumenParaAuditoria(
          out.conflicts.length
            ? [
                {
                  startsAt: out.event.startsAt,
                  endsAt: out.event.endsAt,
                  conflicts: out.conflicts,
                },
              ]
            : [],
        ),
      },
    });

    return out;
  }

  @Delete(":id")
  async remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("series") series: string | undefined,
    @Req() req: AdminRequest,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    const todaLaSerie = series === "true" || series === "1";
    const antes = await this.service.obtenerAdmin(actor.account, id);
    const out = await this.service.eliminar(actor.account, id, todaLaSerie);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: out.count > 1 ? "EVENT_SERIES_DELETED" : "EVENT_DELETED",
      targetType: "EVENT",
      targetId: out.seriesId ?? id,
      description:
        out.count > 1
          ? `Serie de ${out.count} eventos eliminada: ${antes.title}`
          : `Evento eliminado: ${antes.title}`,
      ip: req.ip ?? null,
      userAgent: userAgentDe(req),
      metadata: {
        churchId: antes.churchId,
        scope: antes.scope,
        type: antes.type,
        startsAt: antes.startsAt,
        count: out.count,
      },
    });

    return out;
  }
}
