import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AdminAccount } from "./admin-account.entity";
import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminDevice } from "./admin_device.entity";
import { AdminSessionService } from "./admin-session.service";
import { AdminRole } from "./enums/admin-role.enum";
import { ChurchPermission, GlobalPermission } from "./permissions/permission.enums";

/**
 * Regresión de contrato: la cuenta que viaja en la respuesta de sesión y de
 * login debe incluir los permisos efectivos.
 *
 * La web (ActiveChurchProvider) y la app (AuthState) deciden con estos datos
 * sobre qué iglesias puede operar un administrador. Cuando faltaban, todo
 * admin que no fuera el principal veía "Sin asignación": no podía elegir
 * iglesia y, por tanto, no podía registrar informes ni publicar anuncios
 * locales desde el panel.
 */
describe("AdminSessionService.serializeAccount — permisos efectivos", () => {
  let service: AdminSessionService;

  const repoMock = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    process.env.ADMIN_SESSION_SECRET =
      process.env.ADMIN_SESSION_SECRET ?? "x".repeat(48);

    const module = await Test.createTestingModule({
      providers: [
        AdminSessionService,
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: getRepositoryToken(AdminAccount), useValue: repoMock() },
        { provide: getRepositoryToken(AdminDevice), useValue: repoMock() },
        { provide: getRepositoryToken(AdminAccessRequest), useValue: repoMock() },
      ],
    }).compile();

    service = module.get(AdminSessionService);
  });

  it("un admin normal recibe sus iglesias asignadas con sus permisos", () => {
    const account = {
      id: "admin-1",
      username: "pastor",
      displayName: "Pastor",
      role: AdminRole.ADMIN,
      isActive: true,
      globalPermissions: [],
      churchAssignments: [
        {
          id: "asg-1",
          churchId: "church-1",
          permissions: [ChurchPermission.SUBMIT_REPORTS],
          church: { name: "Iglesia Central" },
        },
      ],
      lastLoginAt: null,
    } as unknown as AdminAccount;

    const out = service.serializeAccount(account);

    expect(out.churchAssignments).toHaveLength(1);
    expect(out.churchAssignments[0]).toEqual({
      id: "asg-1",
      churchId: "church-1",
      churchName: "Iglesia Central",
      permissions: [ChurchPermission.SUBMIT_REPORTS],
    });
    expect(out.globalPermissions).toEqual([]);
  });

  it("el administrador principal recibe todos los permisos globales", () => {
    const root = {
      id: "root-1",
      username: "root",
      displayName: "Principal",
      role: AdminRole.ROOT,
      isActive: true,
      globalPermissions: [],
      lastLoginAt: null,
    } as unknown as AdminAccount;

    const out = service.serializeAccount(root);

    expect(out.globalPermissions).toEqual(Object.values(GlobalPermission));
    // ROOT opera sobre todas las iglesias, así que no tiene asignaciones.
    expect(out.churchAssignments).toEqual([]);
  });

  it("no revienta si la relación no viene cargada", () => {
    const account = {
      id: "admin-2",
      username: "sinrelacion",
      displayName: "Sin relación",
      role: AdminRole.ADMIN,
      isActive: true,
      globalPermissions: [GlobalPermission.VIEW_ALL_REPORTS],
      lastLoginAt: null,
    } as unknown as AdminAccount;

    const out = service.serializeAccount(account);

    expect(out.churchAssignments).toEqual([]);
    expect(out.globalPermissions).toEqual([GlobalPermission.VIEW_ALL_REPORTS]);
  });

  it("nunca expone credenciales de la cuenta", () => {
    const account = {
      id: "admin-3",
      username: "alguien",
      displayName: "Alguien",
      role: AdminRole.ADMIN,
      isActive: true,
      passwordHash: "$2a$12$hashquenodebesalir",
      tokenVersion: 7,
      globalPermissions: [],
      lastLoginAt: null,
    } as unknown as AdminAccount;

    const payload = JSON.stringify(service.serializeAccount(account));

    expect(payload).not.toContain("passwordHash");
    expect(payload).not.toContain("tokenVersion");
  });
});
