import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { AdminAuditService } from "../admin-audit.service";
import type { AdminRequest } from "../admin-security.types";
import { isPrincipalDevice } from "../linked-devices.rules";

@Injectable()
export class RootDeviceGuard implements CanActivate {
  constructor(private readonly auditService: AdminAuditService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    // Poderes de principal: el dispositivo principal clásico, la app de la
    // cuenta principal o un navegador aprobado desde esa app.
    const auth = request.adminAuth;
    if (!auth || !isPrincipalDevice(auth.account, auth.device)) {
      await this.auditService.log({
        actorAdminAccountId: request.adminAuth?.account.id ?? null,
        actorDeviceId: request.adminAuth?.device.id ?? null,
        actionType: "ROOT_ACCESS_DENIED_DEVICE",
        targetType: "ADMIN_SECURITY",
        description:
          "Acceso denegado al módulo root: el dispositivo no tiene poderes de principal.",
        ip: request.ip ?? null,
        userAgent:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : "",
      });
      throw new ForbiddenException("Root device required");
    }

    return true;
  }
}
