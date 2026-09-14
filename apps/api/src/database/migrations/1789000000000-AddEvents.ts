import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Cronograma de eventos.
 *
 * Crea la tabla de eventos, la de encargados por evento y los tipos ENUM con
 * los mismos nombres que declaran las entidades (`enumName`), para que la
 * sincronización de desarrollo y esta migración coincidan.
 *
 * Además concede el permiso nuevo `MANAGE_EVENTS` a quien ya podía publicar
 * anuncios en su iglesia: sin esto, ningún administrador existente podría usar
 * el cronograma hasta que el principal le diera el permiso uno por uno. El
 * principal puede retirarlo después desde la pantalla de permisos.
 *
 * Todo es idempotente: corre sola al arrancar y no rompe si ya se aplicó.
 */
export class AddEvents1789000000000 implements MigrationInterface {
  name = "AddEvents1789000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "event_type" AS ENUM (
          'CULTO','CULTO_UNIDO','CULTO_JOVENES','CULTO_DAMAS','CULTO_CABALLEROS',
          'REUNION','ASAMBLEA','ESTUDIO','INTENSIVO','OTRO'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "event_scope" AS ENUM ('LOCAL','GLOBAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "churchId" uuid,
        "title" text NOT NULL,
        "description" text,
        "type" "event_type" NOT NULL,
        "scope" "event_scope" NOT NULL,
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "location" text,
        "seriesId" uuid,
        "seriesRule" text,
        "createdByAdminAccountId" uuid NOT NULL,
        "createdByDisplayName" text NOT NULL,
        "lastUpdatedByAdminAccountId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_directors" (
        "eventId" uuid NOT NULL,
        "directorId" uuid NOT NULL,
        CONSTRAINT "PK_event_directors" PRIMARY KEY ("eventId", "directorId")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_startsAt" ON "events" ("startsAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_church" ON "events" ("churchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_scope_startsAt" ON "events" ("scope", "startsAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_series" ON "events" ("seriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_event_directors_event" ON "event_directors" ("eventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_event_directors_director" ON "event_directors" ("directorId")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "events"
          ADD CONSTRAINT "FK_events_church"
          FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "events"
          ADD CONSTRAINT "FK_events_created_by"
          FOREIGN KEY ("createdByAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "event_directors"
          ADD CONSTRAINT "FK_event_directors_event"
          FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "event_directors"
          ADD CONSTRAINT "FK_event_directors_director"
          FOREIGN KEY ("directorId") REFERENCES "church_directors"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Quien ya publica anuncios en su iglesia puede programar sus eventos.
    await queryRunner.query(`
      UPDATE "admin_church_assignments"
      SET "permissions" = "permissions" || '["MANAGE_EVENTS"]'::jsonb
      WHERE "permissions" ? 'MANAGE_CHURCH_ANNOUNCEMENTS'
        AND NOT ("permissions" ? 'MANAGE_EVENTS')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_directors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_scope"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_type"`);
    await queryRunner.query(`
      UPDATE "admin_church_assignments"
      SET "permissions" = "permissions" - 'MANAGE_EVENTS'
      WHERE "permissions" ? 'MANAGE_EVENTS'
    `);
  }
}
