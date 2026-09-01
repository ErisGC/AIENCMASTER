type EnvironmentInput = Record<string, unknown>;

function readString(config: EnvironmentInput, name: string, errors: string[]) {
  const value = config[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${name} is required`);
    return "";
  }

  return value.trim();
}

function readPositiveInteger(
  config: EnvironmentInput,
  name: string,
  errors: string[],
) {
  const raw = readString(config, name, errors);
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${name} must be a positive integer`);
    return 0;
  }

  return parsed;
}

function readSecret(
  config: EnvironmentInput,
  name: string,
  errors: string[],
  minLength = 32,
) {
  const value = readString(config, name, errors);

  if (value.length < minLength) {
    errors.push(`${name} must be at least ${minLength} characters long`);
  }

  return value;
}

function readBooleanString(
  config: EnvironmentInput,
  name: string,
  errors: string[],
) {
  const raw = readString(config, name, errors);

  if (raw !== "true" && raw !== "false") {
    errors.push(`${name} must be either "true" or "false"`);
    return false;
  }

  return raw === "true";
}

export function validateEnvironment(config: EnvironmentInput) {
  const errors: string[] = [];

  // En producción aceptamos DATABASE_URL (Neon/Railway/Supabase) en lugar
  // de las DB_* sueltas. Si está presente, los campos individuales son opcionales.
  const databaseUrlRaw = config.DATABASE_URL;
  const hasDatabaseUrl =
    typeof databaseUrlRaw === "string" && databaseUrlRaw.trim().length > 0;
  const databaseUrl = hasDatabaseUrl ? databaseUrlRaw.trim() : "";

  const dbHost = hasDatabaseUrl
    ? typeof config.DB_HOST === "string"
      ? config.DB_HOST.trim()
      : ""
    : readString(config, "DB_HOST", errors);
  const dbPort = hasDatabaseUrl
    ? Number(config.DB_PORT) || 0
    : readPositiveInteger(config, "DB_PORT", errors);
  const dbUsername = hasDatabaseUrl
    ? typeof config.DB_USERNAME === "string"
      ? config.DB_USERNAME.trim()
      : ""
    : readString(config, "DB_USERNAME", errors);
  const dbPassword = hasDatabaseUrl
    ? typeof config.DB_PASSWORD === "string"
      ? config.DB_PASSWORD.trim()
      : ""
    : readString(config, "DB_PASSWORD", errors);
  const dbName = hasDatabaseUrl
    ? typeof config.DB_NAME === "string"
      ? config.DB_NAME.trim()
      : ""
    : readString(config, "DB_NAME", errors);
  const port = readPositiveInteger(config, "PORT", errors);

  const adminSessionSecret = readSecret(config, "ADMIN_SESSION_SECRET", errors);
  const adminSessionTtlSeconds = readPositiveInteger(
    config,
    "ADMIN_SESSION_TTL_SECONDS",
    errors,
  );
  const adminPendingSessionTtlSeconds = readPositiveInteger(
    config,
    "ADMIN_PENDING_SESSION_TTL_SECONDS",
    errors,
  );
  const adminTrustedDeviceTtlSeconds = readPositiveInteger(
    config,
    "ADMIN_TRUSTED_DEVICE_TTL_SECONDS",
    errors,
  );
  const adminAccessRequestTtlSeconds = readPositiveInteger(
    config,
    "ADMIN_ACCESS_REQUEST_TTL_SECONDS",
    errors,
  );
  const adminAccessRequestRetryCooldownSeconds = readPositiveInteger(
    config,
    "ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS",
    errors,
  );

  const adminBootstrapEnabled = readBooleanString(
    config,
    "ADMIN_BOOTSTRAP_ENABLED",
    errors,
  );
  const adminRootRecoveryEnabled = readBooleanString(
    config,
    "ADMIN_ROOT_RECOVERY_ENABLED",
    errors,
  );

  // WEB_ORIGIN admite VARIOS orígenes separados por coma. Es lo que permite
  // cambiar de dominio sin cortar el acceso: durante la mudanza se listan el
  // nuevo y el viejo, y cuando el nuevo está estable se retira el anterior.
  // El PRIMERO es el canónico (el que el proxy web reenvía al backend).
  const rawWebOrigin =
    typeof config.WEB_ORIGIN === "string" && config.WEB_ORIGIN.trim().length > 0
      ? config.WEB_ORIGIN.trim()
      : "http://localhost:3000";

  const webOrigins: string[] = [];
  for (const piece of rawWebOrigin.split(",")) {
    const candidate = piece.trim();
    if (candidate.length === 0) continue;
    try {
      webOrigins.push(new URL(candidate).origin);
    } catch {
      errors.push(`WEB_ORIGIN contiene un origen inválido: ${candidate}`);
    }
  }
  if (webOrigins.length === 0) {
    errors.push("WEB_ORIGIN must be a valid absolute URL");
  }
  const webOrigin = webOrigins.join(",");

  // El valor normalizado se devuelve a process.env.
  //
  // Aquí se recorta cada dominio a su origen (sin barra final ni ruta), pero
  // ese resultado sólo llegaba al almacén de configuración de Nest, que nadie
  // consulta: el resto del código lee process.env directamente. Con
  // `WEB_ORIGIN=https://aienc.org/` la validación pasaba —el origen es
  // válido— y luego CORS comparaba contra el texto con barra, que nunca
  // coincide con la cabecera del navegador: todas las peticiones quedaban
  // bloqueadas sin un solo error en el arranque.
  if (webOrigins.length > 0) {
    process.env.WEB_ORIGIN = webOrigin;
  }

  // Cloudinary guarda TODAS las imágenes, audios y documentos. Sin
  // credenciales el servidor arrancaba igual y sólo fallaba a mitad de una
  // subida, en producción y de cara al usuario. Es tan obligatorio como el
  // secreto de sesión, así que se exige al arrancar.
  readString(config, "CLOUDINARY_CLOUD_NAME", errors);
  readString(config, "CLOUDINARY_API_KEY", errors);
  readString(config, "CLOUDINARY_API_SECRET", errors);

  let adminBootstrapSecret = "";
  if (adminBootstrapEnabled) {
    adminBootstrapSecret = readSecret(config, "ADMIN_BOOTSTRAP_SECRET", errors);
  }

  let adminRootRecoverySecret = "";
  if (adminRootRecoveryEnabled) {
    adminRootRecoverySecret = readSecret(
      config,
      "ADMIN_ROOT_RECOVERY_SECRET",
      errors,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join("\n- ")}`,
    );
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    DB_HOST: dbHost,
    DB_PORT: dbPort,
    DB_USERNAME: dbUsername,
    DB_PASSWORD: dbPassword,
    DB_NAME: dbName,
    PORT: port,
    WEB_ORIGIN: webOrigin,
    ADMIN_SESSION_SECRET: adminSessionSecret,
    ADMIN_SESSION_TTL_SECONDS: adminSessionTtlSeconds,
    ADMIN_PENDING_SESSION_TTL_SECONDS: adminPendingSessionTtlSeconds,
    ADMIN_TRUSTED_DEVICE_TTL_SECONDS: adminTrustedDeviceTtlSeconds,
    ADMIN_ACCESS_REQUEST_TTL_SECONDS: adminAccessRequestTtlSeconds,
    ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS:
      adminAccessRequestRetryCooldownSeconds,
    ADMIN_BOOTSTRAP_ENABLED: adminBootstrapEnabled ? "true" : "false",
    ADMIN_BOOTSTRAP_SECRET: adminBootstrapSecret,
    ADMIN_ROOT_RECOVERY_ENABLED: adminRootRecoveryEnabled ? "true" : "false",
    ADMIN_ROOT_RECOVERY_SECRET: adminRootRecoverySecret,
  };
}
