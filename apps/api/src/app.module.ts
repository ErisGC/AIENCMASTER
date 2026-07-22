import { join } from "path";

import { Module } from "@nestjs/common";
import { TypeOrmModule, type TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";

import { validateEnvironment } from "./config/environment.validation";
import { AdminSecurityModule } from "./modules/admin-security/admin-security.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { ChurchAnnouncementsModule } from "./modules/church-announcements/church-announcements.module";
import { ChurchStudiesModule } from "./modules/church-studies/church-studies.module";
import { ChurchesModule } from "./modules/churches/churches.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SiteModule } from "./modules/site/site.module";

/**
 * En producción aceptamos un único `DATABASE_URL` (Neon, Railway, Supabase…).
 * En desarrollo seguimos usando los DB_* sueltos.
 *
 * Algunos proveedores requieren SSL: si la URL no incluye `sslmode=require`
 * activamos `ssl` con `rejectUnauthorized: false` para Neon/Supabase.
 */
function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const isProd = process.env.NODE_ENV === "production";
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const wantsSync = process.env.DB_SYNCHRONIZE === "true";

  // Fail-safe: en producción NUNCA sincronizamos el esquema automáticamente.
  // TypeORM `synchronize` puede alterar o eliminar columnas y provocar
  // pérdida de datos. Si alguien deja DB_SYNCHRONIZE=true en prod, lo
  // ignoramos (no es un interruptor seguro) y los cambios de esquema deben
  // hacerse con migraciones.
  const synchronize = isProd ? false : wantsSync;

  if (isProd && wantsSync) {
    console.warn(
      "[TypeORM] DB_SYNCHRONIZE=true fue IGNORADO en producción. Usa migraciones para cambios de esquema.",
    );
  }

  const base: Partial<TypeOrmModuleOptions> = {
    type: "postgres",
    autoLoadEntities: true,
    synchronize,
    // Con synchronize apagado, el esquema evoluciona por migraciones. Las
    // aplicamos automáticamente al arrancar (idempotente: TypeORM lleva
    // registro en la tabla "migrations"), así un deploy nuevo actualiza el
    // esquema sin intervención manual. __dirname apunta a dist/ en runtime.
    migrations: [join(__dirname, "database", "migrations", "*.{js,ts}")],
    migrationsRun: true,
  };

  if (databaseUrl) {
    return {
      ...base,
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
    } as TypeOrmModuleOptions;
  }

  return {
    ...base,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  } as TypeOrmModuleOptions;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    AdminSecurityModule,
    AnnouncementsModule,
    ChurchAnnouncementsModule,
    ChurchStudiesModule,
    ChurchesModule,
    ReportsModule,
    SiteModule,
  ],
})
export class AppModule {}
