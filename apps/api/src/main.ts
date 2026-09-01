import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: 1 => confiamos en exactamente 1 proxy reverso (Railway).
    // Así req.ip es la IP real del cliente y NO el header X-Forwarded-For
    // crudo (que un cliente podría falsear para eludir el rate limiting).
    new FastifyAdapter({ trustProxy: 1 }),
  );

  // Security headers (CSP deshabilitado porque la API solo devuelve JSON).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
      // Tope duro de piezas por petición. Sin él, una sola petición podía
      // traer archivos sin límite: cada controlador los va acumulando en
      // memoria y sólo cuenta cuántos hay AL TERMINAR, así que el proceso se
      // quedaba sin memoria antes de llegar a la validación.
      //
      // Se deja por encima del máximo de la aplicación (20 adjuntos por
      // anuncio) para que quien se pase por poco siga recibiendo el mensaje
      // claro del validador en vez de un corte en seco; esto sólo ataja el
      // abuso de verdad.
      files: 25,
      fields: 50,
      fieldSize: 1 * 1024 * 1024, // 1 MB por campo de texto
    },
    attachFieldsToBody: false,
  });

  app.enableCors({
    // Admite varios dominios (lista separada por comas) para poder migrar
    // sin dejar fuera al dominio anterior.
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port, "0.0.0.0");
  logger.log(`API running on http://localhost:${port}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal} — shutting down gracefully`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap();
