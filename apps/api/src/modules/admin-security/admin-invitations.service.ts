import { randomBytes, createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource, Repository } from "typeorm";

import { Church } from "../churches/church.entity";
import { AdminAccount } from "./admin-account.entity";
import { AdminChurchAssignment } from "./admin-church-assignment.entity";
import {
  AdminInvitation,
  AdminInvitationStatus,
} from "./admin-invitation.entity";
import { AdminRole } from "./enums/admin-role.enum";
import {
  ALL_CHURCH_PERMISSIONS,
  ChurchPermission,
  GlobalPermission,
} from "./permissions/permission.enums";

const INVITATION_TTL_HOURS = 72;
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export interface CreateInvitationInput {
  username: string;
  displayName: string;
  /** Obligatorio para ADMIN; ignorado para ROOT. */
  assignedChurchId?: string | null;
  createdByAdminAccountId: string;
  /**
   * Rol del actor (ROOT/ADMIN) que está creando la invitación. El servicio
   * lo valida internamente para defensa en profundidad — aunque los guards
   * en el controller ya garantizan que sólo ROOT entra aquí, una segunda
   * verificación en la capa de servicio impide que cualquier otra llamada
   * (interna, tests, scripts) cree una invitación ROOT sin tener rol ROOT.
   */
  createdByAdminAccountRole: AdminRole;
  /** Rol con el que se creará la cuenta al aceptar. Default ADMIN. */
  targetRole?: AdminRole;
  /** Permisos pre-asignados sobre la iglesia. Ignorado para ROOT. */
  churchPermissions?: ChurchPermission[];
  /** Permisos globales pre-asignados (opcional). Ignorado para ROOT. */
  globalPermissions?: GlobalPermission[];
}

export interface InvitationWithToken {
  id: string;
  token: string;
  username: string;
  displayName: string;
  assignedChurchId: string | null;
  targetRole: AdminRole;
  expiresAt: Date;
}

