import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Elimina el campo de texto libre `churches.representatives`.
 *
 * Convivía con los registros reales de representantes (`church_directors`) y
 * eso producía información contradictoria: la tarjeta pública de la iglesia
 * mostraba el texto antiguo mientras la ficha mostraba los registros. A partir
 * de aquí los representantes se cargan SIEMPRE como registros, con su nombre,
 * cargo, celular, correo y foto.
 *
 * Ojo: los nombres que hubiera en ese texto se pierden; se vuelven a cargar
 * como registros desde el panel.
 */
export class DropChurchRepresentativesText1785801600000
  implements MigrationInterface
{
  name = "DropChurchRepresentativesText1785801600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "churches" DROP COLUMN IF EXISTS "representatives"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se restituye la columna vacía: el contenido anterior no se conserva.
    await queryRunner.query(
      `ALTER TABLE "churches" ADD COLUMN IF NOT EXISTS "representatives" text`,
    );
  }
}
