import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { AdminRole } from "../admin-security/enums/admin-role.enum";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { ChurchDirector } from "../churches/church-director.entity";
import { Church } from "../churches/church.entity";
import { CreateEventDto } from "./dto/create-event.dto";
import { EventScope, EventType } from "./enums/event.enums";
import { Event } from "./event.entity";
import { EventsService } from "./events.service";

/**
 * Autorización y decisión de guardar. Las reglas de cruce puras tienen su
 * propia prueba; aquí se comprueba que el servicio las aplique con las
 * consecuencias correctas: quién puede crear qué, y que un cruce no se guarde
 * sin reconocimiento explícito.
 */
describe("EventsService", () => {
  let service: EventsService;

  const IGLESIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn((v: unknown) => v),
    createQueryBuilder: jest.fn(),
  };
  const churchRepo = { findOne: jest.fn() };
  const directorRepo = { find: jest.fn() };
  const permissions = {
    isRoot: jest.fn(),
    hasGlobalPermission: jest.fn(),
    assertChurchPermission: jest.fn(),
    hasChurchPermission: jest.fn(),
    getAssignedChurchIds: jest.fn(),
    churchIdsWithPermission: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
      work({
        getRepository: () => ({
          create: (v: unknown) => v,
          save: (filas: Array<Record<string, unknown>>) =>
            Promise.resolve(filas.map((f, i) => ({ ...f, id: `nuevo-${i}` }))),
        }),
      }),
    ),
  };

  const adminLocal = {
    id: "admin-1",
    role: AdminRole.ADMIN,
    globalPermissions: [],
    displayName: "Pastor",
  } as unknown as AdminAccount;

  const base: CreateEventDto = {
    title: "Culto de jóvenes",
    type: EventType.CULTO_JOVENES,
    scope: EventScope.LOCAL,
    churchId: IGLESIA,
    startsAt: "2026-03-15T19:00:00-05:00",
    endsAt: "2026-03-15T21:00:00-05:00",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    churchRepo.findOne.mockResolvedValue({ id: IGLESIA, name: "Central" });
    repo.find.mockResolvedValue([]); // sin vecinos → sin cruces
    repo.findOne.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        id: where.id,
        churchId: IGLESIA,
        title: "Culto de jóvenes",
        description: null,
        type: EventType.CULTO_JOVENES,
        scope: EventScope.LOCAL,
        startsAt: new Date("2026-03-16T00:00:00Z"),
        endsAt: new Date("2026-03-16T02:00:00Z"),
        location: null,
        seriesId: null,
        seriesRule: null,
        directors: [],
        church: { id: IGLESIA, name: "Central" },
        createdByAdminAccountId: "admin-1",
        createdByDisplayName: "Pastor",
        lastUpdatedByAdminAccountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    permissions.isRoot.mockReturnValue(false);
    permissions.hasGlobalPermission.mockReturnValue(false);
    permissions.assertChurchPermission.mockResolvedValue(undefined);
    permissions.churchIdsWithPermission.mockResolvedValue([IGLESIA]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: repo },
        { provide: getRepositoryToken(Church), useValue: churchRepo },
        { provide: getRepositoryToken(ChurchDirector), useValue: directorRepo },
        { provide: PermissionsService, useValue: permissions },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  it("un admin local puede crear un evento LOCAL de su iglesia", async () => {
    const out = await service.crear(adminLocal, base);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].editable).toBe(true);
    expect(permissions.assertChurchPermission).toHaveBeenCalledWith(
      adminLocal,
      IGLESIA,
      "MANAGE_EVENTS",
    );
  });

  it("un admin local NO puede crear un evento GLOBAL sin el permiso global", async () => {
    await expect(
      service.crear(adminLocal, {
        ...base,
        scope: EventScope.GLOBAL,
        type: EventType.CULTO_UNIDO,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("un evento LOCAL sin iglesia se rechaza", async () => {
    await expect(
      service.crear(adminLocal, { ...base, churchId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("la hora de fin debe ser posterior a la de inicio", async () => {
    await expect(
      service.crear(adminLocal, { ...base, endsAt: base.startsAt }),
    ).rejects.toThrow(/posterior/);
  });

  it("con un cruce y sin reconocimiento responde 409 con el detalle", async () => {
    // Un intensivo global ya programado encima del culto.
    repo.find.mockResolvedValue([
      {
        id: "intensivo-1",
        title: "Intensivo de marzo",
        type: EventType.INTENSIVO,
        scope: EventScope.GLOBAL,
        churchId: null,
        church: null,
        startsAt: new Date("2026-03-15T13:00:00Z"),
        endsAt: new Date("2026-03-16T03:00:00Z"),
      },
    ]);

    let error: unknown;
    try {
      await service.crear(adminLocal, base);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConflictException);
    const cuerpo = (error as ConflictException).getResponse() as {
      conflicts: Array<{ conflicts: Array<{ title: string; kind: string }> }>;
    };
    expect(cuerpo.conflicts[0].conflicts[0].title).toBe("Intensivo de marzo");
    expect(cuerpo.conflicts[0].conflicts[0].kind).toBe("SE_CRUZA");
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("con el cruce reconocido guarda y devuelve los cruces para el historial", async () => {
    repo.find.mockResolvedValue([
      {
        id: "intensivo-1",
        title: "Intensivo de marzo",
        type: EventType.INTENSIVO,
        scope: EventScope.GLOBAL,
        churchId: null,
        church: null,
        startsAt: new Date("2026-03-15T13:00:00Z"),
        endsAt: new Date("2026-03-16T03:00:00Z"),
      },
    ]);

    const out = await service.crear(adminLocal, {
      ...base,
      acknowledgeConflicts: true,
    });
    expect(out.events).toHaveLength(1);
    expect(out.conflicts).toHaveLength(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it("una repetición semanal crea una fila por fecha, unidas por seriesId", async () => {
    const out = await service.crear(adminLocal, {
      ...base,
      repeat: { frequency: "WEEKLY", until: "2026-04-05T00:00:00-05:00" },
    });
    // 15, 22, 29 mar y 5 abr
    expect(out.events).toHaveLength(4);
    expect(out.seriesId).toBeTruthy();
  });

  it("una repetición de más de un año se rechaza", async () => {
    await expect(
      service.crear(adminLocal, {
        ...base,
        repeat: { frequency: "WEEKLY", until: "2027-06-01T00:00:00-05:00" },
      }),
    ).rejects.toThrow(/un año/);
  });

  it("un encargado de otra iglesia no puede ir en un evento LOCAL", async () => {
    directorRepo.find.mockResolvedValue([
      { id: "d1", churchId: "otra-iglesia", displayName: "Hermano Ajeno" },
    ]);
    await expect(
      service.crear(adminLocal, {
        ...base,
        directorIds: ["11111111-1111-4111-8111-111111111111"],
      }),
    ).rejects.toThrow(/no pertenece/);
  });
});
