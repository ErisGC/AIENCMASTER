import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Regresión: el registro de auditoría se traga cualquier fallo para que una
 * caída del registro no tumbe la operación del usuario. Eso está bien fuera de
 * una transacción, pero dentro es peligroso.
 *
 * Si el registro falla estando en una transacción, Postgres la deja abortada:
 * el COMMIT posterior se convierte en ROLLBACK sin devolver error, y el
 * llamante sigue como si todo hubiera ido bien. En el arranque del
 * administrador principal eso llegaba a emitir cookies de sesión válidas para
 * una cuenta que la base de datos nunca guardó.
 */
describe("AdminAuditService.log", () => {
  let service: AdminAuditService;
  let repoPorDefecto: { create: jest.Mock; save: jest.Mock };

  const entrada = {
    actionType: "PRUEBA",
    targetType: "ADMIN_ACCOUNT",
    description: "Registro de prueba",
  };

  beforeEach(async () => {
    repoPorDefecto = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        {
          provide: getRepositoryToken(AdminActionLog),
          useValue: repoPorDefecto,
        },
      ],
    }).compile();

    service = moduleRef.get(AdminAuditService);
  });

  it("fuera de transacción, un fallo NO rompe la operación", async () => {
    repoPorDefecto.save.mockRejectedValue(new Error("BD caída"));

    await expect(service.log(entrada)).resolves.toBeNull();
  });

  it("dentro de una transacción, el fallo SÍ se propaga", async () => {
    const repoTransaccional = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn().mockRejectedValue(new Error("transacción abortada")),
    } as unknown as Repository<AdminActionLog>;

    await expect(
      service.log(entrada, repoTransaccional),
    ).rejects.toThrow(/transacción abortada/);
  });

  it("en el camino feliz devuelve la entrada guardada", async () => {
    repoPorDefecto.save.mockResolvedValue({ id: "log-1" });

    await expect(service.log(entrada)).resolves.toEqual({ id: "log-1" });
  });
});
