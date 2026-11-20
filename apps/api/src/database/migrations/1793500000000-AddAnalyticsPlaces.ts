import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Zonas desde donde visitan el portal, solo de quien acepta compartirla. Ver
 * AnalyticsPlaceDaily y AnalyticsPlace: celdas de una décima de grado y
 * cuántas personas hubo en cada una por día.
 */
export class AddAnalyticsPlaces1793500000000 implements MigrationInterface {
  name = "AddAnalyticsPlaces1793500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_places_daily" (
        "day" date NOT NULL,
        "lat10" smallint NOT NULL,
        "lon10" smallint NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_places_daily" PRIMARY KEY ("day", "lat10", "lon10")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_places" (
        "lat10" smallint NOT NULL,
        "lon10" smallint NOT NULL,
        "city" text,
        "region" text,
        "country" text,
        "countryCode" text,
        "resolvedAt" timestamptz,
        "ok" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_analytics_places" PRIMARY KEY ("lat10", "lon10")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_places"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_places_daily"`);
  }
}
