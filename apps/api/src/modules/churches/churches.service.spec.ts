import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";

import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ChurchDirector } from "./church-director.entity";
import { Church } from "./church.entity";
import { ChurchesService } from "./churches.service";
import { CreateChurchDto } from "./dto/create-church.dto";
import { UpdateChurchDto } from "./dto/update-church.dto";
import { DirectorsService } from "./directors.service";

/**
 * Regresión de seguridad: los identificadores de Cloudinary de una iglesia los
 * escribe el servidor al subir el archivo y nadie más debe poder tocarlos.
 *
 * Cuando estaban declarados en el DTO, un administrador con permiso de edición
 * podía enviar el identificador de un archivo cualquiera; en la siguiente
 * edición con imagen el servidor lo tomaba por la imagen anterior y lo
 * borraba, con lo que se podían destruir imágenes de otras iglesias o los
 * fondos del portal. Y enviarlos junto con un archivo pisaba en la base de
 * datos la imagen recién subida.
 */
describe("Iglesias — las imágenes sólo las escribe el servidor", () => {
  let service: ChurchesService;

  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => x),
  };
  const cloudinary = { uploadToFolder: jest.fn(), delete: jest.fn() };
  const directors = { findPublicByChurch: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChurchesService,
        { provide: getRepositoryToken(Church), useValue: repo },
        { provide: getRepositoryToken(ChurchDirector), useValue: repo },
        { provide: CloudinaryService, useValue: cloudinary },
        { provide: DirectorsService, useValue: directors },
      ],
    }).compile();

    service = module.get<ChurchesService>(ChurchesService);
  });

  describe("el DTO rechaza los campos de imagen", () => {
    const camposProhibidos = [
      "mainImageUrl",
      "mainImagePublicId",
      "coverImageUrl",
      "coverImagePublicId",
    ];

    it.each(camposProhibidos)("rechaza %s al crear", async (campo) => {
      const dto = plainToInstance(CreateChurchDto, {
        name: "Iglesia",
        city: "Valledupar",
        [campo]: "algun/identificador/ajeno",
      });
      const errores = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errores.map((e) => e.property)).toContain(campo);
    });

    it.each(camposProhibidos)("rechaza %s al editar", async (campo) => {
      const dto = plainToInstance(UpdateChurchDto, {
        [campo]: "algun/identificador/ajeno",
      });
      const errores = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errores.map((e) => e.property)).toContain(campo);
    });
  });

  it("la imagen recién subida gana sobre lo que traiga el cuerpo", async () => {
    repo.findOne.mockResolvedValue({
      id: "church-1",
      name: "Antiguo",
      mainImageUrl: "https://cdn/vieja.png",
      mainImagePublicId: "churches/vieja",
    });
    cloudinary.uploadToFolder.mockResolvedValue({
      secure_url: "https://cdn/nueva.png",
      public_id: "churches/nueva",
    });

    const guardada = (await service.update(
      "church-1",
      { name: "Nuevo nombre" } as UpdateChurchDto,
      {
        mainImage: {
          filename: "f.png",
          mimetype: "image/png",
          buffer: Buffer.alloc(8),
        },
      },
    )) as Church;

    expect(guardada.mainImageUrl).toBe("https://cdn/nueva.png");
    expect(guardada.mainImagePublicId).toBe("churches/nueva");
    expect(guardada.name).toBe("Nuevo nombre");
    // Y sólo se borró la imagen que de verdad tenía esa iglesia.
    expect(cloudinary.delete).toHaveBeenCalledTimes(1);
    expect(cloudinary.delete).toHaveBeenCalledWith("churches/vieja");
  });

  it("al crear, los identificadores salen de la subida y no del cuerpo", async () => {
    cloudinary.uploadToFolder.mockResolvedValue({
      secure_url: "https://cdn/creada.png",
      public_id: "churches/creada",
    });

    const creada = (await service.create(
      { name: "Nueva", city: "Valledupar" } as CreateChurchDto,
      {
        mainImage: {
          filename: "f.png",
          mimetype: "image/png",
          buffer: Buffer.alloc(8),
        },
      },
    )) as Church;

    expect(creada.mainImageUrl).toBe("https://cdn/creada.png");
    expect(creada.mainImagePublicId).toBe("churches/creada");
  });
});
