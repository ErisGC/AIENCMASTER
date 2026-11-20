import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Conteos del portal público para las estadísticas de la cuenta principal.
 * Ver AnalyticsDaily y AnalyticsVisitor: solo números por día, sin datos de
 * quien visita.
 */
export class AddAnalytics1793000000000 implements MigrationInterface {
  name = "AddAnalytics1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_daily" (
        "day" date NOT NULL,
        "kind" text NOT NULL,
        "targetId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily" PRIMARY KEY ("day", "kind", "targetId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_analytics_daily_kind_target"
         ON "analytics_daily" ("kind", "targetId")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_visitors" (
        "day" date NOT NULL,
        "visitorHash" text NOT NULL,
        CONSTRAINT "PK_analytics_visitors" PRIMARY KEY ("day", "visitorHash")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_visitors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily"`);
  }
}
