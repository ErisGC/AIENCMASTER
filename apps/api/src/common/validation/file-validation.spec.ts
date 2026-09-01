import { BadRequestException } from "@nestjs/common";

import { validateChurchImage, type ValidatableFile } from "./file-validation";

/**
 * Regresión: la comprobación de contenido de WEBP sólo miraba "RIFF", que es
 * la marca del contenedor, no del formato. Cualquier otro contenedor RIFF —un
 * WAV o un AVI— declarado como `image/webp` pasaba el filtro, que era
 * justamente lo que la comprobación pretendía evitar.
 */
describe("validateChurchImage — firmas de contenido", () => {
  const archivo = (mimetype: string, bytes: number[]): ValidatableFile => ({
    filename: "prueba",
    mimetype,
    buffer: Buffer.from(bytes),
  });

  const RIFF = [0x52, 0x49, 0x46, 0x46];
  const TAMANO = [0x00, 0x00, 0x00, 0x00];
  const WEBP = [0x57, 0x45, 0x42, 0x50];
  const WAVE = [0x57, 0x41, 0x56, 0x45];

  it("acepta un webp de verdad", () => {
    expect(() =>
      validateChurchImage(
        archivo("image/webp", [...RIFF, ...TAMANO, ...WEBP, 0x00]),
      ),
    ).not.toThrow();
  });

  it("rechaza un WAV disfrazado de webp", () => {
    expect(() =>
      validateChurchImage(
        archivo("image/webp", [...RIFF, ...TAMANO, ...WAVE, 0x00]),
      ),
    ).toThrow(BadRequestException);
  });

  it("rechaza un archivo que ni siquiera es RIFF", () => {
    expect(() =>
      validateChurchImage(archivo("image/webp", [0x00, 0x01, 0x02, 0x03])),
    ).toThrow(BadRequestException);
  });

  it("sigue aceptando los formatos de siempre", () => {
    expect(() =>
      validateChurchImage(archivo("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d])),
    ).not.toThrow();
    expect(() =>
      validateChurchImage(archivo("image/jpeg", [0xff, 0xd8, 0xff, 0xe0])),
    ).not.toThrow();
  });

  it("rechaza un ejecutable renombrado a png", () => {
    // "MZ" — cabecera de un ejecutable de Windows.
    expect(() =>
      validateChurchImage(archivo("image/png", [0x4d, 0x5a, 0x90, 0x00])),
    ).toThrow(BadRequestException);
  });
});
