import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Church } from "../churches/church.entity";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { AdminAccount } from "./admin-account.entity";
import { AdminProfileController } from "./admin-profile.controller";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminAssignmentsMigratorService } from "./admin-assignments-migrator.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminChurchAssignment } from "./admin-church-assignment.entity";
import { AdminInvitation } from "./admin-invitation.entity";
import {
  AdminInvitationsController,
  PublicInvitationsController,
} from "./admin-invitations.controller";
import { AdminInvitationsService } from "./admin-invitations.service";
import { AdminRateLimitService } from "./admin-rate-limit.service";
import { AdminSecurityIntegrityService } from "./admin-security-integrity.service";
import { AdminSecurityController } from "./admin-security.controller";
import { AdminSecurityService } from "./admin-security.service";
import { AdminSessionService } from "./admin-session.service";
import { AdminDevice } from "./admin_device.entity";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminOriginGuard } from "./guards/admin-origin.guard";
import { RootDeviceGuard } from "./guards/root-device.guard";
import { RootRoleGuard } from "./guards/root-role.guard";
import { GlobalPermissionsGuard } from "./permissions/global-permissions.guard";
import { PermissionsService } from "./permissions/permissions.service";

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      AdminAccount,
      AdminDevice,
      AdminAccessRequest,
      AdminActionLog,
      AdminInvitation,
      AdminChurchAssignment,
      Church,
    ]),
    CloudinaryModule,
  ],
  controllers: [
    AdminAuthController,
    AdminSecurityController,
    AdminInvitationsController,
    PublicInvitationsController,
    AdminProfileController,
  ],
  providers: [
    AdminAuthService,
    AdminAuditService,
    AdminInvitationsService,
    AdminRateLimitService,
    AdminSecurityIntegrityService,
    AdminSecurityService,
    AdminSessionService,
    AdminAuthGuard,
    AdminOriginGuard,
    RootRoleGuard,
    RootDeviceGuard,
    PermissionsService,
    GlobalPermissionsGuard,
    AdminAssignmentsMigratorService,
  ],
  exports: [
    AdminAuditService,
    AdminOriginGuard,
    AdminRateLimitService,
    AdminSessionService,
    AdminAuthGuard,
    RootRoleGuard,
    RootDeviceGuard,
    PermissionsService,
    GlobalPermissionsGuard,
    TypeOrmModule,
  ],
})
export class AdminSecurityModule {}
