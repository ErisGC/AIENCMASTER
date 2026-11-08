import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { AdminAuthService } from "./admin-auth.service";
import { AdminSessionService } from "./admin-session.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { BootstrapRootDto } from "./dto/bootstrap-root.dto";
import { RecoverRootDeviceDto } from "./dto/recover-root-device.dto";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOriginGuard } from "./guards/admin-origin.guard";
import type { AdminRequest } from "./admin-security.types";

@Controller("admin/auth")
@UseGuards(AdminOriginGuard)
export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly sessionService: AdminSessionService,
  ) {}

  @Get("bootstrap-status")
  async bootstrapStatus() {
    return {
      available: await this.sessionService.getBootstrapAvailability(),
      enabled: this.sessionService.isBootstrapEnabled(),
    };
  }

  @Post("bootstrap")
  bootstrap(
    @Body() dto: BootstrapRootDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.authService.bootstrapRoot(dto, req, reply);
  }

  @Post("login")
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.authService.login(dto, req, reply);
  }

  @Get("root-recovery-status")
  rootRecoveryStatus() {
    return this.authService.getRootRecoveryStatus();
  }

  @Post("root-recovery")
  rootRecovery(
    @Body() dto: RecoverRootDeviceDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.authService.recoverRootDevice(dto, req, reply);
  }

  @Post("logout")
  logout(
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.authService.logout(req, reply);
  }

  /**
   * Señal de vida del panel abierto (cada minuto mientras se ve). El guard
   * valida la sesión y actualiza la última actividad del dispositivo; la app
   * la usa para mostrar si la sesión está en uso.
   */
  @Post("ping")
  @UseGuards(AdminAuthGuard)
  ping() {
    return { ok: true };
  }

  /** El navegador avisa que se cerró la ventana del panel. */
  @Post("window-closed")
  windowClosed(@Req() req: AdminRequest) {
    return this.sessionService.markWindowClosed(req);
  }

  @Get("session")
  session(
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.sessionService.getSessionStatus(req, reply);
  }
}
