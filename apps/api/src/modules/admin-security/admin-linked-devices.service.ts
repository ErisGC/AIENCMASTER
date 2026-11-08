import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AdminSecurityService } from "./admin-security.service";
import { AdminSessionService } from "./admin-session.service";
import type { AuthenticatedAdminContext } from "./admin-security.types";
import { AdminDevice } from "./admin_device.entity";
import { AdminAccessRequestStatus } from "./enums/admin-access-request-status.enum";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import {
  confirmCodeOptions,
  isAppDevice,
  isPrincipalDevice,
  linkedDeviceState,
} from "./linked-devices.rules";

/**
 * Sesiones y dispositivos vinculados de la propia cuenta, manejados desde la
 * app del teléfono (la llave): aprobar ingresos web con el número de
 * confirmación, rechazarlos, y ver, nombrar, pausar, cerrar o quitar cada
 * sesión.
 */
@Injectable()
export class AdminLinkedDevicesService {
  constructor(
    @InjectRepository(AdminDevice)
    private readonly deviceRepo: Repository<AdminDevice>,
    @InjectRepository(AdminAccessRequest)
    private readonly requestRepo: Repository<AdminAccessRequest>,
    private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
    private readonly sessionService: AdminSessionService,
    private readonly securityService: AdminSecurityService,
  ) {}

  /** Solo la app aprueba y administra sesiones (no un navegador). */
  private assertKey(actor: AuthenticatedAdminContext) {
    if (!isAppDevice(actor.device)) {
      throw new ForbiddenException(
        "Las sesiones se manejan desde la app AIENC Admin del teléfono.",
      );
    }
  }

  private serializeDevice(
    device: AdminDevice,
    actor: AuthenticatedAdminContext,
  ) {
    return {
      id: device.id,
      name: device.customName?.trim() || device.deviceName,
      deviceName: device.deviceName,
      customName: device.customName,
      clientKind: device.clientKind ?? "WEB",
      platform: device.platform,
      browser: device.browser,
      ip: device.ipLastSeen,
      state: linkedDeviceState(device),
      current: device.id === actor.device.id,
      principal: isPrincipalDevice(actor.account, device),
      ephemeral: device.ephemeral,
      approvedVia: device.approvedVia,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      approvedAt: device.approvedAt?.toISOString() ?? null,
      signedOutAt: device.signedOutAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
    };
  }

  async overview(actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const devices = await this.deviceRepo.find({
      where: { adminAccountId: actor.account.id },
    });
    const solicitudes = await this.requestRepo.find({
      where: {
        adminAccountId: actor.account.id,
        status: AdminAccessRequestStatus.PENDING,
        approvalChannel: "APP",
      },
      order: { requestedAt: "DESC" },
    });
    const pendientes = solicitudes.filter(
      (r) => r.confirmCode && !this.sessionService.isPendingRequestExpired(r),
    );
    const orden = (d: AdminDevice) =>
      d.id === actor.device.id
        ? Number.MAX_SAFE_INTEGER
        : (d.lastSeenAt?.getTime() ?? 0);
    return {
      devices: devices
        .filter((d) => d.status !== AdminDeviceStatus.PENDING)
        .sort((a, b) => orden(b) - orden(a))
        .map((d) => this.serializeDevice(d, actor)),
      pending: pendientes.map((r) => ({
        id: r.id,
        deviceName: r.deviceName,
        platform: r.platform,
        browser: r.browser,
        ip: r.ip,
        requestedAt: r.requestedAt.toISOString(),
        codeOptions: confirmCodeOptions(r.id, r.confirmCode as string),
      })),
    };
  }