@Injectable()
export class AdminInvitationsService {
  constructor(
    @InjectRepository(AdminInvitation)
    private readonly invitationRepo: Repository<AdminInvitation>,
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(AdminChurchAssignment)
    private readonly assignmentRepo: Repository<AdminChurchAssignment>,
    private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateInvitationInput): Promise<InvitationWithToken> {
    const usernameNorm = input.username.trim().toLowerCase();
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(usernameNorm) ||
      usernameNorm.length < 3 ||
      usernameNorm.length > 50
    ) {
      throw new BadRequestException(
        "Usuario inválido (3–50 caracteres, sólo letras, números, '_', '.' y '-')",
      );
    }

    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 100) {
      throw new BadRequestException(
        "Nombre visible inválido (entre 2 y 100 caracteres)",
      );
    }

    const targetRole = input.targetRole ?? AdminRole.ADMIN;

    // ── Defensa en profundidad: cadena ROOT→ROOT cerrada ──
    // Aunque el controller ya restringe el endpoint a actores ROOT (vía
    // RootRoleGuard), validamos también aquí para que ninguna otra ruta
    // de creación (scripts internos, tests, factory functions, etc.)
    // pueda saltarse la regla. La única forma de crear una cuenta ROOT
    // es que otra cuenta ROOT — autenticada como ROOT — genere la
    // invitación con `targetRole = ROOT`.
    if (
      targetRole === AdminRole.ROOT &&
      input.createdByAdminAccountRole !== AdminRole.ROOT
    ) {
      throw new ForbiddenException(
        "Sólo una cuenta ROOT puede generar invitaciones para crear otra cuenta ROOT",
      );
    }

    // El verificador adicional: el actor que se declara como ROOT
    // realmente exista y siga siendo ROOT en la base de datos en este
    // momento (no confiamos solo en el JWT).
    if (targetRole === AdminRole.ROOT) {
      const actor = await this.accountRepo.findOne({
        where: { id: input.createdByAdminAccountId },
      });
      if (!actor || actor.role !== AdminRole.ROOT || !actor.isActive) {
        throw new ForbiddenException(
          "Tu cuenta ya no es ROOT activa; no puedes crear otra cuenta ROOT",
        );
      }

      // La plataforma admite UNA sola cuenta principal. Esa regla la imponen
      // el índice único de admin_accounts, el de admin_devices y la
      // verificación de arranque (AdminSecurityIntegrityService, que impide
      // que la API encienda si hay más de un ROOT). Sin este control la
      // invitación se creaba y sólo fallaba al activarla, con un error de
      // servidor incomprensible para quien la recibía.
      const rootCount = await this.accountRepo.count({
        where: { role: AdminRole.ROOT },
      });
      if (rootCount > 0) {
        throw new ConflictException(
          "Ya existe una cuenta de administrador principal y el sistema sólo admite una. " +
            "Para dar acceso a otra persona, invítala como administrador y asígnale los permisos que necesite.",
        );
      }
    }

    const existingAccount = await this.accountRepo.findOne({
      where: { username: usernameNorm },
    });
    if (existingAccount) {
      throw new ConflictException("El nombre de usuario ya está en uso");
    }

    // Iglesia obligatoria sólo para invitaciones ADMIN. Una invitación
    // ROOT puede llegar sin iglesia — los ROOT no se asignan a una.
    let assignedChurchId: string | null = null;
    if (targetRole === AdminRole.ADMIN) {
      if (!input.assignedChurchId) {
        throw new BadRequestException(
          "Una invitación ADMIN requiere una iglesia asignada",
        );
      }
      const church = await this.churchRepo.findOne({
        where: { id: input.assignedChurchId },
      });
      if (!church) {
        throw new NotFoundException("Iglesia no encontrada");
      }
      assignedChurchId = church.id;
    }

    const existingPending = await this.invitationRepo.findOne({
      where: {
        username: usernameNorm,
        status: AdminInvitationStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        "Ya existe una invitación pendiente para ese usuario",
      );
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600 * 1000);

    const invitation = this.invitationRepo.create({
      tokenHash,
      username: usernameNorm,
      displayName,
      targetRole,
      assignedChurchId,
      // Los permisos pre-asignados sólo aplican para ADMIN. Para ROOT
      // los dejamos vacíos: la cuenta ROOT no usa listas explícitas
      // porque tiene todos los permisos por construcción.
      churchPermissions:
        targetRole === AdminRole.ROOT
          ? []
          : input.churchPermissions ?? [...ALL_CHURCH_PERMISSIONS],
      globalPermissions:
        targetRole === AdminRole.ROOT ? [] : input.globalPermissions ?? [],
      createdByAdminAccountId: input.createdByAdminAccountId,
      status: AdminInvitationStatus.PENDING,
      expiresAt,
    });

    const saved = await this.invitationRepo.save(invitation);

    return {
      id: saved.id,
      token,
      username: saved.username,
      displayName: saved.displayName,
      assignedChurchId: saved.assignedChurchId,
      targetRole: saved.targetRole,
      expiresAt: saved.expiresAt,
    };
  }

  async list() {
    const invitations = await this.invitationRepo.find({
      order: { createdAt: "DESC" },
    });

    // Adjuntamos el nombre de la iglesia para que el panel ROOT pueda
    // mostrarlo. Las invitaciones ROOT no tienen iglesia asignada — su
    // assignedChurchId es null y no entra en la consulta.
    const churchIds = invitations
      .map((inv) => inv.assignedChurchId)
      .filter((id): id is string => id !== null);
    const churches = churchIds.length
      ? await this.churchRepo.find({ where: churchIds.map((id) => ({ id })) })
      : [];
    const churchMap = new Map(churches.map((c) => [c.id, c.name]));

    return invitations.map((inv) => ({
      id: inv.id,
      username: inv.username,
      displayName: inv.displayName,
      targetRole: inv.targetRole,
      assignedChurchId: inv.assignedChurchId,
      assignedChurchName: inv.assignedChurchId
        ? churchMap.get(inv.assignedChurchId) ?? null
        : null,
      status: inv.status,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    }));
  }

  async revoke(id: string) {
    const invitation = await this.invitationRepo.findOne({ where: { id } });
    if (!invitation) {
      throw new NotFoundException("Invitación no encontrada");
    }
    if (invitation.status !== AdminInvitationStatus.PENDING) {
      throw new BadRequestException("La invitación ya no está pendiente");
    }
    invitation.status = AdminInvitationStatus.REVOKED;
    await this.invitationRepo.save(invitation);
    return { id, status: AdminInvitationStatus.REVOKED };
  }

  /** Vista pública del estado de un token (sin requerir auth). */
  async preview(token: string) {
    const tokenHash = hashToken(token);
    const invitation = await this.invitationRepo.findOne({
      where: { tokenHash },
    });
    if (!invitation) {
      throw new NotFoundException("Invitación inválida");
    }
    if (invitation.status !== AdminInvitationStatus.PENDING) {
      return { valid: false, status: invitation.status };
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = AdminInvitationStatus.EXPIRED;
      await this.invitationRepo.save(invitation);
      return { valid: false, status: AdminInvitationStatus.EXPIRED };
    }

    const church = invitation.assignedChurchId
      ? await this.churchRepo.findOne({
          where: { id: invitation.assignedChurchId },
        })
      : null;

    return {
      valid: true,
      status: AdminInvitationStatus.PENDING,
      username: invitation.username,
      displayName: invitation.displayName,
      targetRole: invitation.targetRole,
      churchName: church?.name ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  /** Aceptación: crea la cuenta de admin y marca la invitación. */
  async accept(token: string, password: string): Promise<AdminAccount> {
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      throw new BadRequestException(
        "La contraseña debe tener entre 8 y 128 caracteres",
      );
    }

    const tokenHash = hashToken(token);
    const passwordHash = await bcrypt.hash(password, 12);

    /*
     * Toda la aceptación corre en una transacción SERIALIZABLE con lock
     * pesimista sobre la fila de la invitación. Esto garantiza:
     *  - Consumo ÚNICO del token: dos peticiones simultáneas con el mismo
     *    token se serializan; la segunda ve status != PENDING y aborta
     *    (no se crean dos cuentas).
     *  - Atomicidad: cuenta + asignación de iglesia + marca ACCEPTED se
     *    confirman juntas o se revierten juntas (no quedan estados parciales
     *    si algo falla a mitad).
     */
    return this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const invitationRepo = manager.getRepository(AdminInvitation);
      const accountRepo = manager.getRepository(AdminAccount);
      const assignmentRepo = manager.getRepository(AdminChurchAssignment);

      const invitation = await invitationRepo.findOne({
        where: { tokenHash },
        lock: { mode: "pessimistic_write" },
      });
      if (!invitation) {
        throw new NotFoundException("Invitación inválida");
      }
      if (invitation.status !== AdminInvitationStatus.PENDING) {
        throw new BadRequestException("La invitación ya no está disponible");
      }
      if (invitation.expiresAt < new Date()) {
        invitation.status = AdminInvitationStatus.EXPIRED;
        await invitationRepo.save(invitation);
        throw new BadRequestException("La invitación ha expirado");
      }

      const existing = await accountRepo.findOne({
        where: { username: invitation.username },
      });
      if (existing) {
        throw new ConflictException("El nombre de usuario ya está en uso");
      }

      // Si la invitación es para ROOT, comprobamos UNA VEZ MÁS que el actor
      // que la creó sigue siendo ROOT activo en este instante. Esto cierra
      // una posible ventana donde se invita a una nueva ROOT, se desactiva
      // o degrada al creador, y aún se intenta aceptar.
      if (invitation.targetRole === AdminRole.ROOT) {
        const creator = await accountRepo.findOne({
          where: { id: invitation.createdByAdminAccountId },
        });
        if (!creator || creator.role !== AdminRole.ROOT || !creator.isActive) {
          invitation.status = AdminInvitationStatus.REVOKED;
          await invitationRepo.save(invitation);
          throw new ForbiddenException(
            "La invitación quedó inválida: quien la creó ya no es ROOT activo. Solicita una nueva invitación a otra cuenta ROOT.",
          );
        }

        // Sólo puede existir una cuenta principal (índices únicos + control de
        // arranque en AdminSecurityIntegrityService). Si ya hay una, guardar
        // otra rompería el índice y Postgres devolvería un error crudo, que al
        // usuario le llegaba como "Error del servidor". Se corta antes, con un
        // mensaje que explica qué hacer.
        const rootCount = await accountRepo.count({
          where: { role: AdminRole.ROOT },
        });
        if (rootCount > 0) {
          throw new ConflictException(
            "Ya existe una cuenta de administrador principal y el sistema sólo admite una. " +
              "Pide que te inviten como administrador, o que la cuenta principal actual te ceda ese rol.",
          );
        }
      }

      const account = accountRepo.create({
        username: invitation.username,
        displayName: invitation.displayName,
        passwordHash,
        role: invitation.targetRole,
        isActive: true,
        tokenVersion: 1,
        // ROOT no se ata a una iglesia. ADMIN sí.
        assignedChurchId:
          invitation.targetRole === AdminRole.ROOT
            ? null
            : invitation.assignedChurchId,
        // Permisos globales: para ROOT quedan vacíos porque tiene todos por
        // construcción (la lógica de permisos en PermissionsService ya lo
        // resuelve via isRoot()). Para ADMIN aplicamos los pre-asignados.
        globalPermissions:
          invitation.targetRole === AdminRole.ROOT
            ? []
            : invitation.globalPermissions ?? [],
      });
      const saved = await accountRepo.save(account);

      // Para ADMIN creamos la asignación admin↔iglesia con los permisos del
      // template. Para ROOT no creamos asignación: el resolver de permisos
      // ya devuelve "puede todo" para ROOT en cualquier iglesia.
      if (
        invitation.targetRole === AdminRole.ADMIN &&
        invitation.assignedChurchId
      ) {
        await assignmentRepo.save(
          assignmentRepo.create({
            adminAccountId: saved.id,
            churchId: invitation.assignedChurchId,
            permissions:
              invitation.churchPermissions &&
              invitation.churchPermissions.length > 0
                ? invitation.churchPermissions
                : [...ALL_CHURCH_PERMISSIONS],
          }),
        );
      }

      invitation.status = AdminInvitationStatus.ACCEPTED;
      invitation.acceptedAt = new Date();
      invitation.acceptedByAdminAccountId = saved.id;
      await invitationRepo.save(invitation);

      return saved;
    });
  }
}
