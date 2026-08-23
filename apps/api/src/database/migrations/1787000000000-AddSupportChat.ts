import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Canal de soporte con el administrador principal.
 *
 * Los visitantes del portal se identifican con un token que guarda su propio
 * navegador; del lado del servidor sólo se almacena su hash. El cuerpo de los
 * mensajes se guarda cifrado (columna `bodyCipher`), de modo que una copia de
 * la base de datos no revela las conversaciones.
 */
export class AddSupportChat1787000000000 implements MigrationInterface {
  name = "AddSupportChat1787000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "support_author_kind" AS ENUM ('GUEST','ADMIN');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "support_conversation_status" AS ENUM ('OPEN','CLOSED','BLOCKED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "support_sender_kind" AS ENUM ('AUTHOR','ROOT');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subject" text NOT NULL,
        "authorKind" "support_author_kind" NOT NULL,
        "authorName" text NOT NULL,
        "authorAdminAccountId" uuid,
        "guestTokenHash" text,
        "status" "support_conversation_status" NOT NULL DEFAULT 'OPEN',
        "lastMessageAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "rootReadAt" TIMESTAMP WITH TIME ZONE,
        "authorReadAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_conversations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversationId" uuid NOT NULL,
        "senderKind" "support_sender_kind" NOT NULL,
        "senderAdminAccountId" uuid,
        "bodyCipher" text NOT NULL,
        "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_messages" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_support_messages_conversation') THEN
          ALTER TABLE "support_messages"
            ADD CONSTRAINT "FK_support_messages_conversation"
            FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_support_conversations_author') THEN
          ALTER TABLE "support_conversations"
            ADD CONSTRAINT "FK_support_conversations_author"
            FOREIGN KEY ("authorAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_support_messages_sender') THEN
          ALTER TABLE "support_messages"
            ADD CONSTRAINT "FK_support_messages_sender"
            FOREIGN KEY ("senderAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_support_conversations_guest" ON "support_conversations" ("guestTokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_support_conversations_last" ON "support_conversations" ("lastMessageAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_support_messages_conversation" ON "support_messages" ("conversationId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_conversations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_sender_kind"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_conversation_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_author_kind"`);
  }
}
