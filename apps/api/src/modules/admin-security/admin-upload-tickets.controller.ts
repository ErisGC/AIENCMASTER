import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AdminSessionService } from "./admin-session.service";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "./admin-security.types";
import { CreateUploadTicketDto } from "./dto/create-upload-ticket.dto";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOriginGuard } from "./guards/admin-origin.guard";

/**
 * Permisos de subida directa para la web.
 *
 * Se piden con la sesión normal, a través del proxy, y se usan una vez contra
 * la API sin proxy. La ruta pedida tiene que estar en la lista cerrada de
 * `direct-upload-routes.ts`; los permisos del administrador sobre esa ruta se
 * revisan cuando llega la subida, igual que con la sesión.
 */
@Controller("admin/upload-tickets")
@UseGuards(AdminOriginGuard, AdminAuthGuard)
export class AdminUploadTicketsController {
  constructor(private readonly sessionService: AdminSessionService) {}

  @Post()
  @HttpCode(200)
  issue(@Req() req: AdminRequest, @Body() body: CreateUploadTicketDto) {
    return this.sessionService.issueRouteUploadTicket(
      req.adminAuth as AuthenticatedAdminContext,
      body.method,
      body.path,
    );
  }
}
