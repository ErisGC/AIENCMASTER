import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { AdminAccount } from "./admin-account.entity";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AdminChurchAssignment } from "./admin-church-assignment.entity";
import { AdminSessionService } from "./admin-session.service";
import { AdminDevice } from "./admin_device.entity";
import { CreateAdminAccountDto } from "./dto/create-admin-account.dto";
import { QueryAuditLogDto } from "./dto/query-audit-log.dto";
import { ResetAdminPasswordDto } from "./dto/reset-admin-password.dto";
import { ResolveAccessRequestDto } from "./dto/resolve-access-request.dto";
import { UpdateAdminAccountDto } from "./dto/update-admin-account.dto";
import { AdminAccessRequestStatus } from "./enums/admin-access-request-status.enum";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";
import {
  ALL_CHURCH_PERMISSIONS,
  ChurchPermission,
  GlobalPermission,
  PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
} from "./permissions/permission.enums";
import { AuthenticatedAdminContext } from "./admin-security.types";
import { Church } from "../churches/church.entity";

@Injectable()
export class AdminSecurityService {
  constructor(
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    @InjectRepository(AdminDevice)
    private readonly deviceRepo: Repository<AdminDevice>,
    @InjectRepository(AdminAccessRequest)
    private readonly accessRequestRepo: Repository<AdminAccessRequest>,
    @InjectRepository(AdminActionLog)
    private readonly auditRepo: Repository<AdminActionLog>,
    @InjectRepository(AdminChurchAssignment)
    private readonly assignmentRepo: Repository<AdminChurchAssignment>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    private readonly dataSource: DataSource,
    private readonly sessionService: AdminSessionService,
    private readonly auditService: AdminAuditService,
  ) {}

