import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import type { FastifyReply } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AdminAccount } from "./admin-account.entity";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminDevice } from "./admin_device.entity";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_KIND,
  ADMIN_TRUSTED_DEVICE_COOKIE,
} from "./admin-security.constants";
import {
  AdminRequest,
  AdminSessionPayload,
  AdminSessionResponse,
  AdminSessionState,
  AuthenticatedAdminContext,
} from "./admin-security.types";
import { AdminAccessRequestStatus } from "./enums/admin-access-request-status.enum";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";
import { GlobalPermission } from "./permissions/permission.enums";

@Injectable()
export class AdminSessionService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    @InjectRepository(AdminDevice)
    private readonly deviceRepo: Repository<AdminDevice>,
    @InjectRepository(AdminAccessRequest)
    private readonly accessRequestRepo: Repository<AdminAccessRequest>,
  ) {}

  private requireStringEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable ${name}`);
    }

    return value;
  }

  private requirePositiveIntegerEnv(name: string) {
    const raw = this.requireStringEnv(name);
    const parsed = Number(raw);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `Environment variable ${name} must be a positive integer.`,
      );
    }

    return parsed;
  }

  private requireBooleanEnv(name: string) {
    const raw = this.requireStringEnv(name);
    if (raw !== "true" && raw !== "false") {
      throw new Error(
        `Environment variable ${name} must be either "true" or "false".`,
      );
    }

    return raw === "true";
  }

  get sessionSecret() {
    return this.requireStringEnv("ADMIN_SESSION_SECRET");
  }

  get sessionTtlSeconds() {
    return this.requirePositiveIntegerEnv("ADMIN_SESSION_TTL_SECONDS");
  }

  get pendingSessionTtlSeconds() {
    return this.requirePositiveIntegerEnv("ADMIN_PENDING_SESSION_TTL_SECONDS");
  }

  get trustedDeviceTtlSeconds() {
    return this.requirePositiveIntegerEnv("ADMIN_TRUSTED_DEVICE_TTL_SECONDS");
  }

  get accessRequestTtlSeconds() {
    return this.requirePositiveIntegerEnv("ADMIN_ACCESS_REQUEST_TTL_SECONDS");
  }

  get accessRequestRetryCooldownSeconds() {
    return this.requirePositiveIntegerEnv(
      "ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS",
    );
  }

  isBootstrapEnabled() {
    return this.requireBooleanEnv("ADMIN_BOOTSTRAP_ENABLED");
  }

  isRootRecoveryEnabled() {
    return this.requireBooleanEnv("ADMIN_ROOT_RECOVERY_ENABLED");
  }

  async hashPassword(password: string) {
    return hash(password, 12);
  }

  verifyPassword(password: string, passwordHash: string) {
    return compare(password, passwordHash);
  }

  hashTrustedToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  createTrustedToken() {
    return randomBytes(48).toString("base64url");
  }

  getPendingRequestExpiryDate(requestedAt: Date) {
    return new Date(
      requestedAt.getTime() + this.accessRequestTtlSeconds * 1000,
    );
  }

  isPendingRequestExpired(request: Pick<AdminAccessRequest, "requestedAt">) {
    return (
      this.getPendingRequestExpiryDate(request.requestedAt).getTime() <=
      Date.now()
    );
  }

  getRetryAvailableAtFromRequest(
    request: Pick<AdminAccessRequest, "resolvedAt">,
  ) {
    if (!request.resolvedAt) return null;

    return new Date(
      request.resolvedAt.getTime() +
        this.accessRequestRetryCooldownSeconds * 1000,
    );
  }

  isRetryBlockedByRequest(request: Pick<AdminAccessRequest, "resolvedAt">) {
    const retryAvailableAt = this.getRetryAvailableAtFromRequest(request);
    return retryAvailableAt !== null && retryAvailableAt.getTime() > Date.now();
  }

  isRetryBlockedByRevocation(device: Pick<AdminDevice, "revokedAt">) {
    if (!device.revokedAt) return false;

    return (
      device.revokedAt.getTime() +
        this.accessRequestRetryCooldownSeconds * 1000 >
      Date.now()
    );
  }

  buildSessionPayload(input: {
    accountId: string;
    deviceId: string;
    role: AdminRole;
    tokenVersion: number;
    state: AdminSessionState;
    requestId?: string;
  }): AdminSessionPayload {
    return {
      kind: ADMIN_SESSION_KIND,
      accountId: input.accountId,
      deviceId: input.deviceId,
      role: input.role,
      tokenVersion: input.tokenVersion,
      state: input.state,
      requestId: input.requestId,
    };
  }

  async signSession(payload: AdminSessionPayload, ttlSeconds: number) {
    return this.jwtService.signAsync(payload, {
      secret: this.sessionSecret,
      expiresIn: ttlSeconds,
    });
  }

  async readSession(req: AdminRequest): Promise<AdminSessionPayload | null> {
    const raw = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (!raw) return null;

    try {
      const payload = await this.jwtService.verifyAsync<AdminSessionPayload>(
        raw,
        {
          secret: this.sessionSecret,
        },
      );

      if (payload.kind !== ADMIN_SESSION_KIND) return null;
      return payload;
    } catch {
      return null;
    }
  }

  getRequestIp(req: AdminRequest) {
    // Usamos req.ip, que Fastify resuelve de forma confiable desde la cadena
    // X-Forwarded-For SOLO con trustProxy configurado (ver main.ts). Parsear
    // el header a mano permitía a un cliente falsear su IP y envenenar el
    // rastro de auditoría / la huella de dispositivo (mismo criterio que el
    // rate limiting, admin-auth.service getRateLimitIp).
    return req.ip ?? null;
  }

  getRequestUserAgent(req: AdminRequest) {
    const userAgent = req.headers["user-agent"];
    return typeof userAgent === "string" ? userAgent : "";
  }

  getCookieOptions(maxAgeSeconds: number) {
    const isProd = process.env.NODE_ENV === "production";
    // En producción la API y la web están en dominios distintos
    // (ej. *.railway.app + *.vercel.app), por lo que las cookies
    // necesitan SameSite=None + Secure para enviarse cross-site.
    const sameSite: "none" | "lax" = isProd ? "none" : "lax";
    return {
      path: "/",
      httpOnly: true,
      sameSite,
      secure: isProd,
      maxAge: maxAgeSeconds,
    };
  }

  setSessionCookie(reply: FastifyReply, token: string, ttlSeconds: number) {
    reply.setCookie(
      ADMIN_SESSION_COOKIE,
      token,
      this.getCookieOptions(ttlSeconds),
    );
  }

  setTrustedDeviceCookie(reply: FastifyReply, token: string) {
    reply.setCookie(
      ADMIN_TRUSTED_DEVICE_COOKIE,
      token,
      this.getCookieOptions(this.trustedDeviceTtlSeconds),
    );
  }

  clearAuthCookies(reply: FastifyReply) {
    const isProd = process.env.NODE_ENV === "production";
    const sameSite: "none" | "lax" = isProd ? "none" : "lax";
    const opts = {
      path: "/",
      sameSite,
      secure: isProd,
    };
    reply.clearCookie(ADMIN_SESSION_COOKIE, opts);
    reply.clearCookie(ADMIN_TRUSTED_DEVICE_COOKIE, opts);
  }

  async issueStateSession(
    reply: FastifyReply,
    account: AdminAccount,
    state: Exclude<AdminSessionState, "ACTIVE">,
    deviceId: string,
    requestId?: string,
  ) {
    const payload = this.buildSessionPayload({
      accountId: account.id,
      deviceId,
      role: account.role,
      tokenVersion: account.tokenVersion,
      state,
      requestId,
    });

    const token = await this.signSession(
      payload,
      this.pendingSessionTtlSeconds,
    );
    this.setSessionCookie(reply, token, this.pendingSessionTtlSeconds);
    reply.clearCookie(ADMIN_TRUSTED_DEVICE_COOKIE, { path: "/" });
  }

  async issuePendingSession(
    reply: FastifyReply,
    account: AdminAccount,
    request: AdminAccessRequest,
  ) {
    await this.issueStateSession(
      reply,
      account,
      "PENDING",
      request.deviceId,
      request.id,
    );
  }

  async issueRejectedSession(
    reply: FastifyReply,
    account: AdminAccount,
    deviceId: string,
    requestId?: string,
  ) {
    await this.issueStateSession(
      reply,
      account,
      "REJECTED",
      deviceId,
      requestId,
    );
  }

  async issueRevokedSession(
    reply: FastifyReply,
    account: AdminAccount,
    deviceId: string,
    requestId?: string,
  ) {
    await this.issueStateSession(
      reply,
      account,
      "REVOKED",
      deviceId,
      requestId,
    );
  }

  async issueInactiveAccountSession(
    reply: FastifyReply,
    account: AdminAccount,
    deviceId: string,
    requestId?: string,
  ) {
    await this.issueStateSession(
      reply,
      account,
      "INACTIVE_ACCOUNT",
      deviceId,
      requestId,
    );
  }

  async prepareTrustedDevice(
    device: AdminDevice,
    repository: Repository<AdminDevice> = this.deviceRepo,
  ) {
    const trustedToken = this.createTrustedToken();
    device.trustedTokenHash = this.hashTrustedToken(trustedToken);
    device.lastSeenAt = new Date();
    await repository.save(device);
    return trustedToken;
  }

  async writeActiveSessionCookies(
    reply: FastifyReply,
    account: AdminAccount,
    device: AdminDevice,
    trustedToken: string,
  ) {
    const payload = this.buildSessionPayload({
      accountId: account.id,
      deviceId: device.deviceId,
      role: account.role,
      tokenVersion: account.tokenVersion,
      state: "ACTIVE",
    });

    const token = await this.signSession(payload, this.sessionTtlSeconds);
    this.setSessionCookie(reply, token, this.sessionTtlSeconds);
    this.setTrustedDeviceCookie(reply, trustedToken);
  }

  async issueActiveSession(
    reply: FastifyReply,
    account: AdminAccount,
    device: AdminDevice,
    repository: Repository<AdminDevice> = this.deviceRepo,
  ) {
    const trustedToken = await this.prepareTrustedDevice(device, repository);
    await this.writeActiveSessionCookies(reply, account, device, trustedToken);
    return trustedToken;
  }

  async clearDeviceTrust(
    device: AdminDevice,
    repository: Repository<AdminDevice> = this.deviceRepo,
  ) {
    device.trustedTokenHash = null;
    await repository.save(device);
  }

  /**
   * Cuenta tal como la ven la web y la app en la respuesta de sesión.
   *
   * Incluye los permisos efectivos: sin ellos, un admin que no sea el
   * principal no puede saber a qué iglesias pertenece y el selector de
   * iglesia activa se queda vacío (con lo que no puede registrar informes
   * ni publicar anuncios locales). El ROOT no tiene asignaciones porque
   * opera sobre todas, y por eso sus permisos globales se devuelven
   * completos en vez de leerse de la columna.
   *
   * Las relaciones se cargan sólo donde esta respuesta se usa para decidir
   * el alcance del admin (estado de sesión y login). Si llegan sin cargar
   * —flujos de arranque y recuperación del principal, donde no aplican— se
   * devuelve la lista vacía en lugar de fallar.
   */
  serializeAccount(account: AdminAccount) {
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      isActive: account.isActive,
      globalPermissions:
        account.role === AdminRole.ROOT
          ? Object.values(GlobalPermission)
          : (account.globalPermissions ?? []),
      churchAssignments:
        account.churchAssignments?.map((assignment) => ({
          id: assignment.id,
          churchId: assignment.churchId,
          churchName: assignment.church?.name ?? null,
          permissions: assignment.permissions ?? [],
        })) ?? [],
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    };
  }

  serializeDevice(device: AdminDevice) {
    return {
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      roleScope: device.roleScope,
      status: device.status,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    };
  }

  private serializeAccessRequest(request: AdminAccessRequest) {
    return {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    };
  }

  private async markRequestExpired(request: AdminAccessRequest) {
    request.status = AdminAccessRequestStatus.EXPIRED;
    request.resolvedAt = new Date();
    request.notes = request.notes ?? "Expired automatically";
    return this.accessRequestRepo.save(request);
  }

  private ensureRootDeviceBinding(account: AdminAccount, device: AdminDevice) {
    if (
      device.roleScope === AdminDeviceScope.ROOT_DEVICE &&
      account.role !== AdminRole.ROOT
    ) {
      throw new UnauthorizedException("Invalid root device binding");
    }
  }

  async getBootstrapAvailability() {
    if (!this.isBootstrapEnabled()) return false;

    const rootCount = await this.accountRepo.count({
      where: { role: AdminRole.ROOT },
    });

    return rootCount === 0;
  }

  async getRootRecoveryAvailability() {
    if (!this.isRootRecoveryEnabled()) return false;

    const rootCount = await this.accountRepo.count({
      where: { role: AdminRole.ROOT },
    });

    return rootCount === 1;
  }

  async getSessionStatus(
    req: AdminRequest,
    reply: FastifyReply,
  ): Promise<AdminSessionResponse> {
    const bootstrapAvailable = await this.getBootstrapAvailability();
    const payload = await this.readSession(req);

    if (!payload) {
      return {
        status: bootstrapAvailable ? "BOOTSTRAP_REQUIRED" : "UNAUTHENTICATED",
        bootstrapAvailable,
      };
    }

    // Con las asignaciones de iglesia: esta respuesta es la que usan la web y
    // la app para saber sobre qué iglesias puede operar el admin.
    const account = await this.accountRepo.findOne({
      where: { id: payload.accountId },
      relations: { churchAssignments: { church: true } },
    });

    if (!account || account.tokenVersion !== payload.tokenVersion) {
      this.clearAuthCookies(reply);
      return {
        status: bootstrapAvailable ? "BOOTSTRAP_REQUIRED" : "UNAUTHENTICATED",
        bootstrapAvailable,
      };
    }

    if (!account.isActive) {
      if (payload.state !== "INACTIVE_ACCOUNT") {
        await this.issueInactiveAccountSession(
          reply,
          account,
          payload.deviceId,
          payload.requestId,
        );
      }

      return {
        status: "INACTIVE_ACCOUNT",
        bootstrapAvailable,
        account: this.serializeAccount(account),
      };
    }

    const device = await this.deviceRepo.findOne({
      where: { deviceId: payload.deviceId },
    });

    if (device) {
      this.ensureRootDeviceBinding(account, device);
    }

    const accessRequest = payload.requestId
      ? await this.accessRequestRepo.findOne({
          where: { id: payload.requestId },
        })
      : device
        ? await this.accessRequestRepo.findOne({
            where: {
              adminAccountId: account.id,
              deviceId: device.deviceId,
              status: AdminAccessRequestStatus.PENDING,
            },
            order: { requestedAt: "DESC" },
          })
        : null;

    if (
      accessRequest?.status === AdminAccessRequestStatus.PENDING &&
      this.isPendingRequestExpired(accessRequest)
    ) {
      await this.markRequestExpired(accessRequest);
      this.clearAuthCookies(reply);
      return {
        status: "UNAUTHENTICATED",
        bootstrapAvailable,
      };
    }

    if (payload.state === "ACTIVE") {
      if (!device || device.adminAccountId !== account.id) {
        this.clearAuthCookies(reply);
        return {
          status: "UNAUTHENTICATED",
          bootstrapAvailable,
        };
      }

      if (device.status === AdminDeviceStatus.REVOKED) {
        await this.issueRevokedSession(
          reply,
          account,
          device.deviceId,
          payload.requestId,
        );
        return {
          status: "REVOKED",
          bootstrapAvailable,
          account: this.serializeAccount(account),
          device: this.serializeDevice(device),
        };
      }

      if (device.status === AdminDeviceStatus.REJECTED) {
        await this.issueRejectedSession(
          reply,
          account,
          device.deviceId,
          payload.requestId,
        );
        return {
          status: "REJECTED",
          bootstrapAvailable,
          account: this.serializeAccount(account),
          device: this.serializeDevice(device),
          accessRequest: accessRequest
            ? this.serializeAccessRequest(accessRequest)
            : undefined,
        };
      }

      if (device.status !== AdminDeviceStatus.APPROVED) {
        if (
          device.status === AdminDeviceStatus.PENDING &&
          accessRequest?.status === AdminAccessRequestStatus.PENDING
        ) {
          await this.issuePendingSession(reply, account, accessRequest);

          return {
            status: "PENDING",
            bootstrapAvailable,
            account: this.serializeAccount(account),
            device: this.serializeDevice(device),
            accessRequest: this.serializeAccessRequest(accessRequest),
          };
        }

        this.clearAuthCookies(reply);
        return {
          status: "UNAUTHENTICATED",
          bootstrapAvailable,
        };
      }

      const trustedToken = req.cookies?.[ADMIN_TRUSTED_DEVICE_COOKIE];
      if (
        !trustedToken ||
        !device.trustedTokenHash ||
        this.hashTrustedToken(trustedToken) !== device.trustedTokenHash
      ) {
        this.clearAuthCookies(reply);
        return {
          status: "UNAUTHENTICATED",
          bootstrapAvailable,
        };
      }

      // Renovación deslizante: esta rama (dispositivo ROOT) devolvía ACTIVE
      // sin refrescar las cookies, así que la sesión caducaba por antigüedad
      // aunque el admin siguiera usando la app. Reescribimos ambas cookies con
      // TTL nuevo reutilizando el MISMO trustedToken (ya validado arriba): no
      // se rota el token del dispositivo, así que no hay riesgo de perder el
      // vínculo ROOT si la respuesta no llegara.
      await this.writeActiveSessionCookies(
        reply,
        account,
        device,
        trustedToken,
      );

      return {
        status: "ACTIVE",
        bootstrapAvailable,
        account: this.serializeAccount(account),
        device: this.serializeDevice(device),
      };
    }

    if (
      device &&
      device.adminAccountId === account.id &&
      device.status === AdminDeviceStatus.APPROVED
    ) {
      account.lastLoginAt = new Date();
      await this.accountRepo.save(account);
      await this.issueActiveSession(reply, account, device);

      return {
        status: "ACTIVE",
        bootstrapAvailable,
        account: this.serializeAccount(account),
        device: this.serializeDevice(device),
      };
    }

    if (device?.status === AdminDeviceStatus.REVOKED) {
      if (payload.state !== "REVOKED") {
        await this.issueRevokedSession(
          reply,
          account,
          payload.deviceId,
          payload.requestId,
        );
      }

      return {
        status: "REVOKED",
        bootstrapAvailable,
        account: this.serializeAccount(account),
        device: this.serializeDevice(device),
      };
    }

    if (
      accessRequest?.status === AdminAccessRequestStatus.REJECTED ||
      device?.status === AdminDeviceStatus.REJECTED ||
      payload.state === "REJECTED"
    ) {
      if (payload.state !== "REJECTED") {
        await this.issueRejectedSession(
          reply,
          account,
          payload.deviceId,
          payload.requestId,
        );
      }

      return {
        status: "REJECTED",
        bootstrapAvailable,
        account: this.serializeAccount(account),
        device: device ? this.serializeDevice(device) : undefined,
        accessRequest: accessRequest
          ? this.serializeAccessRequest(accessRequest)
          : undefined,
      };
    }

    return {
      status: "PENDING",
      bootstrapAvailable,
      account: this.serializeAccount(account),
      device: device ? this.serializeDevice(device) : undefined,
      accessRequest: accessRequest
        ? this.serializeAccessRequest(accessRequest)
        : undefined,
    };
  }

  async validateActiveAdminRequest(
    req: AdminRequest,
  ): Promise<AuthenticatedAdminContext> {
    const payload = await this.readSession(req);
    if (!payload || payload.state !== "ACTIVE") {
      throw new UnauthorizedException("Admin session required");
    }

    const account = await this.accountRepo.findOne({
      where: { id: payload.accountId },
    });

    if (
      !account ||
      !account.isActive ||
      account.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException("Admin account is not available");
    }

    const device = await this.deviceRepo.findOne({
      where: {
        deviceId: payload.deviceId,
        adminAccountId: account.id,
      },
    });

    if (!device) {
      throw new UnauthorizedException("Trusted device not found");
    }

    this.ensureRootDeviceBinding(account, device);

    if (device.status !== AdminDeviceStatus.APPROVED) {
      throw new ForbiddenException("Device is not approved");
    }

    const trustedToken = req.cookies?.[ADMIN_TRUSTED_DEVICE_COOKIE];
    if (
      !trustedToken ||
      !device.trustedTokenHash ||
      this.hashTrustedToken(trustedToken) !== device.trustedTokenHash
    ) {
      throw new UnauthorizedException("Trusted device token is invalid");
    }

    device.lastSeenAt = new Date();
    device.ipLastSeen = this.getRequestIp(req);
    device.userAgent = this.getRequestUserAgent(req);
    await this.deviceRepo.save(device);

    return { account, device, session: payload };
  }
}
