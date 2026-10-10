import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Documentos de informes.
 *
 * Tabla de archivos adjuntos a cada informe. Al borrar un informe se borran
 * sus filas (CASCADE); los archivos en Cloudinary los elimina el servicio.
 * La cuenta que subió el documento no se puede borrar mientras exista
 * (RESTRICT), igual que ocurre con el autor del informe.
 *
 * Idempotente: corre sola al arrancar y no rompe si ya se aplicó.
 */
export class AddReportDocuments1790000000000 implements MigrationInterface {
  name = "AddReportDocuments1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reportId" uuid NOT NULL,
        "fileName" text NOT NULL,
        "mimeType" text NOT NULL,
        "kind" text NOT NULL,
        "sizeBytes" integer NOT NULL,
        "publicId" text NOT NULL,
        "uploadedByAdminAccountId" uuid NOT NULL,
        "uploadedByDisplayName" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_documents_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_report_documents_reportId" ON "report_documents" ("reportId")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "report_documents"
          ADD CONSTRAINT "FK_report_documents_report"
          FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "report_documents"
          ADD CONSTRAINT "FK_report_documents_uploader"
          FOREIGN KEY ("uploadedByAdminAccountId") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report_documents"`);
  }
}