  private serializeAccount(account: AdminAccount) {
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      isActive: account.isActive,
      // Mantenido por compatibilidad UI vieja.
      assignedChurchId: account.assignedChurchId ?? null,
      assignedChurchName: account.assignedChurch?.name ?? null,
      // Permisos efectivos.
      globalPermissions:
        account.role === AdminRole.ROOT
          ? Object.values(GlobalPermission)
          : (account.globalPermissions ?? []),
      churchAssignments:
        account.churchAssignments?.map((a) => ({
          id: a.id,
          churchId: a.churchId,
          churchName: a.church?.name ?? null,
          permissions: a.permissions ?? [],
        })) ?? [],
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      devices:
        account.devices?.map((device) => ({
          id: device.id,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          status: device.status,
          roleScope: device.roleScope,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        })) ?? [],
    };
  }

  private serializeDevice(device: AdminDevice) {
    return {
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      browser: device.browser,
      userAgent: device.userAgent,
      ipLastSeen: device.ipLastSeen,
      roleScope: device.roleScope,
      status: device.status,
      approvedAt: device.approvedAt?.toISOString() ?? null,
      revokedAt: device.revokedAt?.toISOString() ?? null,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
      adminAccount: device.adminAccount
        ? {
            id: device.adminAccount.id,
            username: device.adminAccount.username,
            displayName: device.adminAccount.displayName,
            role: device.adminAccount.role,
          }
        : null,
    };
  }

  private serializeAccessRequest(request: AdminAccessRequest) {
    return {
      id: request.id,
      requestedUsername: request.requestedUsername,
      deviceId: request.deviceId,
      deviceName: request.deviceName,
      platform: request.platform,
      browser: request.browser,
      userAgent: request.userAgent,
      ip: request.ip,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      notes: request.notes,
      adminAccount: request.adminAccount
        ? {
            id: request.adminAccount.id,
            username: request.adminAccount.username,
            displayName: request.adminAccount.displayName,
            role: request.adminAccount.role,
          }
        : null,
    };
  }

  private async expirePendingAccessRequests() {
    const cutoff = new Date(
      Date.now() - this.sessionService.accessRequestTtlSeconds * 1000,
    );

    await this.accessRequestRepo
      .createQueryBuilder()
      .update(AdminAccessRequest)
      .set({
        status: AdminAccessRequestStatus.EXPIRED,
        resolvedAt: new Date(),
        notes: "Expired automatically",
      })
      .where("status = :status", {
        status: AdminAccessRequestStatus.PENDING,
      })
      .andWhere('"requestedAt" < :cutoff', { cutoff })
      .execute();
  }

  private async ensurePendingRequestCanBeResolved(
    request: AdminAccessRequest,
    requestRepo: Repository<AdminAccessRequest>,
  ) {
    if (request.status !== AdminAccessRequestStatus.PENDING) {
      throw new BadRequestException(
        "Only pending access requests can be processed",
      );
    }

    if (this.sessionService.isPendingRequestExpired(request)) {
      request.status = AdminAccessRequestStatus.EXPIRED;
      request.resolvedAt = new Date();
      request.notes = request.notes ?? "Expired automatically";
      await requestRepo.save(request);
      throw new BadRequestException("The access request has already expired");
    }
  }

  async getSummary() {
    await this.expirePendingAccessRequests();

    const [adminAccounts, approvedDevices, pendingRequests, revokedDevices] =
      await Promise.all([
        this.accountRepo.count(),
        this.deviceRepo.count({
          where: { status: AdminDeviceStatus.APPROVED },
        }),
        this.accessRequestRepo.count({
          where: { status: AdminAccessRequestStatus.PENDING },
        }),
        this.deviceRepo.find({
          where: { status: AdminDeviceStatus.REVOKED },
          order: { revokedAt: "DESC" },
          take: 5,
        }),
      ]);

    return {
      adminAccounts,
      approvedDevices,
      pendingRequests,
      recentRevokedDevices: revokedDevices.map((device) => ({
        id: device.id,
        deviceName: device.deviceName,
        revokedAt: device.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  async getPendingAccessRequests() {
    await this.expirePendingAccessRequests();

    return this.accessRequestRepo
      .find({
        where: { status: AdminAccessRequestStatus.PENDING },
        relations: { adminAccount: true },
        order: { requestedAt: "DESC" },
      })
      .then((requests) =>
        requests.map((request) => this.serializeAccessRequest(request)),
      );
  }

  async approveAccessRequest(
    requestId: string,
    dto: ResolveAccessRequestDto,
    actor: AuthenticatedAdminContext,
  ) {
    return this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const requestRepo = manager.getRepository(AdminAccessRequest);
      const deviceRepo = manager.getRepository(AdminDevice);
      const auditRepo = manager.getRepository(AdminActionLog);

      const request = await requestRepo.findOne({
        where: { id: requestId },
        relations: { adminAccount: true },
      });

      if (!request) {
        throw new NotFoundException("Access request not found");
      }

      if (!request.adminAccountId || !request.adminAccount) {
        throw new BadRequestException(
          "Access request is not linked to an account",
        );
      }

      await this.ensurePendingRequestCanBeResolved(request, requestRepo);

      const existingDevice = await deviceRepo.findOne({
        where: { deviceId: request.deviceId },
      });

      if (
        existingDevice?.adminAccountId &&
        existingDevice.adminAccountId !== request.adminAccountId
      ) {
        throw new ConflictException(
          "This device is already bound to a different admin account.",
        );
      }

      const device =
        existingDevice ??
        deviceRepo.create({
          deviceId: request.deviceId,
        });

      request.status = AdminAccessRequestStatus.APPROVED;
      request.resolvedAt = new Date();
      request.resolvedByDeviceId = actor.device.id;
      request.notes = dto.notes?.trim() ?? null;
      await requestRepo.save(request);

      device.adminAccountId = request.adminAccountId;
      device.deviceName = request.deviceName;
      device.platform = request.platform;
      device.browser = request.browser;
      device.userAgent = request.userAgent;
      device.ipLastSeen = request.ip;
      device.status = AdminDeviceStatus.APPROVED;
      device.roleScope = AdminDeviceScope.APPROVED_DEVICE;
      device.approvedAt = new Date();
      device.revokedAt = null;
      device.trustedTokenHash = null;
      device.approvedByDeviceId = actor.device.id;
      await deviceRepo.save(device);

      await this.auditService.log(
        {
          actorAdminAccountId: actor.account.id,
          actorDeviceId: actor.device.id,
          actionType: "ACCESS_REQUEST_APPROVED",
          targetType: "ADMIN_ACCESS_REQUEST",
          targetId: request.id,
          description: `Solicitud aprobada para ${request.deviceName}`,
          metadata: {
            deviceId: request.deviceId,
            adminAccountId: request.adminAccountId,
          },
        },
        auditRepo,
      );

      return {
        request: this.serializeAccessRequest(request),
        device: this.serializeDevice(device),
      };
    });
  }

  async rejectAccessRequest(
    requestId: string,
    dto: ResolveAccessRequestDto,
    actor: AuthenticatedAdminContext,
  ) {
    return this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const requestRepo = manager.getRepository(AdminAccessRequest);
      const deviceRepo = manager.getRepository(AdminDevice);
      const auditRepo = manager.getRepository(AdminActionLog);

      const request = await requestRepo.findOne({
        where: { id: requestId },
        relations: { adminAccount: true },
      });

      if (!request) {
        throw new NotFoundException("Access request not found");
      }

      if (!request.adminAccountId || !request.adminAccount) {
        throw new BadRequestException(
          "Access request is not linked to an account",
        );
      }

      await this.ensurePendingRequestCanBeResolved(request, requestRepo);

      const existingDevice = await deviceRepo.findOne({
        where: { deviceId: request.deviceId },
      });

      if (
        existingDevice?.adminAccountId &&
        existingDevice.adminAccountId !== request.adminAccountId
      ) {
        throw new ConflictException(
          "This device is already bound to a different admin account.",
        );
      }

      const device =
        existingDevice ??
        deviceRepo.create({
          deviceId: request.deviceId,
        });

      request.status = AdminAccessRequestStatus.REJECTED;
      request.resolvedAt = new Date();
      request.resolvedByDeviceId = actor.device.id;
      request.notes = dto.notes?.trim() ?? null;
      await requestRepo.save(request);

      device.adminAccountId = request.adminAccountId;
      device.deviceName = request.deviceName;
      device.platform = request.platform;
      device.browser = request.browser;
      device.userAgent = request.userAgent;
      device.ipLastSeen = request.ip;
      device.status = AdminDeviceStatus.REJECTED;
      device.roleScope = AdminDeviceScope.APPROVED_DEVICE;
      device.revokedAt = null;
      device.approvedAt = null;
      device.trustedTokenHash = null;
      device.approvedByDeviceId = null;
      await deviceRepo.save(device);

      await this.auditService.log(
        {
          actorAdminAccountId: actor.account.id,
          actorDeviceId: actor.device.id,
          actionType: "ACCESS_REQUEST_REJECTED",
          targetType: "ADMIN_ACCESS_REQUEST",
          targetId: request.id,
          description: `Solicitud rechazada para ${request.deviceName}`,
          metadata: {
            deviceId: request.deviceId,
            adminAccountId: request.adminAccountId,
          },
        },
        auditRepo,
      );

      return {
        request: this.serializeAccessRequest(request),
        device: this.serializeDevice(device),
      };
    });
  }

  getDevices() {
    return this.deviceRepo
      .find({
        relations: { adminAccount: true },
        order: { updatedAt: "DESC" },
      })
      .then((devices) => devices.map((device) => this.serializeDevice(device)));
  }

  async revokeDevice(deviceRecordId: string, actor: AuthenticatedAdminContext) {
    const device = await this.deviceRepo.findOne({
      where: { id: deviceRecordId },
      relations: { adminAccount: true },
    });

    if (!device) {
      throw new NotFoundException("Device not found");
    }

    if (device.roleScope === AdminDeviceScope.ROOT_DEVICE) {
      throw new BadRequestException("The root device cannot be revoked");
    }

    if (device.status === AdminDeviceStatus.REVOKED) {
      throw new BadRequestException("The device is already revoked");
    }

    device.status = AdminDeviceStatus.REVOKED;
    device.revokedAt = new Date();
    device.trustedTokenHash = null;
    await this.deviceRepo.save(device);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "DEVICE_REVOKED",
      targetType: "ADMIN_DEVICE",
      targetId: device.id,
      description: `Dispositivo revocado: ${device.deviceName}`,
      metadata: {
        deviceId: device.deviceId,
        adminAccountId: device.adminAccountId,
      },
    });

    return this.serializeDevice(device);
  }

  getAccounts() {
    return this.accountRepo
      .find({
        relations: {
          devices: true,
          assignedChurch: true,
          churchAssignments: { church: true },
        },
        order: { createdAt: "ASC" },
      })
      .then((accounts) =>
        accounts.map((account) => this.serializeAccount(account)),
      );
  }

  /**
   * Devuelve todas las acciones registradas en `AdminActionLog` por el admin
   * indicado. Útil para que el ROOT haga seguimiento de cada cuenta.
   */
  async getAccountHistory(accountId: string) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
      relations: {
        assignedChurch: true,
        churchAssignments: { church: true },
        devices: true,
      },
    });
    if (!account) {
      throw new NotFoundException("Cuenta no encontrada");
    }

    const logs = await this.auditRepo.find({
      where: { actorAdminAccountId: accountId },
      order: { createdAt: "DESC" },
      take: 500,
    });

    return {
      account: this.serializeAccount(account),
      actions: logs.map((log) => ({
        id: log.id,
        actionType: log.actionType,
        targetType: log.targetType,
        targetId: log.targetId,
        description: log.description,
        ip: log.ip,
        userAgent: log.userAgent,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async createAdminAccount(
    dto: CreateAdminAccountDto,
    actor: AuthenticatedAdminContext,
  ) {
    if (dto.role !== AdminRole.ADMIN) {
      throw new BadRequestException(
        "Only ADMIN accounts can be created from the panel",
      );
    }

    const existing = await this.accountRepo.findOne({
      where: { username: dto.username.trim().toLowerCase() },
    });

    if (existing) {
      throw new BadRequestException("Username already exists");
    }

    if (dto.assignedChurchId) {
      const church = await this.churchRepo.findOne({
        where: { id: dto.assignedChurchId },
      });
      if (!church) throw new NotFoundException("Iglesia no encontrada");
    }

    const passwordHash = await this.sessionService.hashPassword(dto.password);

    // La cuenta y su asignación de iglesia se guardan juntas.
    //
    // Antes sólo se escribía `assignedChurchId`, que es el campo antiguo; los
    // permisos por iglesia se leen de `admin_church_assignments`, así que la
    // cuenta recién creada no podía hacer nada hasta que el servidor se
    // reiniciaba: en ese arranque, el migrador veía el campo suelto y le creaba
    // la asignación con TODOS los permisos. Es decir, la cuenta pasaba de
    // inservible a tenerlo todo sin que nadie lo decidiera.
    const account = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(AdminAccount).save(
        manager.getRepository(AdminAccount).create({
          username: dto.username.trim().toLowerCase(),
          passwordHash,
          displayName: dto.displayName.trim(),
          role: AdminRole.ADMIN,
          isActive: true,
          tokenVersion: 1,
          assignedChurchId: dto.assignedChurchId ?? null,
        }),
      );

      if (dto.assignedChurchId) {
        const assignmentRepo = manager.getRepository(AdminChurchAssignment);
        await assignmentRepo.save(
          assignmentRepo.create({
            adminAccountId: saved.id,
            churchId: dto.assignedChurchId,
            // Mismo criterio que las invitaciones: entra con los permisos de
            // su iglesia y el principal los recorta desde la pantalla de
            // permisos. Se decide aquí, no en un arranque posterior.
            permissions: [...ALL_CHURCH_PERMISSIONS],
          }),
        );
      }

      return saved;
    });

    // La auditoría va fuera de la transacción: si fallara dentro, dejaría la
    // transacción abortada y el guardado se perdería en silencio.
    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_ACCOUNT_CREATED",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: `Cuenta admin creada: ${account.username}`,
      metadata: dto.assignedChurchId
        ? { churchId: dto.assignedChurchId, permissions: ALL_CHURCH_PERMISSIONS }
        : undefined,
    });

    return this.getAccountWithAssignments(account.id);
  }

  async updateAdminAccount(
    accountId: string,
    dto: UpdateAdminAccountDto,
    actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException("Admin account not found");
    }

    const wasActive = account.isActive;

    if (account.role === AdminRole.ROOT && dto.isActive === false) {
      throw new BadRequestException("The root account cannot be deactivated");
    }

    if (dto.displayName !== undefined) {
      account.displayName = dto.displayName.trim();
    }

    if (dto.isActive !== undefined) {
      account.isActive = dto.isActive;
    }

    // Cambiar la iglesia asignada debe crear también la asignación real, que
    // es de donde salen los permisos. Sin esto, la cuenta quedaba sin permisos
    // sobre la iglesia nueva hasta el siguiente reinicio del servidor.
    let asignacionNueva: string | null = null;
    if (dto.assignedChurchId !== undefined && account.role !== AdminRole.ROOT) {
      if (dto.assignedChurchId) {
        const church = await this.churchRepo.findOne({
          where: { id: dto.assignedChurchId },
        });
        if (!church) throw new NotFoundException("Iglesia no encontrada");

        const yaAsignada = await this.assignmentRepo.findOne({
          where: { adminAccountId: account.id, churchId: dto.assignedChurchId },
        });
        if (!yaAsignada) asignacionNueva = dto.assignedChurchId;
      }
      account.assignedChurchId = dto.assignedChurchId ?? null;
    }

    await this.accountRepo.save(account);

    if (asignacionNueva) {
      await this.assignmentRepo.save(
        this.assignmentRepo.create({
          adminAccountId: account.id,
          churchId: asignacionNueva,
          permissions: [...ALL_CHURCH_PERMISSIONS],
        }),
      );
    }

    const actionType =
      dto.isActive === false && wasActive
        ? "ADMIN_ACCOUNT_DEACTIVATED"
        : dto.isActive === true && !wasActive
          ? "ADMIN_ACCOUNT_REACTIVATED"
          : "ADMIN_ACCOUNT_UPDATED";

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType,
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: `Cuenta admin actualizada: ${account.username}`,
      metadata: {
        isActive: account.isActive,
        displayName: account.displayName,
      },
    });

    // Con las asignaciones cargadas, para que el panel vea de inmediato la
    // iglesia que se acaba de asignar.
    return this.getAccountWithAssignments(account.id);
  }

  async resetAdminPassword(
    accountId: string,
    dto: ResetAdminPasswordDto,
    actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException("Admin account not found");
    }

    account.passwordHash = await this.sessionService.hashPassword(dto.password);
    account.tokenVersion += 1;
    await this.accountRepo.save(account);
    await this.deviceRepo
      .createQueryBuilder()
      .update(AdminDevice)
      .set({ trustedTokenHash: null })
      .where("adminAccountId = :adminAccountId", { adminAccountId: account.id })
      .execute();

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_PASSWORD_RESET",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: `Contraseña reseteada para ${account.username}`,
    });

    return { success: true };
  }

  async getAuditLogs(query: QueryAuditLogDto) {
    const qb = this.auditRepo
      .createQueryBuilder("log")
      .leftJoinAndSelect("log.actorAdminAccount", "actorAdminAccount")
      .leftJoinAndSelect("log.actorDevice", "actorDevice")
      .orderBy("log.createdAt", "DESC")
      .take(200);

    if (query.actionType) {
      qb.andWhere("log.actionType = :actionType", {
        actionType: query.actionType,
      });
    }

    if (query.actorAdminAccountId) {
      qb.andWhere("log.actorAdminAccountId = :actorAdminAccountId", {
        actorAdminAccountId: query.actorAdminAccountId,
      });
    }

    return qb.getMany().then((logs) =>
      logs.map((log) => ({
        id: log.id,
        actionType: log.actionType,
        targetType: log.targetType,
        targetId: log.targetId,
        description: log.description,
        ip: log.ip,
        userAgent: log.userAgent,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        actorAdminAccount: log.actorAdminAccount
          ? {
              id: log.actorAdminAccount.id,
              username: log.actorAdminAccount.username,
              displayName: log.actorAdminAccount.displayName,
              role: log.actorAdminAccount.role,
            }
          : null,
        actorDevice: log.actorDevice
          ? {
              id: log.actorDevice.id,
              deviceName: log.actorDevice.deviceName,
              deviceId: log.actorDevice.deviceId,
            }
          : null,
      })),
    );
  }

  /* ────────── Permisos ────────── */

  /** Catálogo y templates legibles para el frontend. */
  getPermissionsCatalog() {
    return {
      catalog: PERMISSION_CATALOG,
      templates: PERMISSION_TEMPLATES,
    };
  }

  /** Modifica los permisos globales de un admin (no aplica a ROOT). */
  async updateGlobalPermissions(
    accountId: string,
    permissions: GlobalPermission[],
    actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException("Cuenta no encontrada");
    if (account.role === AdminRole.ROOT) {
      throw new BadRequestException(
        "La cuenta root tiene todos los permisos por defecto y no se editan aquí.",
      );
    }

    account.globalPermissions = Array.from(new Set(permissions));
    await this.accountRepo.save(account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_GLOBAL_PERMISSIONS_UPDATED",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description: `Permisos globales actualizados para @${account.username}`,
      metadata: { permissions: account.globalPermissions },
    });

    return this.getAccountWithAssignments(accountId);
  }

  /** Crea o reemplaza la asignación admin↔iglesia con sus permisos. */
  async assignChurch(
    accountId: string,
    churchId: string,
    permissions: ChurchPermission[],
    actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException("Cuenta no encontrada");
    if (account.role === AdminRole.ROOT) {
      throw new BadRequestException(
        "La cuenta root no requiere asignaciones; ya opera sobre todas las iglesias.",
      );
    }

    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    const dedup = Array.from(new Set(permissions));

    const existing = await this.assignmentRepo.findOne({
      where: { adminAccountId: accountId, churchId },
    });

    if (existing) {
      existing.permissions = dedup;
      await this.assignmentRepo.save(existing);

      await this.auditService.log({
        actorAdminAccountId: actor.account.id,
        actorDeviceId: actor.device.id,
        actionType: "ADMIN_CHURCH_PERMISSIONS_UPDATED",
        targetType: "ADMIN_CHURCH_ASSIGNMENT",
        targetId: existing.id,
        description: `Permisos actualizados de @${account.username} en iglesia ${church.name}`,
        metadata: { permissions: dedup, churchId },
      });

      return this.getAccountWithAssignments(accountId);
    }

    const created = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        adminAccountId: accountId,
        churchId,
        permissions: dedup,
      }),
    );

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_CHURCH_ASSIGNED",
      targetType: "ADMIN_CHURCH_ASSIGNMENT",
      targetId: created.id,
      description: `@${account.username} asignado a iglesia ${church.name}`,
      metadata: { permissions: dedup, churchId },
    });

    return this.getAccountWithAssignments(accountId);
  }

  /**
   * Cambia el rol de una cuenta existente (ADMIN ↔ ROOT).
   *
   * Reglas:
   *  - Sólo otra cuenta ROOT puede hacerlo (los guards del controller ya
   *    lo aseguran; aquí re-validamos en defensa en profundidad).
   *  - Una cuenta NO puede cambiar su propio rol — evita el caso de un
   *    ROOT que se auto-degrade por accidente o un ADMIN que mantuviera
   *    un JWT viejo intentando auto-promoverse.
   *  - Al promover ADMIN → ROOT: se vacían `globalPermissions` y se
   *    conservan las `AdminChurchAssignment` (no hacen daño y dan
   *    contexto histórico). El resolver de permisos ya devuelve "todo"
   *    para ROOTs.
   *  - Al degradar ROOT → ADMIN: el sistema rechaza si esto dejaría sin
   *    ningún ROOT activo (mínimo 1 ROOT debe existir siempre). Tampoco
   *    se ata a una iglesia por defecto — queda sin asignaciones y otro
   *    ROOT debe asignarle iglesias después.
   *  - El cambio fuerza un bump de `tokenVersion` → el JWT de la cuenta
   *    afectada queda invalidado inmediatamente y necesita re-login. Esto
   *    cierra la ventana de un degradado que sigue actuando como ROOT.
   *  - Se audita con actionType específico (ROLE_PROMOTED_TO_ROOT /
   *    ROLE_DEMOTED_TO_ADMIN) para que cualquier alerta SIEM lo detecte.
   */
  async updateAccountRole(
    accountId: string,
    newRole: AdminRole,
    actor: AuthenticatedAdminContext,
  ) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException("Cuenta no encontrada");

    // Defensa en profundidad: re-validamos el rol del actor contra la BD.
    const actorFresh = await this.accountRepo.findOne({
      where: { id: actor.account.id },
    });
    if (!actorFresh || actorFresh.role !== AdminRole.ROOT || !actorFresh.isActive) {
      throw new ForbiddenException(
        "Tu cuenta ya no es ROOT activa; no puedes cambiar roles.",
      );
    }

    if (accountId === actor.account.id) {
      throw new BadRequestException(
        "No puedes cambiar tu propio rol. Pide a otra cuenta ROOT que lo haga por ti.",
      );
    }

    if (account.role === newRole) {
      throw new BadRequestException(
        `La cuenta ya tiene el rol ${newRole}.`,
      );
    }

    // Protección "último ROOT": al degradar, contamos cuántos ROOTs activos
    // distintos del afectado quedarían. Si la cuenta a degradar es la única
    // ROOT activa, bloqueamos.
    if (newRole === AdminRole.ADMIN && account.role === AdminRole.ROOT) {
      const remainingRoots = await this.accountRepo.count({
        where: { role: AdminRole.ROOT, isActive: true },
      });
      // remainingRoots incluye al afectado; necesitamos al menos uno DIFERENTE
      if (remainingRoots <= 1) {
        throw new BadRequestException(
          "No se puede degradar al último administrador principal. Promueve a otra cuenta ROOT antes.",
        );
      }
    }

    const previousRole = account.role;
    account.role = newRole;
    if (newRole === AdminRole.ROOT) {
      // Limpiamos campos legados que sólo tienen sentido para ADMIN.
      account.globalPermissions = [];
      account.assignedChurchId = null;
    }
    // Bump de tokenVersion → cualquier JWT vigente queda inválido.
    account.tokenVersion = (account.tokenVersion ?? 1) + 1;
    await this.accountRepo.save(account);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType:
        newRole === AdminRole.ROOT
          ? "ROLE_PROMOTED_TO_ROOT"
          : "ROLE_DEMOTED_TO_ADMIN",
      targetType: "ADMIN_ACCOUNT",
      targetId: account.id,
      description:
        newRole === AdminRole.ROOT
          ? `Cuenta @${account.username} promovida a ROOT por @${actor.account.username}`
          : `Cuenta @${account.username} degradada de ROOT a ADMIN por @${actor.account.username}`,
      metadata: {
        username: account.username,
        previousRole,
        newRole,
        tokenVersion: account.tokenVersion,
      },
    });

    return this.getAccountWithAssignments(accountId);
  }

  /** Elimina la asignación admin↔iglesia. */
  async removeChurchAssignment(
    accountId: string,
    churchId: string,
    actor: AuthenticatedAdminContext,
  ) {
    const existing = await this.assignmentRepo.findOne({
      where: { adminAccountId: accountId, churchId },
    });
    if (!existing) {
      throw new NotFoundException("La asignación no existe");
    }

    await this.assignmentRepo.remove(existing);

    await this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType: "ADMIN_CHURCH_UNASSIGNED",
      targetType: "ADMIN_CHURCH_ASSIGNMENT",
      targetId: existing.id,
      description: `Asignación de iglesia retirada`,
      metadata: { churchId },
    });

    return this.getAccountWithAssignments(accountId);
  }

  private async getAccountWithAssignments(accountId: string) {
    const account = await this.accountRepo.findOne({
      where: { id: accountId },
      relations: {
        devices: true,
        assignedChurch: true,
        churchAssignments: { church: true },
      },
    });
    if (!account) throw new NotFoundException("Cuenta no encontrada");
    return this.serializeAccount(account);
  }
}
