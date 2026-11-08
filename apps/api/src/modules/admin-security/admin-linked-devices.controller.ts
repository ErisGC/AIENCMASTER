import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AdminLinkedDevicesService } from "./admin-linked-devices.service";
import type { AuthenticatedAdminContext } from "./admin-security.types";
import { AdminAuth } from "./decorators/admin-auth.decorator";
import {
  ApproveLinkedRequestDto,
  RenameLinkedDeviceDto,
} from "./dto/linked-devices.dto";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOriginGuard } from "./guards/admin-origin.guard";

/**
 * Sesiones de la propia cuenta, desde la app del teléfono. Cualquier
 * administrador maneja las suyas; el servicio verifica que la petición venga
 * de la app y que cada dispositivo o solicitud sea de la misma cuenta.
 */
@Controller("admin/me/devices")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminLinkedDevicesController {
  constructor(private readonly service: AdminLinkedDevicesService) {}

  @Get()
  overview(@AdminAuth() actor: AuthenticatedAdminContext) {
    return this.service.overview(actor);
  }

  @Post("requests/:id/approve")
  approve(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ApproveLinkedRequestDto,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.approve(id, dto.code, actor);
  }

  @Post("requests/:id/reject")
  reject(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.reject(id, actor);
  }

  @Patch(":id")
  rename(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: RenameLinkedDeviceDto,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.rename(id, dto.name, actor);
  }

  @Post(":id/pause")
  pause(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.pause(id, actor);
  }

  @Post(":id/resume")
  resume(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.resume(id, actor);
  }

  @Post(":id/sign-out")
  signOut(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.signOut(id, actor);
  }

  @Delete(":id")
  remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @AdminAuth() actor: AuthenticatedAdminContext,
  ) {
    return this.service.remove(id, actor);
  }
}
