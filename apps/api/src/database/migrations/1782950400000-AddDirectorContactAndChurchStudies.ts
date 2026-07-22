import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Primera migración del proyecto (antes se usaba synchronize).
 *
 * Añade:
 *  - church_directors.phone / church_directors.email (contacto del representante)
 *  - tabla church_studies (estudios/mensajes en audio por iglesia)
 *
 * Escrita a mano e idempotente (IF NOT EXISTS) para ser segura aunque el
 * esquema ya tuviera parte de estos objetos. No toca datos existentes.
 */
export class AddDirectorContactAndChurchStudies1782950400000
  implements MigrationInterface
{
  name = "AddDirectorContactAndChurchStudies1782950400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── Contacto de representantes/directores ──
    await queryRunner.query(
      `ALTER TABLE "church_directors" ADD COLUMN IF NOT EXISTS "phone" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "church_directors" ADD COLUMN IF NOT EXISTS "email" text`,
    );

    // ── Estudios en audio ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "church_studies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "churchId" uuid NOT NULL,
        "teacherName" text NOT NULL,
        "topic" text NOT NULL,
        "outline" text,
        "audioUrl" text NOT NULL,
        "audioPublicId" text NOT NULL,
        "audioResourceType" text NOT NULL DEFAULT 'video',
        "audioFormat" text,
        "audioBytes" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_church_studies_id" PRIMARY KEY ("id")
      )
    `);

    // FK a churches con borrado en cascada (sólo si no existe ya).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_church_studies_church'
        ) THEN
          ALTER TABLE "church_studies"
            ADD CONSTRAINT "FK_church_studies_church"
            FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_church_studies_churchId" ON "church_studies" ("churchId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_church_studies_churchId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "church_studies"`);
    await queryRunner.query(
      `ALTER TABLE "church_directors" DROP COLUMN IF EXISTS "email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "church_directors" DROP COLUMN IF EXISTS "phone"`,
    );
  }
}
