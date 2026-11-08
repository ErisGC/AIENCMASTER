import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Dispositivos vinculados: la app del teléfono aprueba los ingresos web de su
 * misma cuenta, cerrar sesión desaprueba el navegador y desde la app se ven,
 * nombran, pausan y cierran las sesiones.
 */
export class AddLinkedDevices1791000000000 implements MigrationInterface {
  name = "AddLinkedDevices1791000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."admin_devices_status_enum" ADD VALUE IF NOT EXISTS 'SIGNED_OUT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "clientKind" text NOT NULL DEFAULT 'WEB'`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "approvedVia" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "ephemeral" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "windowClosedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "signedOutAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_devices" ADD COLUMN IF NOT EXISTS "customName" text`,
    );
    // Los teléfonos que ya usan la app se reconocen por el nombre de cliente
    // que la app manda desde siempre.
    await queryRunner.query(
      `UPDATE "admin_devices" SET "clientKind" = 'APP' WHERE "browser" = 'AIENC Admin app'`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_access_requests" ADD COLUMN IF NOT EXISTS "confirmCode" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_access_requests" ADD COLUMN IF NOT EXISTS "approvalChannel" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_access_requests" DROP COLUMN IF EXISTS "approvalChannel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_access_requests" DROP COLUMN IF EXISTS "confirmCode"`,
    );
    for (const col of [
      "customName",
      "pausedAt",
      "signedOutAt",
      "windowClosedAt",
      "ephemeral",
      "approvedVia",
      "clientKind",
    ]) {
      await queryRunner.query(
        `ALTER TABLE "admin_devices" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
    // Postgres no permite quitar un valor de un enum: los dispositivos con
    // sesión cerrada pasan a REVOKED para que el esquema anterior los acepte.
    await queryRunner.query(
      `UPDATE "admin_devices" SET "status" = 'REVOKED', "revokedAt" = COALESCE("revokedAt", now()) WHERE "status" = 'SIGNED_OUT'`,
    );
  }
}
