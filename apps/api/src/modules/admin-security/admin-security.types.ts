import type { FastifyRequest } from "fastify";

import type { AdminAccount } from "./admin-account.entity";
import type { AdminDevice } from "./admin_device.entity";
import { ADMIN_SESSION_KIND } from "./admin-security.constants";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";

export type AdminSessionState =
  | "ACTIVE"
  | "PENDING"
  | "REJECTED"
  | "REVOKED"
  | "INACTIVE_ACCOUNT";

export type AdminSessionPayload = {
  kind: typeof ADMIN_SESSION_KIND;
  accountId: string;
  deviceId: string;
  role: AdminRole;
  tokenVersion: number;
  state: AdminSessionState;
  requestId?: string;
};

export type AuthenticatedAdminContext = {
  account: AdminAccount;
  device: AdminDevice;
  session: AdminSessionPayload;
};

export type AdminSessionResponse = {
  status:
    | "UNAUTHENTICATED"
    | "BOOTSTRAP_REQUIRED"
    | "PENDING"
    | "REJECTED"
    | "REVOKED"
    | "INACTIVE_ACCOUNT"
    | "PAUSED"
    | "ACTIVE";
  bootstrapAvailable: boolean;
  account?: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
    isActive: boolean;
    lastLoginAt: string | null;
  };
  device?: {
    id: string;
    deviceId: string;
    deviceName: string;
    roleScope: AdminDeviceScope;
    status: AdminDeviceStatus;
    lastSeenAt: string | null;
    clientKind: "WEB" | "APP";
    /** Tiene los poderes del administrador principal (ver linked-devices.rules). */
    principal: boolean;
  };
  accessRequest?: {
    id: string;
    status: string;
    requestedAt: string;
    resolvedAt: string | null;
    approvalChannel: string;
    confirmCode: string | null;
  };
};

export type AdminRequest = FastifyRequest & {
  adminAuth?: AuthenticatedAdminContext;
};
