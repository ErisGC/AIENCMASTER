import { BadRequestException } from "@nestjs/common";

/**
 * Hard limits enforced at the application level, in addition to the
 * Fastify multipart global limit (50 MB in main.ts).
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
// Estudios en audio: tope prudente que cabe en el límite global de multipart
// (50 MB) y no satura la RAM del servidor. Para archivos más grandes se debe
// migrar a subida directa firmada a Cloudinary (ver church-studies.service).
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_ANNOUNCEMENT = 20;

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const ALLOWED_PDF_MIMES = new Set(["application/pdf"]);

/**
 * Firmas de contenido para comprobar que el archivo es lo que dice ser.
 *
 * Cada firma puede tener varios tramos con su posición, porque no todos los
 * formatos se identifican con los primeros bytes: WEBP es un contenedor RIFF y
 * su marca propia está en la posición 8. Comprobar sólo "RIFF" dejaba pasar
 * cualquier otro contenedor RIFF (un WAV o un AVI) declarado como imagen.
 */
const MAGIC_BYTES: Array<{
  mime: string;
  segments: Array<{ offset: number; bytes: number[] }>;
}> = [
  { mime: "image/jpeg", segments: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  {
    mime: "image/png",
    segments: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  },
  {
    mime: "image/gif",
    segments: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  },
  {
    mime: "image/webp",
    segments: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
    ],
  },
  {
    mime: "application/pdf",
    segments: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // "%PDF"
  },
];

type Kind = "image" | "video" | "pdf";

function detectKind(mimetype: string): Kind | null {
  if (ALLOWED_IMAGE_MIMES.has(mimetype)) return "image";
  if (ALLOWED_VIDEO_MIMES.has(mimetype)) return "video";
  if (ALLOWED_PDF_MIMES.has(mimetype)) return "pdf";
  return null;
}

function verifyMagicBytes(buffer: Buffer, mimetype: string): boolean {
  // Videos don't have a simple universal magic check, we trust mime.
  if (mimetype.startsWith("video/")) return true;

  const matches = MAGIC_BYTES.filter((m) =>
    mimetype === "image/jpg" ? m.mime === "image/jpeg" : m.mime === mimetype,
  );
  if (matches.length === 0) {
    return true; // unknown mapping — let cloudinary handle it
  }
  return matches.some((m) =>
    m.segments.every((seg) =>
      seg.bytes.every((byte, i) => buffer[seg.offset + i] === byte),
    ),
  );
}

export interface ValidatableFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Validate an uploaded file:
 * - MIME must be in an allow-list
 * - Size must not exceed the per-kind limit
 * - Magic bytes must match the declared mime (where applicable)
 */
export function validateUploadedFile(file: ValidatableFile): void {
  const kind = detectKind(file.mimetype);
  if (!kind) {
    throw new BadRequestException(
      `Tipo de archivo no permitido: ${file.mimetype}`,
    );
  }

  const size = file.buffer.byteLength;
  if (kind === "image" && size > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `La imagen ${file.filename} excede el tamaño máximo (10 MB).`,
    );
  }
  if (kind === "video" && size > MAX_VIDEO_BYTES) {
    throw new BadRequestException(
      `El video ${file.filename} excede el tamaño máximo (50 MB).`,
    );
  }
  if (kind === "pdf" && size > MAX_PDF_BYTES) {
    throw new BadRequestException(
      `El PDF ${file.filename} excede el tamaño máximo (15 MB).`,
    );
  }

  if (!verifyMagicBytes(file.buffer, file.mimetype)) {
    throw new BadRequestException(
      `El archivo ${file.filename} no coincide con el tipo declarado.`,
    );
  }
}

export function validateUploadedFiles(files: ValidatableFile[]): void {
  if (files.length > MAX_FILES_PER_ANNOUNCEMENT) {
    throw new BadRequestException(
      `Máximo ${MAX_FILES_PER_ANNOUNCEMENT} archivos por anuncio.`,
    );
  }
  for (const f of files) {
    validateUploadedFile(f);
  }
}

/** For church studies: only audio files are allowed, up to 25 MB. */
export function validateStudyAudio(file: ValidatableFile): void {
  if (!ALLOWED_AUDIO_MIMES.has(file.mimetype)) {
    throw new BadRequestException(
      `Solo se permiten archivos de audio para los estudios (recibido: ${file.mimetype}).`,
    );
  }
  if (file.buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new BadRequestException(
      `El audio ${file.filename} excede el tamaño máximo (25 MB).`,
    );
  }
}

/* ── Documentos de informes ─────────────────────────────────────────────── */