  /** Aprueba un ingreso web de la propia cuenta, si el número coincide. */
  async approve(
    requestId: string,
    code: string,
    actor: AuthenticatedAdminContext,
  ) {
    this.assertKey(actor);
    const resultado = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        const requestRepo = manager.getRepository(AdminAccessRequest);
        const deviceRepo = manager.getRepository(AdminDevice);
        const auditRepo = manager.getRepository(AdminActionLog);

        const request = await requestRepo.findOne({ where: { id: requestId } });
        if (
          !request ||
          request.adminAccountId !== actor.account.id ||
          request.approvalChannel !== "APP"
        ) {
          throw new NotFoundException("Solicitud no encontrada");
        }
        if (
          request.status !== AdminAccessRequestStatus.PENDING ||
          this.sessionService.isPendingRequestExpired(request)
        ) {
          throw new ConflictException(
            "Esta solicitud ya no está vigente. Vuelve a ingresar en la web.",
          );
        }

        if (!request.confirmCode || request.confirmCode !== code.trim()) {
          // Número equivocado: se cancela para que no se pueda adivinar
          // probando. Se marca como vencida (no rechazada) para que la persona
          // pueda volver a intentarlo de inmediato.
          request.status = AdminAccessRequestStatus.EXPIRED;
          request.resolvedAt = new Date();
          request.resolvedByDeviceId = actor.device.id;
          request.notes = "Número de confirmación equivocado en la app";
          await requestRepo.save(request);
          await this.auditService.log(
            {
              actorAdminAccountId: actor.account.id,
              actorDeviceId: actor.device.id,
              actionType: "ACCESS_REQUEST_CODE_MISMATCH",
              targetType: "ADMIN_ACCESS_REQUEST",
              targetId: request.id,
              description: `Número equivocado al aprobar ${request.deviceName}; solicitud cancelada`,
              metadata: { deviceId: request.deviceId },
            },
            auditRepo,
          );
          return { mismatch: true as const };
        }

        const existing = await deviceRepo.findOne({
          where: { deviceId: request.deviceId },
        });
        if (
          existing?.adminAccountId &&
          existing.adminAccountId !== actor.account.id
        ) {
          throw new ConflictException(
            "Ese equipo ya está vinculado a otra cuenta administrativa.",
          );
        }
        const device =
          existing ?? deviceRepo.create({ deviceId: request.deviceId });

        request.status = AdminAccessRequestStatus.APPROVED;
        request.resolvedAt = new Date();
        request.resolvedByDeviceId = actor.device.id;
        request.notes = "Aprobado desde la app";
        await requestRepo.save(request);

        device.adminAccountId = actor.account.id;
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
        device.approvedVia = "APP";
        device.signedOutAt = null;
        device.pausedAt = null;
        device.windowClosedAt = null;
        await deviceRepo.save(device);

        await this.auditService.log(
          {
            actorAdminAccountId: actor.account.id,
            actorDeviceId: actor.device.id,
            actionType: "ACCESS_REQUEST_APPROVED_BY_APP",
            targetType: "ADMIN_ACCESS_REQUEST",
            targetId: request.id,
            description: `Ingreso aprobado desde la app: ${request.deviceName}`,
            metadata: { deviceId: request.deviceId },
          },
          auditRepo,
        );
        return { mismatch: false as const };
      },
    );

    if (resultado.mismatch) {
      throw new BadRequestException(
        "El número no coincide. Por seguridad se canceló la solicitud: vuelve a ingresar en la web.",
      );
    }
    return this.overview(actor);
  }

  /** "No fui yo": rechaza el ingreso de la propia cuenta. */
  async reject(requestId: string, actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request || request.adminAccountId !== actor.account.id) {
      throw new NotFoundException("Solicitud no encontrada");
    }
    await this.securityService.rejectAccessRequest(
      requestId,
      { notes: "Rechazado desde la app" },
      actor,
    );
    return this.overview(actor);
  }

  private async propio(
    deviceRecordId: string,
    actor: AuthenticatedAdminContext,
  ) {
    const device = await this.deviceRepo.findOne({
      where: { id: deviceRecordId },
    });
    if (!device || device.adminAccountId !== actor.account.id) {
      throw new NotFoundException("Dispositivo no encontrado");
    }
    return device;
  }

  private noEsEste(device: AdminDevice, actor: AuthenticatedAdminContext) {
    if (device.id === actor.device.id) {
      throw new BadRequestException(
        "Este es el teléfono que estás usando. Para salir, usa Cerrar sesión.",
      );
    }
  }

  async rename(
    deviceRecordId: string,
    name: string,
    actor: AuthenticatedAdminContext,
  ) {
    this.assertKey(actor);
    const device = await this.propio(deviceRecordId, actor);
    const limpio = name.trim().slice(0, 60);
    device.customName = limpio.length > 0 ? limpio : null;
    await this.deviceRepo.save(device);
    return this.overview(actor);
  }

  async pause(deviceRecordId: string, actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const device = await this.propio(deviceRecordId, actor);
    this.noEsEste(device, actor);
    if (device.status !== AdminDeviceStatus.APPROVED) {
      throw new BadRequestException("Solo se pausa una sesión abierta.");
    }
    device.pausedAt = new Date();
    await this.deviceRepo.save(device);
    await this.log(
      actor,
      device,
      "DEVICE_PAUSED",
      "Sesión pausada desde la app",
    );
    return this.overview(actor);
  }

  async resume(deviceRecordId: string, actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const device = await this.propio(deviceRecordId, actor);
    device.pausedAt = null;
    await this.deviceRepo.save(device);
    await this.log(
      actor,
      device,
      "DEVICE_RESUMED",
      "Sesión reactivada desde la app",
    );
    return this.overview(actor);
  }

  /** Cierra la sesión de ese equipo: para volver a entrar hay que aprobarlo. */
  async signOut(deviceRecordId: string, actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const device = await this.propio(deviceRecordId, actor);
    this.noEsEste(device, actor);
    if (device.status === AdminDeviceStatus.APPROVED) {
      device.status = AdminDeviceStatus.SIGNED_OUT;
      device.signedOutAt = new Date();
      device.trustedTokenHash = null;
      device.pausedAt = null;
      if (device.roleScope === AdminDeviceScope.ROOT_DEVICE) {
        device.roleScope = AdminDeviceScope.APPROVED_DEVICE;
      }
      await this.deviceRepo.save(device);
      await this.log(
        actor,
        device,
        "DEVICE_SIGNED_OUT_BY_APP",
        "Sesión cerrada desde la app",
      );
    }
    return this.overview(actor);
  }

  /** Quita el equipo de la lista (si estaba abierto, su sesión termina). */
  async remove(deviceRecordId: string, actor: AuthenticatedAdminContext) {
    this.assertKey(actor);
    const device = await this.propio(deviceRecordId, actor);
    this.noEsEste(device, actor);
    await this.log(
      actor,
      device,
      "DEVICE_REMOVED_BY_APP",
      "Dispositivo quitado desde la app",
    );
    await this.deviceRepo.remove(device);
    return this.overview(actor);
  }

  private log(
    actor: AuthenticatedAdminContext,
    device: AdminDevice,
    actionType: string,
    description: string,
  ) {
    return this.auditService.log({
      actorAdminAccountId: actor.account.id,
      actorDeviceId: actor.device.id,
      actionType,
      targetType: "ADMIN_DEVICE",
      targetId: device.id,
      description: `${description}: ${device.customName ?? device.deviceName}`,
      metadata: { deviceId: device.deviceId },
    });
  }
}
