import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AdminAccount } from "./admin-account.entity";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminActionLog } from "./admin-action-log.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AdminChurchAssignment } from "./admin-church-assignment.entity";
import { AdminSecurityService } from "./admin-security.service";
import { AdminSessionService } from "./admin-session.service";
import { AdminDevice } from "./admin_device.entity";
import { Church } from "../churches/church.entity";
import { AdminRole } from "./enums/admin-role.enum";
import { ALL_CHURCH_PERMISSIONS } from "./permissions/permission.enums";
import type { AuthenticatedAdminContext } from "./admin-security.types";
import type { CreateAdminAccountDto } from "./dto/create-admin-account.dto";

/**
 * Regresión: crear un administrador desde el panel sólo escribía el campo
 * antiguo `assignedChurchId`, pero los permisos por iglesia se leen de
 * `admin_church_assignments`.
 *
 * La cuenta nueva quedaba sin poder hacer nada hasta que el servidor se
 * reiniciaba; en ese arranque, el migrador veía el campo suelto y le creaba la
 * asignación con TODOS los permisos. Es decir, pasaba de inservible a tenerlo
 * todo sin que nadie lo hubiera decidido, y en un momento impredecible.
 */
describe("AdminSecurityService — alta de administradores con iglesia", () => {
  let service: AdminSecurityService;

  const CHURCH = "33333333-3333-4333-8333-333333333333";

  const repoMock = () => ({
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => ({ id: "cuenta-nueva", ...(v as object) })),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const accountRepo = repoMock();
  const assignmentRepo = repoMock();
  const churchRepo = repoMock();
  const deviceRepo = repoMock();
  const accessRequestRepo = repoMock();
  const auditRepo = repoMock();

  const actor = {
    account: { id: "root-1", role: AdminRole.ROOT },
    device: { id: "dev-1" },
  } as unknown as AuthenticatedAdminContext;

  const dataSource = {
    // Forma de un solo argumento: transaction(work)
    transaction: jest.fn((work: unknown) =>
      (work as (m: unknown) => Promise<unknown>)({
        getRepository: (entity: unknown) => {
          if (entity === AdminAccount) return accountRepo;
          if (entity === AdminChurchAssignment) return assignmentRepo;
          throw new Error("Repositorio inesperado en la transacción");
        },
      }),
    ),
  } as unknown as DataSource;

  beforeEach(async () => {
    jest.clearAllMocks();

    // El alta comprueba que el username esté libre y que la iglesia exista;
    // al final relee la cuenta con sus asignaciones.
    accountRepo.findOne.mockImplementation((opts: { where?: { id?: string } }) =>
      opts?.where?.id
        ? Promise.resolve({
            id: "cuenta-nueva",
            username: "pastor",
            displayName: "Pastor",
            role: AdminRole.ADMIN,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            churchAssignments: [
              {
                id: "asg-1",
                churchId: CHURCH,
                permissions: [...ALL_CHURCH_PERMISSIONS],
                church: { name: "Iglesia Central" },
              },
            ],
          })
        : Promise.resolve(null),
    );
    churchRepo.findOne.mockResolvedValue({ id: CHURCH, name: "Iglesia Central" });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminSecurityService,
        { provide: getRepositoryToken(AdminAccount), useValue: accountRepo },
        { provide: getRepositoryToken(AdminDevice), useValue: deviceRepo },
        {
          provide: getRepositoryToken(AdminAccessRequest),
          useValue: accessRequestRepo,
        },
        { provide: getRepositoryToken(AdminActionLog), useValue: auditRepo },
        {
          provide: getRepositoryToken(AdminChurchAssignment),
          useValue: assignmentRepo,
        },
        { provide: getRepositoryToken(Church), useValue: churchRepo },
        {
          provide: AdminSessionService,
          useValue: { hashPassword: jest.fn().mockResolvedValue("hash") },
        },
        { provide: AdminAuditService, useValue: { log: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(AdminSecurityService);
  });

  const dto = {
    username: "pastor",
    password: "contrasena-larga",
    displayName: "Pastor",
    role: AdminRole.ADMIN,
    assignedChurchId: CHURCH,
  } as CreateAdminAccountDto;

  it("crea la asignación de iglesia junto con la cuenta", async () => {
    await service.createAdminAccount(dto, actor);

    expect(assignmentRepo.save).toHaveBeenCalledTimes(1);
    const guardada = assignmentRepo.save.mock.calls[0][0] as {
      adminAccountId: string;
      churchId: string;
      permissions: string[];
    };
    expect(guardada.churchId).toBe(CHURCH);
    expect(guardada.adminAccountId).toBe("cuenta-nueva");
    expect(guardada.permissions).toEqual([...ALL_CHURCH_PERMISSIONS]);
  });

  it("la cuenta y su asignación se guardan dentro de la misma transacción", async () => {
    await service.createAdminAccount(dto, actor);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it("devuelve la cuenta ya con sus asignaciones, sin esperar a un reinicio", async () => {
    const salida = (await service.createAdminAccount(dto, actor)) as {
      churchAssignments: { churchId: string }[];
    };
    expect(salida.churchAssignments).toHaveLength(1);
    expect(salida.churchAssignments[0].churchId).toBe(CHURCH);
  });

  it("rechaza una iglesia que no existe en vez de dejar la cuenta a medias", async () => {
    churchRepo.findOne.mockResolvedValue(null);
    await expect(service.createAdminAccount(dto, actor)).rejects.toThrow(
      /Iglesia no encontrada/,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("sin iglesia asignada no crea ninguna asignación", async () => {
    await service.createAdminAccount(
      { ...dto, assignedChurchId: undefined } as CreateAdminAccountDto,
      actor,
    );
    expect(assignmentRepo.save).not.toHaveBeenCalled();
  });
});
