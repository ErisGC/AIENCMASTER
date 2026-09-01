import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { FastifyReply } from "fastify";
import { DataSource, Repository } from "typeorm";
import { timingSafeEqual } from "node:crypto";

import { AdminAccount } from "./admin-account.entity";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AdminRateLimitService } from "./admin-rate-limit.service";
import { AdminSessionService } from "./admin-session.service";
import { AdminDevice } from "./admin_device.entity";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { BootstrapRootDto } from "./dto/bootstrap-root.dto";
import { RecoverRootDeviceDto } from "./dto/recover-root-device.dto";
import { AdminAccessRequestStatus } from "./enums/admin-access-request-status.enum";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";
import { AdminRequest } from "./admin-security.types";

type DeviceInput = {
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
};

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    @InjectRepository(AdminDevice)
    private readonly deviceRepo: Repository<AdminDevice>,
    @InjectRepository(AdminAccessRequest)
    private readonly accessRequestRepo: Repository<AdminAccessRequest>,
    private readonly dataSource: DataSource,
    private readonly rateLimitService: AdminRateLimitService,
    private readonly sessionService: AdminSessionService,
    private readonly auditService: AdminAuditService,
  ) {}

  normalizeUsername(username: string) {
    return username.trim().toLowerCase();
  }

  /**
   * IP del cliente para rate limiting. Usa req.ip, que Fastify calcula de
   * forma confiable a partir de X-Forwarded-For SOLO cuando trustProxy está
   * configurado (ver main.ts). Parsear el header a mano permitiría a un
   * cliente falsear su IP y eludir el rate limiting.
   */
  private getRateLimitIp(req: AdminRequest) {
    return req.ip ?? null;
  }

  /**
   * Comparación de secretos en tiempo constante para evitar timing attacks
   * al validar el secreto de bootstrap / recovery.
   */
  private secretsMatch(provided: string, configured: string): boolean {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(configured, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private getLoginRateLimitPolicy(req: AdminRequest, username: string) {
    return {
      scope: "admin-login",
      windowSeconds: 15 * 60,
      blockSeconds: 15 * 60,
      message:
        "Demasiados intentos de inicio de sesión. Intenta nuevamente en unos minutos.",
      dimensions: [
        {
          label: "ip",
          value: this.getRateLimitIp(req),
          maxAttempts: 10,
        },
        {
          label: "username",
          value: username,
          maxAttempts: 5,
        },
      ],
    };
  }

  private getBootstrapRateLimitPolicy(req: AdminRequest, username: string) {
    return {
      scope: "admin-bootstrap",
      windowSeconds: 30 * 60,
      blockSeconds: 30 * 60,
      message:
        "Demasiados intentos de bootstrap root. Espera antes de intentarlo nuevamente.",
      dimensions: [
        {
          label: "ip",
          value: this.getRateLimitIp(req),
          maxAttempts: 5,
        },
        {
          label: "username",
          value: username,
          maxAttempts: 3,
        },
      ],
    };
  }

  private getRootRecoveryRateLimitPolicy(req: AdminRequest, username: string) {
    return {
      scope: "admin-root-recovery",
      windowSeconds: 30 * 60,
      blockSeconds: 30 * 60,
      message:
        "Demasiados intentos de recuperación root. Espera antes de intentarlo nuevamente.",
      dimensions: [
        {
          label: "ip",
          value: this.getRateLimitIp(req),
          maxAttempts: 5,
        },
        {
          label: "username",
          value: username,
          maxAttempts: 3,
        },
      ],
    };
  }

  private resetRateLimit(scope: string, req: AdminRequest, username: string) {
    this.rateLimitService.reset(scope, [
      { label: "ip", value: this.getRateLimitIp(req) },
      { label: "username", value: username },
    ]);
  }

  private async enforceRateLimit(
    policy: {
      scope: string;
      windowSeconds: number;
      blockSeconds: number;
      message: string;
      dimensions: Array<{
        label: string;
        value: string | null | undefined;
        maxAttempts: number;
      }>;
    },
    req: AdminRequest,
    reply: FastifyReply,
    auditActionType: string,
    metadata?: Record<string, unknown>,
  ) {
    try {
      this.rateLimitService.consume(policy, reply);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        await this.auditService.log({
          actionType: auditActionType,
          targetType: "ADMIN_AUTH",
          description: `${policy.scope} rate limited`,
          ip: this.sessionService.getRequestIp(req),
          userAgent: this.sessionService.getRequestUserAgent(req),
          metadata,
        });
      }

      throw error;
    }
  }

  private async logBootstrapFailure(
    reason: string,
    req: AdminRequest,
    metadata?: Record<string, unknown>,
  ) {
    await this.auditService.log({
      actionType: "ROOT_BOOTSTRAP_FAILED",
      targetType: "ADMIN_BOOTSTRAP",
      description: reason,
      ip: this.sessionService.getRequestIp(req),
      userAgent: this.sessionService.getRequestUserAgent(req),
      metadata,
    });
  }

  private async logRootRecoveryFailure(
    reason: string,
    req: AdminRequest,
    metadata?: Record<string, unknown>,
  ) {
    await this.auditService.log({
      actionType: "ROOT_RECOVERY_FAILED",
      targetType: "ADMIN_ROOT_RECOVERY",
      description: reason,
      ip: this.sessionService.getRequestIp(req),
      userAgent: this.sessionService.getRequestUserAgent(req),
      metadata,
    });
  }

  async getRootRecoveryStatus() {
    return {
      available: await this.sessionService.getRootRecoveryAvailability(),
      enabled: this.sessionService.isRootRecoveryEnabled(),
    };
  }

  async bootstrapRoot(
    dto: BootstrapRootDto,
    req: AdminRequest,
    reply: FastifyReply,
  ) {
    const username = this.normalizeUsername(dto.username);

    await this.enforceRateLimit(
      this.getBootstrapRateLimitPolicy(req, username),
      req,
      reply,
      "ROOT_BOOTSTRAP_RATE_LIMITED",
      { username },
    );

    if (!this.sessionService.isBootstrapEnabled()) {
      await this.logBootstrapFailure("Admin bootstrap is disabled", req, {
        username,
      });
      throw new ForbiddenException("Admin bootstrap is disabled");
    }

    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
    if (!configuredSecret) {
      await this.logBootstrapFailure("Bootstrap secret is not configured", req);
      throw new ForbiddenException("Bootstrap secret is not configured");
    }

    if (!this.secretsMatch(dto.secret, configuredSecret)) {
      await this.logBootstrapFailure("Bootstrap secret is invalid", req, {
        username,
      });
      throw new ForbiddenException("Bootstrap secret is invalid");
    }

    const result = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        const accountRepo = manager.getRepository(AdminAccount);
        const deviceRepo = manager.getRepository(AdminDevice);
        const auditRepo = manager.getRepository(AdminActionLog);

        const [rootExists, rootDeviceExists] = await Promise.all([
          accountRepo.exists({
            where: { role: AdminRole.ROOT },
          }),
          deviceRepo.exists({
            where: {
              roleScope: AdminDeviceScope.ROOT_DEVICE,
            },
          }),
        ]);

        if (rootExists || rootDeviceExists) {
          throw new BadRequestException(
            "Root admin or root device already exists",
          );
        }

        const account = await accountRepo.save(
          accountRepo.create({
            username: this.normalizeUsername(dto.username),
            passwordHash: await this.sessionService.hashPassword(dto.password),
            displayName: dto.displayName.trim(),
            role: AdminRole.ROOT,
            isActive: true,
            tokenVersion: 1,
            lastLoginAt: new Date(),
          }),
        );

        const device = await deviceRepo.save(
          deviceRepo.create({
            adminAccountId: account.id,
            deviceId: dto.deviceId,
            deviceName: dto.deviceName.trim(),
            platform: dto.platform,
            browser: dto.browser,
            userAgent: this.sessionService.getRequestUserAgent(req),
            ipLastSeen: this.sessionService.getRequestIp(req),
            roleScope: AdminDeviceScope.ROOT_DEVICE,
            status: AdminDeviceStatus.APPROVED,
            approvedAt: new Date(),
            lastSeenAt: new Date(),
          }),
        );

        const trustedToken = await this.sessionService.prepareTrustedDevice(
          device,
          deviceRepo,
        );

        await this.auditService.log(
          {
            actorAdminAccountId: account.id,
            actorDeviceId: device.id,
            actionType: "ROOT_BOOTSTRAPPED",
            targetType: "ADMIN_ACCOUNT",
            targetId: account.id,
            description: "Cuenta root y dispositivo principal inicializados",
            ip: this.sessionService.getRequestIp(req),
            userAgent: this.sessionService.getRequestUserAgent(req),
            metadata: {
              username: account.username,
              deviceId: device.deviceId,
            },
          },
          auditRepo,
        );

        return { account, device, trustedToken };
      },
    );

    this.resetRateLimit("admin-bootstrap", req, username);

    await this.sessionService.writeActiveSessionCookies(
      reply,
      result.account,
      result.device,
      result.trustedToken,
    );

    return {
      status: "ACTIVE",
      account: this.sessionService.serializeAccount(result.account),
      device: this.sessionService.serializeDevice(result.device),
    };
  }

  async recoverRootDevice(
    dto: RecoverRootDeviceDto,
    req: AdminRequest,
    reply: FastifyReply,
  ) {
    const username = this.normalizeUsername(dto.username);

    await this.enforceRateLimit(
      this.getRootRecoveryRateLimitPolicy(req, username),
      req,
      reply,
      "ROOT_RECOVERY_RATE_LIMITED",
      { username },
    );

    if (!this.sessionService.isRootRecoveryEnabled()) {
      await this.logRootRecoveryFailure("Root recovery is disabled", req, {
        username,
      });
      throw new ForbiddenException("Root recovery is disabled");
    }

    const configuredSecret = process.env.ADMIN_ROOT_RECOVERY_SECRET?.trim();
    if (!configuredSecret) {
      await this.logRootRecoveryFailure(
        "Root recovery secret is not configured",
        req,
      );
      throw new ForbiddenException("Root recovery secret is not configured");
    }

    if (!this.secretsMatch(dto.secret, configuredSecret)) {
      await this.logRootRecoveryFailure(
        "Root recovery secret is invalid",
        req,
        { username },
      );
      throw new ForbiddenException("Root recovery secret is invalid");
    }

    const rootAccount = await this.accountRepo.findOne({
      where: { username, role: AdminRole.ROOT },
    });

    if (!rootAccount) {
      await this.logRootRecoveryFailure(
        "Root recovery attempted with an unknown root username",
        req,
        { username },
      );
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const passwordMatches = await this.sessionService.verifyPassword(
      dto.password,
      rootAccount.passwordHash,
    );

    if (!passwordMatches) {
      await this.logRootRecoveryFailure(
        "Root recovery attempted with invalid credentials",
        req,
        { username },
      );
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (!rootAccount.isActive) {
      await this.logRootRecoveryFailure(
        "Root recovery attempted for an inactive root account",
        req,
        { rootAccountId: rootAccount.id },
      );
      throw new ForbiddenException("La cuenta root está desactivada");
    }

    const result = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        const accountRepo = manager.getRepository(AdminAccount);
        const deviceRepo = manager.getRepository(AdminDevice);
        const requestRepo = manager.getRepository(AdminAccessRequest);
        const auditRepo = manager.getRepository(AdminActionLog);

        const account = await accountRepo.findOne({
          where: { id: rootAccount.id, role: AdminRole.ROOT },
        });

        if (!account) {
          throw new BadRequestException("Root account not found");
        }

        const existingDevice = await deviceRepo.findOne({
          where: { deviceId: dto.deviceId },
        });

        if (
          existingDevice?.adminAccountId &&
          existingDevice.adminAccountId !== account.id
        ) {
          throw new ConflictException(
            "Este dispositivo ya está vinculado a otra cuenta administrativa.",
          );
        }

        const existingRootDevices = await deviceRepo.find({
          where: {
            roleScope: AdminDeviceScope.ROOT_DEVICE,
          },
        });

        for (const rootDevice of existingRootDevices) {
          rootDevice.status = AdminDeviceStatus.REVOKED;
          rootDevice.roleScope = AdminDeviceScope.APPROVED_DEVICE;
          rootDevice.revokedAt = new Date();
          rootDevice.trustedTokenHash = null;
          rootDevice.approvedByDeviceId = null;
          await deviceRepo.save(rootDevice);
        }

        await requestRepo
          .createQueryBuilder()
          .update(AdminAccessRequest)
          .set({
            status: AdminAccessRequestStatus.EXPIRED,
            resolvedAt: new Date(),
            notes: "Resolved automatically by root device recovery",
          })
          .where("adminAccountId = :adminAccountId", {
            adminAccountId: account.id,
          })
          .andWhere("status = :status", {
            status: AdminAccessRequestStatus.PENDING,
          })
          .execute();

        account.tokenVersion += 1;
        account.lastLoginAt = new Date();
        await accountRepo.save(account);

        const device =
          existingDevice ??
          deviceRepo.create({
            deviceId: dto.deviceId,
          });

        device.adminAccountId = account.id;
        device.deviceName = dto.deviceName.trim();
        device.platform = dto.platform;
        device.browser = dto.browser;
        device.userAgent = this.sessionService.getRequestUserAgent(req);
        device.ipLastSeen = this.sessionService.getRequestIp(req);
        device.roleScope = AdminDeviceScope.ROOT_DEVICE;
        device.status = AdminDeviceStatus.APPROVED;
        device.approvedAt = new Date();
        device.revokedAt = null;
        device.approvedByDeviceId = null;

        await deviceRepo.save(device);
        const trustedToken = await this.sessionService.prepareTrustedDevice(
          device,
          deviceRepo,
        );

        await this.auditService.log(
          {
            actorAdminAccountId: account.id,
            actorDeviceId: device.id,
            actionType: "ROOT_DEVICE_RECOVERED",
            targetType: "ADMIN_DEVICE",
            targetId: device.id,
            description:
              "Break-glass recovery ejecutado para transferir el ROOT_DEVICE.",
            ip: this.sessionService.getRequestIp(req),
            userAgent: this.sessionService.getRequestUserAgent(req),
            metadata: {
              deviceId: device.deviceId,
              revokedRootDeviceIds: existingRootDevices.map(
                (rootDevice) => rootDevice.id,
              ),
            },
          },
          auditRepo,
        );

        return { account, device, trustedToken };
      },
    );

    await this.sessionService.writeActiveSessionCookies(
      reply,
      result.account,
      result.device,
      result.trustedToken,
    );

    this.resetRateLimit("admin-root-recovery", req, username);

    return {
      status: "ACTIVE",
      account: this.sessionService.serializeAccount(result.account),
      device: this.sessionService.serializeDevice(result.device),
    };
  }

  async login(dto: AdminLoginDto, req: AdminRequest, reply: FastifyReply) {
    const username = this.normalizeUsername(dto.username);

    await this.enforceRateLimit(
      this.getLoginRateLimitPolicy(req, username),
      req,
      reply,
      "LOGIN_RATE_LIMITED",
      { username },
    );

    // Con las asignaciones de iglesia: la respuesta del login incluye la
    // cuenta serializada, y de ahí sale el alcance del admin en la web y en
    // la app (selector de iglesia activa, permisos por iglesia).
    const account = await this.accountRepo.findOne({
      where: { username },
      relations: { churchAssignments: { church: true } },
    });

    if (!account) {
      await this.auditService.log({
        actionType: "LOGIN_FAILED",
        targetType: "ADMIN_ACCOUNT",
        description: "Intento de login con username inexistente",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
        metadata: { username },
      });
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const passwordMatches = await this.sessionService.verifyPassword(
      dto.password,
      account.passwordHash,
    );

    if (!passwordMatches) {
      await this.auditService.log({
        actorAdminAccountId: account.id,
        actionType: "LOGIN_FAILED",
        targetType: "ADMIN_ACCOUNT",
        targetId: account.id,
        description: "Intento de login con contraseña inválida",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
      });
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (!account.isActive) {
      await this.auditService.log({
        actorAdminAccountId: account.id,
        actionType: "LOGIN_BLOCKED_INACTIVE_ACCOUNT",
        targetType: "ADMIN_ACCOUNT",
        targetId: account.id,
        description: "Intento de login bloqueado por cuenta inactiva",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
      });
      throw new ForbiddenException("La cuenta administrativa está desactivada");
    }

    const deviceInput: DeviceInput = {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName.trim(),
      platform: dto.platform,
      browser: dto.browser,
    };

    const existingDevice = await this.deviceRepo.findOne({
      where: { deviceId: dto.deviceId },
    });

    if (
      existingDevice?.adminAccountId &&
      existingDevice.adminAccountId !== account.id
    ) {
      await this.auditService.log({
        actorAdminAccountId: account.id,
        actionType: "LOGIN_BLOCKED_DEVICE_CONFLICT",
        targetType: "ADMIN_DEVICE",
        targetId: existingDevice.id,
        description:
          "Intento de login bloqueado: el deviceId ya pertenece a otra cuenta admin.",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
        metadata: {
          deviceId: existingDevice.deviceId,
          conflictingAdminAccountId: existingDevice.adminAccountId,
        },
      });
      throw new ConflictException(
        "Este dispositivo ya está vinculado a otra cuenta administrativa.",
      );
    }

    /*
     * MODO RELAJADO (temporal):
     * Si ADMIN_DEVICE_VERIFICATION_DISABLED=true, cualquier dispositivo
     * que pueda autenticar con usuario+contraseña entra como APPROVED
     * sin necesidad de aprobación previa por el ROOT_DEVICE.
     *
     * El roleScope (ROOT_DEVICE / APPROVED_DEVICE) se preserva si ya
     * existía; los devices nuevos se crean como APPROVED_DEVICE.
     *
     * Cuando se restablezca la seguridad, basta con quitar la variable
     * de entorno y borrar los devices APPROVED creados durante el modo
     * relajado.
     */
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ADMIN_DEVICE_VERIFICATION_DISABLED === "true"
    ) {
      const device = await this.upsertDeviceAsApproved(
        existingDevice,
        account,
        deviceInput,
        req,
      );

      account.lastLoginAt = new Date();
      await this.accountRepo.save(account);

      await this.sessionService.issueActiveSession(reply, account, device);

      await this.auditService.log({
        actorAdminAccountId: account.id,
        actorDeviceId: device.id,
        actionType: "LOGIN_SUCCEEDED_DEVICE_VERIFICATION_DISABLED",
        targetType: "ADMIN_ACCOUNT",
        targetId: account.id,
        description:
          "Login con verificación de dispositivo deshabilitada (modo relajado).",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
        metadata: { deviceId: device.deviceId },
      });

      this.resetRateLimit("admin-login", req, username);

      return {
        status: "ACTIVE",
        account: this.sessionService.serializeAccount(account),
        device: this.sessionService.serializeDevice(device),
      };
    }

    let latestRequest = await this.findLatestAccessRequest(
      account.id,
      deviceInput.deviceId,
    );

    if (
      latestRequest?.status === AdminAccessRequestStatus.PENDING &&
      this.sessionService.isPendingRequestExpired(latestRequest)
    ) {
      latestRequest.status = AdminAccessRequestStatus.EXPIRED;
      latestRequest.resolvedAt = new Date();
      latestRequest.notes = latestRequest.notes ?? "Expired automatically";
      await this.accessRequestRepo.save(latestRequest);
      latestRequest = await this.findLatestAccessRequest(
        account.id,
        deviceInput.deviceId,
      );
    }

    if (
      existingDevice &&
      existingDevice.adminAccountId === account.id &&
      existingDevice.status === AdminDeviceStatus.APPROVED
    ) {
      existingDevice.deviceName = deviceInput.deviceName;
      existingDevice.platform = deviceInput.platform;
      existingDevice.browser = deviceInput.browser;
      existingDevice.userAgent = this.sessionService.getRequestUserAgent(req);
      existingDevice.ipLastSeen = this.sessionService.getRequestIp(req);
      existingDevice.lastSeenAt = new Date();
      await this.deviceRepo.save(existingDevice);

      account.lastLoginAt = new Date();
      await this.accountRepo.save(account);
      await this.sessionService.issueActiveSession(
        reply,
        account,
        existingDevice,
      );

      await this.auditService.log({
        actorAdminAccountId: account.id,
        actorDeviceId: existingDevice.id,
        actionType: "LOGIN_SUCCEEDED",
        targetType: "ADMIN_ACCOUNT",
        targetId: account.id,
        description: "Inicio de sesión administrativo exitoso",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
      });

      this.resetRateLimit("admin-login", req, username);

      return {
        status: "ACTIVE",
        account: this.sessionService.serializeAccount(account),
        device: this.sessionService.serializeDevice(existingDevice),
      };
    }

    if (
      existingDevice &&
      existingDevice.adminAccountId === account.id &&
      existingDevice.status === AdminDeviceStatus.REVOKED &&
      this.sessionService.isRetryBlockedByRevocation(existingDevice)
    ) {
      await this.sessionService.issueRevokedSession(
        reply,
        account,
        existingDevice.deviceId,
        latestRequest?.id,
      );

      this.resetRateLimit("admin-login", req, username);

      return {
        status: "REVOKED",
        account: this.sessionService.serializeAccount(account),
        device: this.sessionService.serializeDevice(existingDevice),
        accessRequest: latestRequest
          ? {
              id: latestRequest.id,
              status: latestRequest.status,
              requestedAt: latestRequest.requestedAt,
              resolvedAt: latestRequest.resolvedAt,
            }
          : undefined,
      };
    }

    if (
      latestRequest?.status === AdminAccessRequestStatus.REJECTED &&
      this.sessionService.isRetryBlockedByRequest(latestRequest)
    ) {
      if (
        existingDevice &&
        existingDevice.adminAccountId === account.id &&
        existingDevice.status !== AdminDeviceStatus.REVOKED
      ) {
        existingDevice.status = AdminDeviceStatus.REJECTED;
        existingDevice.trustedTokenHash = null;
        await this.deviceRepo.save(existingDevice);
      }

      await this.sessionService.issueRejectedSession(
        reply,
        account,
        deviceInput.deviceId,
        latestRequest.id,
      );

      this.resetRateLimit("admin-login", req, username);

      return {
        status: "REJECTED",
        account: this.sessionService.serializeAccount(account),
        device:
          existingDevice && existingDevice.adminAccountId === account.id
            ? this.sessionService.serializeDevice(existingDevice)
            : undefined,
        accessRequest: {
          id: latestRequest.id,
          status: latestRequest.status,
          requestedAt: latestRequest.requestedAt,
          resolvedAt: latestRequest.resolvedAt,
        },
      };
    }

    const pendingRequest = await this.findPendingAccessRequest(
      account.id,
      deviceInput.deviceId,
    );

    if (pendingRequest) {
      await this.sessionService.issuePendingSession(
        reply,
        account,
        pendingRequest,
      );

      this.resetRateLimit("admin-login", req, username);

      return {
        status: "PENDING",
        account: this.sessionService.serializeAccount(account),
        device:
          existingDevice && existingDevice.adminAccountId === account.id
            ? this.sessionService.serializeDevice(existingDevice)
            : undefined,
        accessRequest: {
          id: pendingRequest.id,
          status: pendingRequest.status,
          requestedAt: pendingRequest.requestedAt,
          resolvedAt: pendingRequest.resolvedAt,
        },
      };
    }

    const device = await this.upsertPendingDevice(account, deviceInput, req);
    const accessRequest = await this.createPendingAccessRequest(
      account,
      device,
      req,
    );

    await this.sessionService.issuePendingSession(
      reply,
      account,
      accessRequest,
    );

    await this.auditService.log({
      actorAdminAccountId: account.id,
      actorDeviceId: device.id,
      actionType: "ACCESS_REQUEST_CREATED",
      targetType: "ADMIN_ACCESS_REQUEST",
      targetId: accessRequest.id,
      description: "Dispositivo en espera de aprobación",
      ip: this.sessionService.getRequestIp(req),
      userAgent: this.sessionService.getRequestUserAgent(req),
      metadata: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      },
    });

    this.resetRateLimit("admin-login", req, username);

    return {
      status: "PENDING",
      account: this.sessionService.serializeAccount(account),
      device: this.sessionService.serializeDevice(device),
      accessRequest: {
        id: accessRequest.id,
        status: accessRequest.status,
        requestedAt: accessRequest.requestedAt,
        resolvedAt: accessRequest.resolvedAt,
      },
    };
  }

  async logout(req: AdminRequest, reply: FastifyReply) {
    const payload = await this.sessionService.readSession(req);

    if (payload) {
      const device = await this.deviceRepo.findOne({
        where: {
          deviceId: payload.deviceId,
          adminAccountId: payload.accountId,
        },
      });

      if (device?.trustedTokenHash) {
        device.trustedTokenHash = null;
        await this.deviceRepo.save(device);
      }

      await this.auditService.log({
        actorAdminAccountId: payload.accountId,
        actorDeviceId: device?.id ?? null,
        actionType: "LOGOUT",
        targetType: "ADMIN_ACCOUNT",
        targetId: payload.accountId,
        description: "Cierre de sesión administrativo",
        ip: this.sessionService.getRequestIp(req),
        userAgent: this.sessionService.getRequestUserAgent(req),
      });
    }

    this.sessionService.clearAuthCookies(reply);
    return { success: true };
  }

  private async findLatestAccessRequest(accountId: string, deviceId: string) {
    return this.accessRequestRepo.findOne({
      where: {
        adminAccountId: accountId,
        deviceId,
      },
      order: { requestedAt: "DESC" },
    });
  }

  private async findPendingAccessRequest(accountId: string, deviceId: string) {
    const request = await this.accessRequestRepo.findOne({
      where: {
        adminAccountId: accountId,
        deviceId,
        status: AdminAccessRequestStatus.PENDING,
      },
      order: { requestedAt: "DESC" },
    });

    if (request && this.sessionService.isPendingRequestExpired(request)) {
      request.status = AdminAccessRequestStatus.EXPIRED;
      request.resolvedAt = new Date();
      request.notes = request.notes ?? "Expired automatically";
      await this.accessRequestRepo.save(request);
      return null;
    }

    return request;
  }

  private async upsertPendingDevice(
    account: AdminAccount,
    deviceInput: DeviceInput,
    req: AdminRequest,
  ) {
    const device =
      (await this.deviceRepo.findOne({
        where: { deviceId: deviceInput.deviceId },
      })) ??
      this.deviceRepo.create({
        deviceId: deviceInput.deviceId,
      });

    device.adminAccountId = account.id;
    device.deviceName = deviceInput.deviceName;
    device.platform = deviceInput.platform;
    device.browser = deviceInput.browser;
    device.userAgent = this.sessionService.getRequestUserAgent(req);
    device.ipLastSeen = this.sessionService.getRequestIp(req);
    device.status = AdminDeviceStatus.PENDING;
    device.roleScope = AdminDeviceScope.APPROVED_DEVICE;
    device.trustedTokenHash = null;
    device.approvedByDeviceId = null;
    device.approvedAt = null;
    device.revokedAt = null;
    device.lastSeenAt = new Date();

    return this.deviceRepo.save(device);
  }

  private async createPendingAccessRequest(
    account: AdminAccount,
    device: AdminDevice,
    req: AdminRequest,
  ) {
    return this.accessRequestRepo.save(
      this.accessRequestRepo.create({
        requestedUsername: account.username,
        adminAccountId: account.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        platform: device.platform,
        browser: device.browser,
        userAgent: device.userAgent,
        ip: this.sessionService.getRequestIp(req),
        status: AdminAccessRequestStatus.PENDING,
      }),
    );
  }

  /**
   * Crea o actualiza un dispositivo dejándolo como APPROVED, vinculado
   * al `account` indicado. Usado por el modo relajado de verificación
   * de dispositivos (ADMIN_DEVICE_VERIFICATION_DISABLED).
   *
   * Si el dispositivo ya existía con `roleScope = ROOT_DEVICE`, se
   * preserva ese roleScope (no degradamos un root device existente).
   */
  private async upsertDeviceAsApproved(
    existingDevice: AdminDevice | null,
    account: AdminAccount,
    deviceInput: DeviceInput,
    req: AdminRequest,
  ): Promise<AdminDevice> {
    const now = new Date();
    const ip = this.sessionService.getRequestIp(req);
    const userAgent = this.sessionService.getRequestUserAgent(req);

    if (existingDevice) {
      existingDevice.adminAccountId = account.id;
      existingDevice.deviceName = deviceInput.deviceName;
      existingDevice.platform = deviceInput.platform;
      existingDevice.browser = deviceInput.browser;
      existingDevice.userAgent = userAgent;
      existingDevice.ipLastSeen = ip;
      existingDevice.lastSeenAt = now;
      existingDevice.status = AdminDeviceStatus.APPROVED;
      if (!existingDevice.approvedAt) existingDevice.approvedAt = now;
      // Si era ROOT_DEVICE, mantenemos. Si no, dejamos APPROVED_DEVICE.
      if (existingDevice.roleScope !== AdminDeviceScope.ROOT_DEVICE) {
        existingDevice.roleScope = AdminDeviceScope.APPROVED_DEVICE;
      }
      existingDevice.revokedAt = null;
      return this.deviceRepo.save(existingDevice);
    }

    return this.deviceRepo.save(
      this.deviceRepo.create({
        adminAccountId: account.id,
        deviceId: deviceInput.deviceId,
        deviceName: deviceInput.deviceName,
        platform: deviceInput.platform,
        browser: deviceInput.browser,
        userAgent,
        ipLastSeen: ip,
        roleScope: AdminDeviceScope.APPROVED_DEVICE,
        status: AdminDeviceStatus.APPROVED,
        approvedAt: now,
        lastSeenAt: now,
      }),
    );
  }
}