/**
 * Tope por documento. Es el máximo que admite el plan gratuito de Cloudinary
 * para archivos crudos, que es como se guardan estos documentos.
 */
export const MAX_REPORT_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_REPORT_DOCUMENTS_PER_UPLOAD = 5;
export const MAX_REPORT_DOCUMENTS_PER_REPORT = 10;

export type ReportDocumentKind = "pdf" | "image" | "word" | "excel";

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

const REPORT_DOCUMENT_TYPES: Record<
  string,
  {
    mime: string;
    kind: ReportDocumentKind;
    segments: Array<{ offset: number; bytes: number[] }>;
    /** Texto que debe aparecer dentro del archivo (formatos ZIP de Office). */
    contiene?: string;
  }
> = {
  pdf: {
    mime: "application/pdf",
    kind: "pdf",
    segments: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  },
  jpg: {
    mime: "image/jpeg",
    kind: "image",
    segments: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  png: {
    mime: "image/png",
    kind: "image",
    segments: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  },
  webp: {
    mime: "image/webp",
    kind: "image",
    segments: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "word",
    segments: [{ offset: 0, bytes: ZIP }],
    contiene: "word/",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "excel",
    segments: [{ offset: 0, bytes: ZIP }],
    contiene: "xl/",
  },
  doc: {
    mime: "application/msword",
    kind: "word",
    segments: [{ offset: 0, bytes: OLE }],
  },
  xls: {
    mime: "application/vnd.ms-excel",
    kind: "excel",
    segments: [{ offset: 0, bytes: OLE }],
  },
};

/** Tipos genéricos que mandan algunos navegadores cuando no reconocen el archivo. */
const MIME_GENERICOS = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-download",
]);

export interface ValidatedReportDocument {
  extension: string;
  mimeType: string;
  kind: ReportDocumentKind;
}

/**
 * Valida un documento de informe: PDF, imagen JPG, PNG o WEBP, Word o Excel,
 * de hasta 10 MB.
 *
 * El tipo se decide por la extensión y se confirma con el contenido real del
 * archivo. El tipo que declara el cliente solo se usa para rechazar
 * contradicciones: hay navegadores que no reconocen los formatos de Office y
 * los mandan como genéricos, y eso no debe impedir la subida.
 */
export function validateReportDocument(
  file: ValidatableFile,
): ValidatedReportDocument {
  const nombre = (file.filename ?? "").trim();
  const punto = nombre.lastIndexOf(".");
  let ext = punto >= 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  if (ext === "jpeg") ext = "jpg";

  const spec = REPORT_DOCUMENT_TYPES[ext];
  if (!spec) {
    throw new BadRequestException(
      `No se acepta "${nombre || "el archivo"}". Se permiten PDF, imágenes JPG, PNG o WEBP, Word y Excel.`,
    );
  }

  const declarado = (file.mimetype ?? "").toLowerCase();
  const coincide =
    declarado === spec.mime ||
    (spec.mime === "image/jpeg" && declarado === "image/jpg");
  if (!coincide && !MIME_GENERICOS.has(declarado)) {
    throw new BadRequestException(
      `El archivo ${nombre} no coincide con el tipo declarado.`,
    );
  }

  const size = file.buffer.byteLength;
  if (size === 0) {
    throw new BadRequestException(`El archivo ${nombre} está vacío.`);
  }
  if (size > MAX_REPORT_DOCUMENT_BYTES) {
    throw new BadRequestException(
      `El archivo ${nombre} supera el tamaño máximo de 10 MB.`,
    );
  }

  const firmaOk = spec.segments.every((seg) =>
    seg.bytes.every((byte, i) => file.buffer[seg.offset + i] === byte),
  );
  const contenidoOk =
    !spec.contiene ||
    file.buffer.includes(Buffer.from(spec.contiene, "latin1"));
  if (!firmaOk || !contenidoOk) {
    throw new BadRequestException(
      `El contenido de ${nombre} no corresponde a un archivo ${ext.toUpperCase()} válido.`,
    );
  }

  return { extension: ext, mimeType: spec.mime, kind: spec.kind };
}

/** For churches: only images are allowed for main/cover. */
export function validateChurchImage(file: ValidatableFile): void {
  const kind = detectKind(file.mimetype);
  if (kind !== "image") {
    throw new BadRequestException(
      `Solo se permiten imágenes para las iglesias (recibido: ${file.mimetype}).`,
    );
  }
  if (file.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `La imagen ${file.filename} excede el tamaño máximo (10 MB).`,
    );
  }
  if (!verifyMagicBytes(file.buffer, file.mimetype)) {
    throw new BadRequestException(
      `El archivo ${file.filename} no coincide con el tipo declarado.`,
    );
  }
}
