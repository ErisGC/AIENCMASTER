import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "crypto";

/**
 * Cifrado en reposo de los mensajes de soporte.
 *
 * El cuerpo de cada mensaje se guarda cifrado con AES-256-GCM, de modo que
 * quien obtenga una copia de la base de datos no puede leer las conversaciones.
 * NO es cifrado de extremo a extremo: el servidor descifra para mostrar los
 * mensajes al destinatario legítimo, porque el administrador principal debe
 * poder leer el mismo hilo desde el computador y desde el teléfono, y el
 * historial debe sobrevivir al cambio de dispositivo.
 *
 * La llave se deriva de ADMIN_SESSION_SECRET con HKDF y un `info` propio, así
 * que no comparte material con las cookies de sesión y no exige configurar una
 * variable nueva en el servidor.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET es obligatorio para el soporte");
  }
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from("aienc-support-v1"), 32),
  );
}

/** Devuelve `iv.tag.cipher` en base64url, todo en un solo campo de texto. */
export function encryptBody(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/** Descifra; si el dato está corrupto devuelve un marcador en vez de reventar. */
export function decryptBody(stored: string): string {
  try {
    const [ivB64, tagB64, dataB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return stored;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "[mensaje ilegible]";
  }
}

/* ── Identidad del visitante ───────────────────────────────────────────── */

/** Token opaco que el navegador guarda para reconocer al visitante. */
export function createGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Comparación en tiempo constante entre hashes ya calculados. */
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
