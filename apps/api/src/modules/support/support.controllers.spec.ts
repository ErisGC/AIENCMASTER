import { BadRequestException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AdminRateLimitService } from "../admin-security/admin-rate-limit.service";
import type { AdminRequest } from "../admin-security/admin-security.types";
import { PublicSupportController } from "./support.controllers";
import { SupportService } from "./support.service";

/**
 * Regresión de abuso: los endpoints de soporte para visitantes no piden
 * autenticación.
 *
 * 1. El tope de mensajes del servicio se cuenta contra el token que guarda el
 *    navegador, y ese token lo elige quien llama: bastaba con omitirlo para
 *    estrenar identidad y saltarse el límite. Hace falta un freno por IP.
 * 2. Los archivos se acumulaban en memoria y el máximo se comprobaba al
 *    terminar de leer la petición, así que una sola petición con muchos
 *    adjuntos podía tumbar el proceso antes de llegar a la validación.
 */
describe("PublicSupportController — protección de abuso", () => {
  let controller: PublicSupportController;
  let rateLimit: AdminRateLimitService;

  const service = {
    guestStart: jest.fn().mockResolvedValue({ token: "t", conversation: {} }),
    replyAsAuthor: jest.fn().mockResolvedValue({}),
    guestList: jest.fn(),
    threadForAuthor: jest.fn(),
  };

  /** Petición multipart falsa con el número de archivos indicado. */
  function fakeRequest(fileCount: number, ip = "203.0.113.7"): AdminRequest {
    const parts = [
      { type: "field", fieldname: "name", value: "Visitante" },
      { type: "field", fieldname: "subject", value: "Un asunto" },
      { type: "field", fieldname: "body", value: "Hola" },
      ...Array.from({ length: fileCount }, (_, i) => ({
        type: "file",
        fieldname: "files",
        filename: `captura-${i}.png`,
        mimetype: "image/png",
        toBuffer: () => Promise.resolve(Buffer.alloc(16)),
      })),
    ];
    return {
      ip,
      parts: () => ({
        async *[Symbol.asyncIterator]() {
          for (const p of parts) yield p;
        },
      }),
    } as unknown as AdminRequest;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PublicSupportController],
      providers: [
        { provide: SupportService, useValue: service },
        AdminRateLimitService,
      ],
    }).compile();

    controller = module.get(PublicSupportController);
    rateLimit = module.get(AdminRateLimitService);
  });

  it("corta la lectura al superar el máximo de adjuntos", async () => {
    await expect(controller.start(fakeRequest(6))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // No debe haber llegado al servicio: se corta durante la lectura.
    expect(service.guestStart).not.toHaveBeenCalled();
  });

  it("acepta un mensaje dentro del máximo de adjuntos", async () => {
    await expect(controller.start(fakeRequest(5))).resolves.toBeDefined();
    expect(service.guestStart).toHaveBeenCalledTimes(1);
    const enviado = service.guestStart.mock.calls[0][0] as {
      files: unknown[];
    };
    expect(enviado.files).toHaveLength(5);
  });

  it("bloquea por IP aunque cada envío estrene un token distinto", async () => {
    const ip = "198.51.100.4";

    // El tope por IP de la política son 30 envíos por hora.
    for (let i = 0; i < 30; i++) {
      await controller.start(fakeRequest(0, ip));
    }
    expect(service.guestStart).toHaveBeenCalledTimes(30);

    // El siguiente cae, sin importar que no se mande token alguno.
    await expect(controller.start(fakeRequest(0, ip))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(service.guestStart).toHaveBeenCalledTimes(30);
  });

  it("el bloqueo de una IP no afecta a otra", async () => {
    for (let i = 0; i < 30; i++) {
      await controller.start(fakeRequest(0, "198.51.100.10"));
    }
    await expect(
      controller.start(fakeRequest(0, "198.51.100.10")),
    ).rejects.toBeInstanceOf(HttpException);

    // Otro visitante, otra IP: sigue pudiendo escribir.
    await expect(
      controller.start(fakeRequest(0, "198.51.100.11")),
    ).resolves.toBeDefined();
  });

  it("las respuestas a un hilo también pasan por el freno de IP", async () => {
    const spy = jest.spyOn(rateLimit, "consume");
    await controller.reply(
      "11111111-1111-4111-8111-111111111111",
      fakeRequest(0),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "support-guest" }),
    );
  });
});
