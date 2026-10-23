import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { AdminSessionService } from "../admin-session.service";
import type { AdminRequest } from "../admin-security.types";

export const UPLOAD_TICKET_HEADER = "x-aienc-upload-ticket";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly sessionService: AdminSessionService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    // Subida directa desde la web: el permiso temporal reemplaza a la cookie
    // de sesión, solo en las rutas de subida y una sola vez.
    const ticket = request.headers[UPLOAD_TICKET_HEADER];
    if (typeof ticket === "string" && ticket.length > 0) {
      request.adminAuth ??= await this.sessionService.validateRouteUploadTicket(
        request,
        ticket,
      );
      return true;
    }

    request.adminAuth =
      await this.sessionService.validateActiveAdminRequest(request);
    return true;
  }
}
