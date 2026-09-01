import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AdminActionLog } from "./admin-action-log.entity";

type AuditLogInput = {
  actorAdminAccountId?: string | null;
  actorDeviceId?: string | null;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  description: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminActionLog)
    private readonly auditRepo: Repository<AdminActionLog>,
  ) {}

  async log(
    input: AuditLogInput,
    repository: Repository<AdminActionLog> = this.auditRepo,
  ) {
    try {
      const entry = repository.create({
        actorAdminAccountId: input.actorAdminAccountId ?? null,
        actorDeviceId: input.actorDeviceId ?? null,
        actionType: input.actionType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        description: input.description,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? "",
        metadata: input.metadata ?? null,
      });

      return await repository.save(entry);
    } catch (error) {
      this.logger.error(
        `Audit log write failed for ${input.actionType}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Dentro de una transacción el fallo SÍ se propaga.
      //
      // Si el registro falla estando en una transacción, Postgres la deja
      // abortada: cualquier orden posterior se rechaza y el COMMIT se
      // convierte en ROLLBACK sin devolver error. Tragarse el fallo hacía que
      // el llamante siguiera como si todo hubiera ido bien — en el arranque
      // del administrador principal llegaba a emitir cookies de sesión válidas
      // para una cuenta que la base de datos nunca guardó.
      //
      // Fuera de transacción se mantiene el comportamiento de siempre: un
      // fallo al registrar no tumba la operación del usuario.
      if (repository !== this.auditRepo) throw error;

      return null;
    }
  }
}
