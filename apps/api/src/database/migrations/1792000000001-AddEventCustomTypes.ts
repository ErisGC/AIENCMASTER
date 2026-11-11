import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tipos de evento propios ("Vigilia", "Campamento"…): la lista y la copia del
 * nombre en cada evento. Ver EventCustomType.
 */
export class AddEventCustomTypes1792000000001 implements MigrationInterface {
  name = "AddEventCustomTypes1792000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_custom_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" text NOT NULL,
        "churchId" uuid,
        "createdByAdminAccountId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_event_custom_types" PRIMARY KEY ("id"),
        CONSTRAINT "FK_event_custom_types_church" FOREIGN KEY ("churchId")
          REFERENCES "churches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_event_custom_types_name"
         ON "event_custom_types" (lower("name"),
           COALESCE("churchId", '00000000-0000-0000-0000-000000000000'::uuid))`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "customTypeName" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "customTypeName"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_custom_types"`);
  }
}
