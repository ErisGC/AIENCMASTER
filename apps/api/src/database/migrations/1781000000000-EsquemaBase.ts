import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Esquema base: crea la estructura completa desde cero.
 *
 * El proyecto empezó creando las tablas con `synchronize`, así que las
 * migraciones posteriores daban por hecha una base de datos que ya existía.
 * Sobre una base vacía el arranque fallaba en la primera migración —intentaba
 * modificar una tabla inexistente—, de modo que el esquema sólo era
 * reproducible arrastrando la base histórica. Esto lo cierra: con esta
 * migración se puede levantar el sistema desde cero.
 *
 * Corre ANTES que las demás (por eso la fecha es anterior a todas) y no toca
 * nada si la base ya tiene el esquema: se comprueba la existencia de
 * `admin_accounts` y, si está, no hace nada. Por eso es inofensiva sobre la
 * base de producción, donde las migraciones se aplican solas al arrancar.
 *
 * No tiene reversión a propósito: deshacerla sería borrar la base entera.
 */
export class EsquemaBase1781000000000 implements MigrationInterface {
  name = "EsquemaBase1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Necesaria para los uuid_generate_v4() de las tablas.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    const yaCreada = await queryRunner.hasTable("admin_accounts");
    if (yaCreada) {
      // Base existente (creada en su día con synchronize): nada que hacer.
      return;
    }

