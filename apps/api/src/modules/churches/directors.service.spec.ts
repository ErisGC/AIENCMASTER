import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { ChurchPermission } from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ChurchDirector } from "./church-director.entity";
import { Church } from "./church.entity";
import { DirectorsService } from "./directors.service";
import { CreateDirectorDto } from "./dto/create-director.dto";
import { UpdateDirectorDto } from "./dto/update-director.dto";

/**
 * Regresión de seguridad: la gestión de directores debe autorizar SIEMPRE
 * por el permiso canónico MANAGE_DIRECTORS sobre la iglesia concreta (vía
 * PermissionsService), nunca por el campo legacy assignedChurchId. Esto cierra
 * la escalada de privilegios (un tesorero con sólo SUBMIT_REPORTS no puede
 * gestionar directores) y la variante IDOR de cuentas vinculadas.
 */
describe("DirectorsService (autorización)", () => {
  let service: DirectorsService;

  const CHURCH_A = "11111111-1111-4111-8111-111111111111";

  const directorRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const churchRepo = { findOne: jest.fn() };
  const accountRepo = { findOne: jest.fn() };
  const cloudinary = { uploadToFolder: jest.fn(), delete: jest.fn() };
  const permissions = {
    assertChurchPermission: jest.fn(),
    getAssignedChurchIds: jest.fn(),
  };

  // Tesorero: ADMIN normal, sin MANAGE_DIRECTORS.
  const treasurer = { id: "actor-1", role: "ADMIN" } as unknown as AdminAccount;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DirectorsService,
        { provide: getRepositoryToken(ChurchDirector), useValue: directorRepo },
        { provide: getRepositoryToken(Church), useValue: churchRepo },
        { provide: getRepositoryToken(AdminAccount), useValue: accountRepo },
        { provide: CloudinaryService, useValue: cloudinary },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get<DirectorsService>(DirectorsService);
  });

  it("bloquea LISTAR a quien no tiene MANAGE_DIRECTORS y no toca la BD", async () => {
    permissions.assertChurchPermission.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      service.findAdminByChurch(CHURCH_A, treasurer),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.assertChurchPermission).toHaveBeenCalledWith(
      treasurer,
      CHURCH_A,
      ChurchPermission.MANAGE_DIRECTORS,
    );
    expect(directorRepo.find).not.toHaveBeenCalled();
  });

  it("bloquea CREAR a quien no tiene MANAGE_DIRECTORS y no persiste", async () => {
    permissions.assertChurchPermission.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      service.create(
        CHURCH_A,
        { displayName: "Juan", role: "Pastor" } as CreateDirectorDto,
        null,
        treasurer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.assertChurchPermission).toHaveBeenCalledWith(
      treasurer,
      CHURCH_A,
      ChurchPermission.MANAGE_DIRECTORS,
    );
    expect(directorRepo.save).not.toHaveBeenCalled();
  });

  it("bloquea EDITAR sobre la iglesia del director (no la del actor)", async () => {
    directorRepo.findOne.mockResolvedValue({ id: "d1", churchId: CHURCH_A });
    permissions.assertChurchPermission.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      service.update("d1", {} as UpdateDirectorDto, null, treasurer),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.assertChurchPermission).toHaveBeenCalledWith(
      treasurer,
      CHURCH_A,
      ChurchPermission.MANAGE_DIRECTORS,
    );
    expect(directorRepo.save).not.toHaveBeenCalled();
  });

  it("bloquea ELIMINAR a quien no tiene MANAGE_DIRECTORS", async () => {
    directorRepo.findOne.mockResolvedValue({ id: "d1", churchId: CHURCH_A });
    permissions.assertChurchPermission.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(service.remove("d1", treasurer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(directorRepo.remove).not.toHaveBeenCalled();
  });

  it("permite CREAR cuando MANAGE_DIRECTORS pasa", async () => {
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    churchRepo.findOne.mockResolvedValue({ id: CHURCH_A });
    directorRepo.save.mockResolvedValue({ id: "new", displayName: "Juan" });

    const res = await service.create(
      CHURCH_A,
      { displayName: "Juan", role: "Pastor" } as CreateDirectorDto,
      null,
      treasurer,
    );
    expect(res).toEqual({ id: "new", displayName: "Juan" });
    expect(directorRepo.save).toHaveBeenCalledTimes(1);
  });

  it("impide vincular una cuenta admin sin asignación real a la iglesia (IDOR)", async () => {
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    churchRepo.findOne.mockResolvedValue({ id: CHURCH_A });
    accountRepo.findOne.mockResolvedValue({ id: "linked", role: "ADMIN" });
    // La cuenta a vincular NO está asignada a la iglesia A.
    permissions.getAssignedChurchIds.mockResolvedValue([]);

    await expect(
      service.create(
        CHURCH_A,
        {
          displayName: "X",
          linkedAdminAccountId: "linked",
        } as CreateDirectorDto,
        null,
        treasurer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(directorRepo.save).not.toHaveBeenCalled();
  });

  // La misma regla al EDITAR: sin esto, un admin se la saltaba editando el
  // representante en vez de crearlo.
  it("impide vincular una cuenta ajena también al EDITAR (IDOR)", async () => {
    directorRepo.findOne.mockResolvedValue({ id: "d1", churchId: CHURCH_A });
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    accountRepo.findOne.mockResolvedValue({ id: "linked", role: "ADMIN" });
    permissions.getAssignedChurchIds.mockResolvedValue([]);

    await expect(
      service.update(
        "d1",
        { linkedAdminAccountId: "linked" } as UpdateDirectorDto,
        null,
        treasurer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(directorRepo.save).not.toHaveBeenCalled();
  });

  it("rechaza con mensaje claro una cuenta inexistente al editar", async () => {
    directorRepo.findOne.mockResolvedValue({ id: "d1", churchId: CHURCH_A });
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    accountRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update(
        "d1",
        { linkedAdminAccountId: "no-existe" } as UpdateDirectorDto,
        null,
        treasurer,
      ),
    ).rejects.toThrow(/Cuenta admin no encontrada/);
    expect(directorRepo.save).not.toHaveBeenCalled();
  });

  it("el principal sí puede vincular cualquier cuenta al editar", async () => {
    directorRepo.findOne.mockResolvedValue({ id: "d1", churchId: CHURCH_A });
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    accountRepo.findOne.mockResolvedValue({ id: "linked", role: "ADMIN" });
    directorRepo.save.mockResolvedValue({ id: "d1" });

    const root = { id: "root", role: "ROOT" } as unknown as AdminAccount;
    await expect(
      service.update(
        "d1",
        { linkedAdminAccountId: "linked" } as UpdateDirectorDto,
        null,
        root,
      ),
    ).resolves.toBeDefined();
    expect(permissions.getAssignedChurchIds).not.toHaveBeenCalled();
  });
});
