import { validateEnvironment } from './environment.validation';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'aienc',
  PORT: '3001',
  ADMIN_SESSION_SECRET: 'this-is-a-very-long-admin-session-secret-for-tests',
  ADMIN_SESSION_TTL_SECONDS: '43200',
  ADMIN_PENDING_SESSION_TTL_SECONDS: '86400',
  ADMIN_TRUSTED_DEVICE_TTL_SECONDS: '2592000',
  ADMIN_ACCESS_REQUEST_TTL_SECONDS: '86400',
  ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS: '3600',
  ADMIN_BOOTSTRAP_ENABLED: 'false',
  ADMIN_ROOT_RECOVERY_ENABLED: 'false',
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
};

describe('validateEnvironment', () => {
  it('fails fast when ADMIN_SESSION_SECRET is missing', () => {
    expect(() =>
      validateEnvironment({
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'aienc',
        PORT: '3001',
        ADMIN_SESSION_TTL_SECONDS: '43200',
        ADMIN_PENDING_SESSION_TTL_SECONDS: '86400',
        ADMIN_TRUSTED_DEVICE_TTL_SECONDS: '2592000',
        ADMIN_ACCESS_REQUEST_TTL_SECONDS: '86400',
        ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS: '3600',
        ADMIN_BOOTSTRAP_ENABLED: 'false',
        ADMIN_ROOT_RECOVERY_ENABLED: 'false',
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    ).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it('fails when WEB_ORIGIN is not a valid absolute URL', () => {
    expect(() =>
      validateEnvironment({
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'aienc',
        PORT: '3001',
        WEB_ORIGIN: '/relative-path',
        ADMIN_SESSION_SECRET:
          'this-is-a-very-long-admin-session-secret-for-tests',
        ADMIN_SESSION_TTL_SECONDS: '43200',
        ADMIN_PENDING_SESSION_TTL_SECONDS: '86400',
        ADMIN_TRUSTED_DEVICE_TTL_SECONDS: '2592000',
        ADMIN_ACCESS_REQUEST_TTL_SECONDS: '86400',
        ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS: '3600',
        ADMIN_BOOTSTRAP_ENABLED: 'false',
        ADMIN_ROOT_RECOVERY_ENABLED: 'false',
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  /**
   * Regresión: la normalización de WEB_ORIGIN sólo llegaba al almacén de
   * configuración de Nest, que nadie consulta. Con una barra final la
   * validación pasaba y luego CORS comparaba contra el texto con barra, que
   * nunca coincide con la cabecera del navegador: todo quedaba bloqueado sin
   * un solo error en el arranque.
   */
  it('normaliza WEB_ORIGIN en process.env, no sólo en el retorno', () => {
    const previo = process.env.WEB_ORIGIN;
    try {
      const salida = validateEnvironment({
        ...base,
        WEB_ORIGIN: 'https://aienc.org/,https://www.aienc.org/algo',
      });
      expect(salida.WEB_ORIGIN).toBe('https://aienc.org,https://www.aienc.org');
      expect(process.env.WEB_ORIGIN).toBe(
        'https://aienc.org,https://www.aienc.org',
      );
    } finally {
      if (previo === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = previo;
    }
  });

  /**
   * Cloudinary guarda todas las imágenes, audios y documentos. Sin
   * credenciales el servidor arrancaba igual y sólo fallaba a mitad de una
   * subida, en producción y de cara al usuario.
   */
  it.each([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('falla al arrancar si falta %s', (clave) => {
    const config: Record<string, string> = { ...base };
    delete config[clave];
    expect(() => validateEnvironment(config)).toThrow(new RegExp(clave));
  });
});