    await queryRunner.query(`CREATE TABLE "announcement_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "publicId" character varying NOT NULL, "url" character varying NOT NULL, "resourceType" character varying NOT NULL, "format" character varying NOT NULL, "name" character varying NOT NULL, "size" integer NOT NULL, "announcementId" uuid, CONSTRAINT "PK_314f306a0c6de74f2003ad189d6" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "announcements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text NOT NULL, "author" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."admin_devices_rolescope_enum" AS ENUM('ROOT_DEVICE', 'APPROVED_DEVICE')`);
    await queryRunner.query(`CREATE TYPE "public"."admin_devices_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')`);
    await queryRunner.query(`CREATE TABLE "admin_devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "adminAccountId" uuid, "deviceId" text NOT NULL, "trustedTokenHash" text, "deviceName" text NOT NULL, "platform" text NOT NULL DEFAULT '', "browser" text NOT NULL DEFAULT '', "userAgent" text NOT NULL DEFAULT '', "ipLastSeen" text, "roleScope" "public"."admin_devices_rolescope_enum" NOT NULL DEFAULT 'APPROVED_DEVICE', "status" "public"."admin_devices_status_enum" NOT NULL DEFAULT 'PENDING', "approvedByDeviceId" uuid, "approvedAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2eee38e6726ddc6a46f1daa496f" UNIQUE ("deviceId"), CONSTRAINT "CHK_admin_devices_root_device_must_be_approved" CHECK ("roleScope" <> 'ROOT_DEVICE' OR "status" = 'APPROVED'), CONSTRAINT "CHK_admin_devices_root_device_requires_binding" CHECK ("roleScope" <> 'ROOT_DEVICE' OR ("adminAccountId" IS NOT NULL AND "approvedAt" IS NOT NULL)), CONSTRAINT "CHK_admin_devices_revoked_requires_timestamp" CHECK ("status" <> 'REVOKED' OR "revokedAt" IS NOT NULL), CONSTRAINT "CHK_admin_devices_approved_requires_binding" CHECK ("status" <> 'APPROVED' OR ("adminAccountId" IS NOT NULL AND "approvedAt" IS NOT NULL)), CONSTRAINT "PK_06aac5b080d571b92a5c4b4d266" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_admin_devices_single_root_device" ON "admin_devices" ("roleScope") WHERE "roleScope" = 'ROOT_DEVICE'`);
    await queryRunner.query(`CREATE TABLE "admin_action_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorAdminAccountId" uuid, "actorDeviceId" uuid, "actionType" text NOT NULL, "targetType" text NOT NULL, "targetId" text, "description" text NOT NULL, "ip" text, "userAgent" text NOT NULL DEFAULT '', "metadata" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1cbd6d5a6c8cc626adaa7655bc4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."admin_access_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TABLE "admin_access_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestedUsername" text, "adminAccountId" uuid, "deviceId" text NOT NULL, "deviceName" text NOT NULL, "platform" text NOT NULL DEFAULT '', "browser" text NOT NULL DEFAULT '', "userAgent" text NOT NULL DEFAULT '', "ip" text, "status" "public"."admin_access_requests_status_enum" NOT NULL DEFAULT 'PENDING', "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolvedAt" TIMESTAMP WITH TIME ZONE, "resolvedByDeviceId" uuid, "notes" text, CONSTRAINT "CHK_admin_access_requests_resolved_has_timestamp" CHECK ("status" = 'PENDING' OR "resolvedAt" IS NOT NULL), CONSTRAINT "CHK_admin_access_requests_pending_unresolved" CHECK ("status" <> 'PENDING' OR "resolvedAt" IS NULL), CONSTRAINT "PK_f11e2f917e7cb06355651e83497" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_admin_access_requests_single_pending_pair" ON "admin_access_requests" ("adminAccountId", "deviceId") WHERE "status" = 'PENDING' AND "adminAccountId" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_0d41326bf1432f071e31898bbc" ON "admin_access_requests" ("deviceId", "status")`);
    await queryRunner.query(`CREATE TABLE "church_directors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "churchId" uuid NOT NULL, "displayName" text NOT NULL, "role" text NOT NULL DEFAULT '', "phone" text, "email" text, "photoUrl" text, "photoPublicId" text, "linkedAdminAccountId" uuid, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f9241865834e544005034cb885c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "churches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "city" character varying NOT NULL, "address" text, "mapsLat" double precision, "mapsLng" double precision, "mapsUrl" text, "mainImageUrl" text, "mainImagePublicId" text, "coverImageUrl" text, "coverImagePublicId" text, "avgAttendance" integer, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6048a6f37c897751d61cbb0347a" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "admin_church_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "adminAccountId" uuid NOT NULL, "churchId" uuid NOT NULL, "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c5140d8617868823b578e5f181a" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_admin_church_assignments_unique" ON "admin_church_assignments" ("adminAccountId", "churchId")`);
    await queryRunner.query(`CREATE TYPE "public"."admin_accounts_role_enum" AS ENUM('ROOT', 'ADMIN')`);
    await queryRunner.query(`CREATE TABLE "admin_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying NOT NULL, "passwordHash" character varying NOT NULL, "displayName" character varying NOT NULL, "role" "public"."admin_accounts_role_enum" NOT NULL DEFAULT 'ADMIN', "isActive" boolean NOT NULL DEFAULT true, "tokenVersion" integer NOT NULL DEFAULT '1', "lastLoginAt" TIMESTAMP WITH TIME ZONE, "assignedChurchId" uuid, "globalPermissions" jsonb NOT NULL DEFAULT '[]'::jsonb, "profilePhotoUrl" text, "profilePhotoPublicId" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_6f0c7c8d17e1d08d5ec7a4cf7e0" UNIQUE ("username"), CONSTRAINT "PK_79fb3604ed15538685183d8df5f" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_admin_accounts_single_root" ON "admin_accounts" ("role") WHERE "role" = 'ROOT'`);
    await queryRunner.query(`CREATE TYPE "public"."admin_invitations_targetrole_enum" AS ENUM('ROOT', 'ADMIN')`);
    await queryRunner.query(`CREATE TYPE "public"."admin_invitations_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TABLE "admin_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" text NOT NULL, "username" text NOT NULL, "displayName" text NOT NULL, "targetRole" "public"."admin_invitations_targetrole_enum" NOT NULL DEFAULT 'ADMIN', "assignedChurchId" uuid, "churchPermissions" jsonb NOT NULL DEFAULT '[]'::jsonb, "globalPermissions" jsonb NOT NULL DEFAULT '[]'::jsonb, "createdByAdminAccountId" uuid NOT NULL, "status" "public"."admin_invitations_status_enum" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "acceptedAt" TIMESTAMP WITH TIME ZONE, "acceptedByAdminAccountId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_656472903e59a2069e0677c0aa8" UNIQUE ("tokenHash"), CONSTRAINT "PK_0c710b9106ea89847bcf62bd3e1" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_eded2c3fc048f444fca79a4ff5" ON "admin_invitations" ("status")`);
    await queryRunner.query(`CREATE TABLE "church_announcement_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "publicId" character varying NOT NULL, "url" character varying NOT NULL, "resourceType" character varying NOT NULL, "format" character varying NOT NULL, "name" character varying NOT NULL, "size" bigint NOT NULL, "announcementId" uuid, CONSTRAINT "PK_4b1535afc35038c10734d56ae44" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "church_announcements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "churchId" uuid NOT NULL, "title" text NOT NULL, "description" text NOT NULL, "author" text NOT NULL, "createdByAdminAccountId" uuid NOT NULL, "lastUpdatedByAdminAccountId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8e04c59e673f1ea08f94a56ba53" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_f6961d70112d5ed1a25843ca63" ON "church_announcements" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_0a2a9c3d100ec329925b68e5f1" ON "church_announcements" ("churchId")`);
    await queryRunner.query(`CREATE TABLE "church_studies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "churchId" uuid NOT NULL, "teacherName" text NOT NULL, "topic" text NOT NULL, "outline" text, "audioUrl" text NOT NULL, "audioPublicId" text NOT NULL, "audioResourceType" text NOT NULL DEFAULT 'video', "audioFormat" text, "audioBytes" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0cc9132bb46952b3de4ea68e0a3" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."reports_reporttype_enum" AS ENUM('OFFERINGS', 'ATTENDANCE', 'EXPENSES', 'EVENT', 'REQUEST', 'OTHER')`);
    await queryRunner.query(`CREATE TABLE "reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "churchId" uuid NOT NULL, "reportType" "public"."reports_reporttype_enum" NOT NULL, "title" text NOT NULL, "notes" text NOT NULL DEFAULT '', "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL, "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "data" jsonb NOT NULL, "createdByAdminAccountId" uuid NOT NULL, "createdByDisplayName" text NOT NULL, "lastUpdatedByAdminAccountId" uuid, "lastUpdatedByDisplayName" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_29a72bae40ee1d044f53119ba8" ON "reports" ("periodStart")`);
    await queryRunner.query(`CREATE INDEX "IDX_605a34fa3e638ceac7b41e2f99" ON "reports" ("churchId", "reportType")`);
    await queryRunner.query(`CREATE TABLE "site_backgrounds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "imageUrl" text NOT NULL, "imagePublicId" text NOT NULL, "mobileImageUrl" text, "mobileImagePublicId" text, "label" text NOT NULL DEFAULT '', "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b3780ee5625741aeea8fa9d51a0" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "site_settings" ("id" text NOT NULL, "backgroundIntervalSeconds" integer NOT NULL DEFAULT '8', "backgroundFadeSeconds" integer NOT NULL DEFAULT '1', "backgroundEnabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."support_conversations_authorkind_enum" AS ENUM('GUEST', 'ADMIN')`);
    await queryRunner.query(`CREATE TYPE "public"."support_conversations_status_enum" AS ENUM('OPEN', 'CLOSED', 'BLOCKED')`);
    await queryRunner.query(`CREATE TABLE "support_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subject" text NOT NULL, "authorKind" "public"."support_conversations_authorkind_enum" NOT NULL, "authorName" text NOT NULL, "authorAdminAccountId" uuid, "guestTokenHash" text, "status" "public"."support_conversations_status_enum" NOT NULL DEFAULT 'OPEN', "lastMessageAt" TIMESTAMP WITH TIME ZONE NOT NULL, "rootReadAt" TIMESTAMP WITH TIME ZONE, "authorReadAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6647be672020591c574a98089e1" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_support_conversations_last" ON "support_conversations" ("lastMessageAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_support_conversations_guest" ON "support_conversations" ("guestTokenHash")`);
    await queryRunner.query(`CREATE TYPE "public"."support_messages_senderkind_enum" AS ENUM('AUTHOR', 'ROOT')`);
    await queryRunner.query(`CREATE TABLE "support_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversationId" uuid NOT NULL, "senderKind" "public"."support_messages_senderkind_enum" NOT NULL, "senderAdminAccountId" uuid, "bodyCipher" text NOT NULL, "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2aa37479e71ef29cbf4dba2b1a2" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_support_messages_conversation" ON "support_messages" ("conversationId", "createdAt")`);
    await queryRunner.query(`ALTER TABLE "announcement_attachments" ADD CONSTRAINT "FK_713071f9e370cd3ab1c0d92cd7e" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_devices" ADD CONSTRAINT "FK_2ba4c7f279e24324a470ef8ef25" FOREIGN KEY ("adminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_devices" ADD CONSTRAINT "FK_f7aa216662d63b5b91c66ce61db" FOREIGN KEY ("approvedByDeviceId") REFERENCES "admin_devices"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_action_logs" ADD CONSTRAINT "FK_c051d55d5ce2f782ba175f2154d" FOREIGN KEY ("actorAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_action_logs" ADD CONSTRAINT "FK_30f1b4d510da550baa449796659" FOREIGN KEY ("actorDeviceId") REFERENCES "admin_devices"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_access_requests" ADD CONSTRAINT "FK_2a09f04fd641debeb464ef5e1ab" FOREIGN KEY ("adminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_access_requests" ADD CONSTRAINT "FK_1ca538f4bedc8f2bd945fd38959" FOREIGN KEY ("resolvedByDeviceId") REFERENCES "admin_devices"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_directors" ADD CONSTRAINT "FK_331ca506a4640ffa832bf8ce631" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_directors" ADD CONSTRAINT "FK_d80668e360dcb567d05e3edf481" FOREIGN KEY ("linkedAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_church_assignments" ADD CONSTRAINT "FK_a8729b43d06f85a59773f0be547" FOREIGN KEY ("adminAccountId") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_church_assignments" ADD CONSTRAINT "FK_a989cf7d1cc9244edcad724a6ef" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "admin_accounts" ADD CONSTRAINT "FK_5bf3d15e75b342750d652071e52" FOREIGN KEY ("assignedChurchId") REFERENCES "churches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_announcement_attachments" ADD CONSTRAINT "FK_3b04656b12051c36d5831aceeea" FOREIGN KEY ("announcementId") REFERENCES "church_announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_announcements" ADD CONSTRAINT "FK_0a2a9c3d100ec329925b68e5f1e" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_announcements" ADD CONSTRAINT "FK_747127d67dd24856ee9d3b00b20" FOREIGN KEY ("createdByAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "church_studies" ADD CONSTRAINT "FK_5b6c1417614250014e977837790" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_34032aa91ba6e5447ca39ef429b" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "reports" ADD CONSTRAINT "FK_e47eacefbd38f0dae054535b3e8" FOREIGN KEY ("createdByAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "support_conversations" ADD CONSTRAINT "FK_e0ad1791cc7f1fcc13bc751f205" FOREIGN KEY ("authorAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "support_messages" ADD CONSTRAINT "FK_e070973586504df3c9b03e9e4d0" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "support_messages" ADD CONSTRAINT "FK_bccadfd44cf6534e70149090748" FOREIGN KEY ("senderAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(): Promise<void> {
    throw new Error(
      "El esquema base no se revierte: deshacerlo eliminaría toda la base de datos.",
    );
  }
}
