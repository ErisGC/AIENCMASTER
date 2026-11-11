import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Una sola conversación de soporte por persona.
 *
 * Antes cada "nuevo reporte" abría una conversación aparte y la bandeja del
 * administrador principal mostraba varias de la misma persona. Aquí se unen:
 * por cuenta de administrador y, para visitantes del portal, por navegador
 * (el token que identifica al visitante). Se conserva la conversación más
 * antigua, se le pasan los mensajes de las demás (siguen en orden por fecha)
 * y se borran las que quedan vacías. Nada se pierde.
 *
 * No tiene vuelta atrás automática: separar los mensajes otra vez no se
 * puede deducir.
 */
export class MergeSupportConversations1792000000000
  implements MigrationInterface
{
  name = "MergeSupportConversations1792000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const filas = (await queryRunner.query(
      `SELECT id, "authorAdminAccountId", "guestTokenHash", status,
              "createdAt", "lastMessageAt", "rootReadAt", "authorReadAt"
         FROM support_conversations`,
    )) as Array<{
      id: string;
      authorAdminAccountId: string | null;
      guestTokenHash: string | null;
      status: string;
      createdAt: Date;
      lastMessageAt: Date;
      rootReadAt: Date | null;
      authorReadAt: Date | null;
    }>;

    const grupos = new Map<string, typeof filas>();
    for (const f of filas) {
      const clave = f.authorAdminAccountId
        ? `a:${f.authorAdminAccountId}`
        : f.guestTokenHash
          ? `g:${f.guestTokenHash}`
          : null;
      if (!clave) continue;
      const g = grupos.get(clave) ?? [];
      g.push(f);
      grupos.set(clave, g);
    }

    const t = (d: Date | null) => (d ? new Date(d).getTime() : 0);
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      grupo.sort((a, b) => t(a.createdAt) - t(b.createdAt));
      const [queda, ...resto] = grupo;
      const otros = resto.map((r) => r.id);

      const ultimo = new Date(Math.max(...grupo.map((g) => t(g.lastMessageAt))));
      const sinLeer = (leido: Date | null, ultimoHilo: Date) =>
        !leido || t(leido) < t(ultimoHilo);
      const rootPendiente = grupo.some((g) => sinLeer(g.rootReadAt, g.lastMessageAt));
      const autorPendiente = grupo.some((g) =>
        sinLeer(g.authorReadAt, g.lastMessageAt),
      );
      const leidoRoot = rootPendiente
        ? null
        : new Date(Math.max(...grupo.map((g) => t(g.rootReadAt))));
      const leidoAutor = autorPendiente
        ? null
        : new Date(Math.max(...grupo.map((g) => t(g.authorReadAt))));
      const estado = grupo.some((g) => g.status === "BLOCKED")
        ? "BLOCKED"
        : grupo.some((g) => g.status === "OPEN")
          ? "OPEN"
          : "CLOSED";

      await queryRunner.query(
        `UPDATE support_messages SET "conversationId" = $1
          WHERE "conversationId" = ANY($2)`,
        [queda.id, otros],
      );
      await queryRunner.query(
        `UPDATE support_conversations
            SET "lastMessageAt" = $2, "rootReadAt" = $3, "authorReadAt" = $4,
                status = $5
          WHERE id = $1`,
        [queda.id, ultimo, leidoRoot, leidoAutor, estado],
      );
      await queryRunner.query(
        `DELETE FROM support_conversations WHERE id = ANY($1)`,
        [otros],
      );
    }
  }

  public async down(): Promise<void> {
    // Sin vuelta atrás: ver el comentario de la clase.
  }
}
