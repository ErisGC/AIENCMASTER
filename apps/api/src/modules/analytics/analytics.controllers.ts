import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AdminRateLimitService } from "../admin-security/admin-rate-limit.service";
import type { AdminRequest } from "../admin-security/admin-security.types";
import { AdminAuthGuard } from "../admin-security/guards/admin-auth.guard";
import { AdminOriginGuard } from "../admin-security/guards/admin-origin.guard";
import { RootDeviceGuard } from "../admin-security/guards/root-device.guard";
import { RootRoleGuard } from "../admin-security/guards/root-role.guard";
import { AnalyticsService } from "./analytics.service";

/**
 * Lo que manda el portal público al abrir una página o descargar algo. Viene
 * como texto ({k, t, v}) para que el navegador lo envíe sin pedir permiso
 * previo y sin frenar la navegación. Siempre responde 204: si algo no se
 * cuenta, nadie se entera.
 */
@Controller("analytics")
export class PublicAnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly rateLimit: AdminRateLimitService,
  ) {}

  @Post("hit")
  @HttpCode(204)
  async hit(@Body() body: unknown, @Req() req: AdminRequest): Promise<void> {
    try {
      this.rateLimit.consume({
        scope: "analytics-hit",
        windowSeconds: 60,
        blockSeconds: 120,
        message: "Demasiadas visitas seguidas.",
        dimensions: [{ label: "ip", value: req.ip, maxAttempts: 120 }],
      });
      const ua = req.headers["user-agent"];
      await this.service.registrar(
        body,
        typeof ua === "string" ? ua : undefined,
        req.ip ?? null,
      );
    } catch {
      // Un conteo perdido no debe molestar a quien navega.
    }
  }
}

/** Estadísticas de uso: solo la cuenta principal, desde un dispositivo principal. */
@Controller("admin/stats")
@UseGuards(AdminOriginGuard, AdminAuthGuard, RootRoleGuard, RootDeviceGuard)
export class AdminStatsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  stats(@Query("from") from?: string, @Query("to") to?: string) {
    return this.service.reporte(from, to);
  }
}
