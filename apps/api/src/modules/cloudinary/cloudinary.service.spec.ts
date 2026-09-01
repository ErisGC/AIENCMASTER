import { CloudinaryService } from "./cloudinary.service";

/**
 * Regresión de fuga de almacenamiento: Cloudinary archiva los audios como
 * `video`, y borrar con el tipo equivocado NO falla — simplemente no borra
 * nada. Por eso el tipo con el que se subió cada archivo se guarda en la base
 * de datos y debe usarse al eliminarlo.
 *
 * Cuando los adjuntos de los anuncios se borraban sin pasar el tipo, cada
 * anuncio con video eliminado dejaba el archivo huérfano en Cloudinary para
 * siempre, consumiendo cuota.
 */
describe("CloudinaryService.resourceTypeFor", () => {
  it("conserva los tipos que Cloudinary acepta al borrar", () => {
    expect(CloudinaryService.resourceTypeFor("video")).toBe("video");
    expect(CloudinaryService.resourceTypeFor("raw")).toBe("raw");
    expect(CloudinaryService.resourceTypeFor("image")).toBe("image");
  });

  it("un audio guardado como video se borra como video", () => {
    // Es el caso de los estudios: se suben como audio y Cloudinary los
    // clasifica como `video`.
    expect(CloudinaryService.resourceTypeFor("video")).toBe("video");
  });

  it("cae a imagen ante valores desconocidos o ausentes", () => {
    expect(CloudinaryService.resourceTypeFor(null)).toBe("image");
    expect(CloudinaryService.resourceTypeFor(undefined)).toBe("image");
    expect(CloudinaryService.resourceTypeFor("")).toBe("image");
    expect(CloudinaryService.resourceTypeFor("cualquier-cosa")).toBe("image");
  });
});
