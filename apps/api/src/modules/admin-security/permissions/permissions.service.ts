import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AdminAccount } from "../admin-account.entity";
import { AdminChurchAssignment } from "../admin-church-assignment.entity";
import { AdminRole } from "../enums/admin-role.enum";
import {
  ALL_CHURCH_PERMISSIONS,
  ALL_GLOBAL_PERMISSIONS,
  ChurchPermission,
  GlobalPermission,
} from "./permission.enums";

/**
 * Servicio central para resolver permisos.
 *
 * Reglas:
 *  - ROOT tiene TODOS los permisos globales y todos los permisos
 *    sobre TODAS las iglesias, sin necesidad de asignaciones.
 *  - Un admin normal sólo tiene los permisos que le han sido
 *    explícitamente asignados.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(AdminChurchAssignment)
    private readonly assignmentRepo: Repository<AdminChurchAssignment>,
  ) {}

  isRoot(account: Pick<AdminAccount, "role">): boolean {
    return account.role === AdminRole.ROOT;
  }

  /** Devuelve los permisos globales efectivos del admin. */
  effectiveGlobalPermissions(
    account: Pick<AdminAccount, "role" | "globalPermissions">,
  ): GlobalPermission[] {
    if (this.isRoot(account)) return [...ALL_GLOBAL_PERMISSIONS];
    return account.globalPermissions ?? [];
  }

  hasGlobalPermission(
    account: Pick<AdminAccount, "role" | "globalPermissions">,
    permission: GlobalPermission,
  ): boolean {
    if (this.isRoot(account)) return true;
    return (account.globalPermissions ?? []).includes(permission);
  }

  assertGlobalPermission(
    account: Pick<AdminAccount, "role" | "globalPermissions">,
    permission: GlobalPermission,
  ): void {
    if (!this.hasGlobalPermission(account, permission)) {
      throw new ForbiddenException(`Permiso requerido: ${permission}`);
    }
  }

  /** Devuelve los permisos por iglesia efectivos para un admin. */
  async effectiveChurchPermissions(
    account: Pick<AdminAccount, "id" | "role">,
    churchId: string,
  ): Promise<ChurchPermission[]> {
    if (this.isRoot(account)) return [...ALL_CHURCH_PERMISSIONS];

    const assignment = await this.assignmentRepo.findOne({
      where: { adminAccountId: account.id, churchId },
    });
    if (!assignment) return [];

    return assignment.permissions ?? [];
  }

  async hasChurchPermission(
    account: Pick<AdminAccount, "id" | "role">,
    churchId: string,
    permission: ChurchPermission,
  ): Promise<boolean> {
    if (this.isRoot(account)) return true;
    const permissions = await this.effectiveChurchPermissions(
      account,
      churchId,
    );
    return permissions.includes(permission);
  }

  async assertChurchPermission(
    account: Pick<AdminAccount, "id" | "role">,
    churchId: string,
    permission: ChurchPermission,
  ): Promise<void> {
    const ok = await this.hasChurchPermission(account, churchId, permission);
    if (!ok) {
      throw new ForbiddenException(
        `Permiso requerido sobre la iglesia: ${permission}`,
      );
    }
  }

  /**
   * Iglesias en las que el admin tiene un permiso concreto, en UNA consulta.
   * Para listados largos evita preguntar iglesia por iglesia. ROOT devuelve
   * `null`: las tiene todas.
   */
  async churchIdsWithPermission(
    account: Pick<AdminAccount, "id" | "role">,
    permission: ChurchPermission,
  ): Promise<string[] | null> {
    if (this.isRoot(account)) return null;
    const rows = await this.assignmentRepo.find({
      where: { adminAccountId: account.id },
      select: ["churchId", "permissions"],
    });
    return rows
      .filter((r) => (r.permissions ?? []).includes(permission))
      .map((r) => r.churchId);
  }

  /** Lista de IDs de iglesias asignadas al admin (vacía para ROOT). */
  async getAssignedChurchIds(
    account: Pick<AdminAccount, "id" | "role">,
  ): Promise<string[]> {
    if (this.isRoot(account)) return [];
    const rows = await this.assignmentRepo.find({
      where: { adminAccountId: account.id },
      select: ["churchId"],
    });
    return rows.map((r) => r.churchId);
  }
}
