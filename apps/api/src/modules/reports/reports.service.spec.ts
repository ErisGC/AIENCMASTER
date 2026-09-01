import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { Church } from "../churches/church.entity";
import { Report } from "./report.entity";
import { ReportType } from "./enums/report-type.enum";
import { ReportsService } from "./reports.service";
import type { UpdateReportDto } from "./dto/update-report.dto";

/**
 * Regresión de seguridad: `GET /admin/reports/:id` devuelve la entidad Report
 * tal cual la sirve este servicio. Si `findOne` vuelve a cargar la relación
 * `createdByAdminAccount`, la respuesta arrastraría el `passwordHash` (bcrypt),
 * el `tokenVersion` y los permisos globales del admin autor hacia cualquier
 * otro admin con permiso de lectura sobre ese informe.
 *
 * El informe ya lleva `createdByAdminAccountId` y el snapshot
 * `createdByDisplayName`, que es lo único que consumen la web y la app.
 */
describe("ReportsService — findOne no expone la cuenta del autor", () => {
  let service: ReportsService;

  const CHURCH_A = "11111111-1111-4111-8111-111111111111";
  const REPORT_ID = "22222222-2222-4222-8222-222222222222";

  const reportRepo = { findOne: jest.fn() };
  const churchRepo = { findOne: jest.fn() };
  const permissions = {
    isRoot: jest.fn(),
    hasChurchPermission: jest.fn(),
    hasGlobalPermission: jest.fn(),
    getAssignedChurchIds: jest.fn(),
  };

  const root = { id: "root-1", role: "ROOT" } as unknown as AdminAccount;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: reportRepo },
        { provide: getRepositoryToken(Church), useValue: churchRepo },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it("no pide la relación createdByAdminAccount al repositorio", async () => {
    permissions.isRoot.mockReturnValue(true);
    reportRepo.findOne.mockResolvedValue({
      id: REPORT_ID,
      churchId: CHURCH_A,
      createdByAdminAccountId: "author-1",
      createdByDisplayName: "Autor de prueba",
    });

    await service.findOne(REPORT_ID, root);

    expect(reportRepo.findOne).toHaveBeenCalledTimes(1);
    const args = reportRepo.findOne.mock.calls[0][0] as {
      relations?: string[] | Record<string, unknown>;
    };
    const relations = args.relations ?? [];
    const asList = Array.isArray(relations)
      ? relations
      : Object.keys(relations);

    expect(asList).not.toContain("createdByAdminAccount");
  });

  it("la entidad devuelta no arrastra credenciales del autor", async () => {
    permissions.isRoot.mockReturnValue(true);
    reportRepo.findOne.mockResolvedValue({
      id: REPORT_ID,
      churchId: CHURCH_A,
      createdByAdminAccountId: "author-1",
      createdByDisplayName: "Autor de prueba",
      church: { id: CHURCH_A, name: "Iglesia A" },
    });

    const report = await service.findOne(REPORT_ID, root);

    // Serializamos igual que hace Nest al responder, y comprobamos que ningún
    // campo sensible viaja al cliente.
    const payload = JSON.stringify(report);
    expect(payload).not.toContain("passwordHash");
    expect(payload).not.toContain("tokenVersion");
    expect(payload).not.toContain("globalPermissions");
    // Lo que sí debe seguir estando para que la UI muestre el autor:
    expect(report.createdByAdminAccountId).toBe("author-1");
    expect(report.createdByDisplayName).toBe("Autor de prueba");
  });

  /**
   * Regresión: al editar, las validaciones sólo miraban lo que venía en la
   * petición y no lo que quedaría guardado.
   */
  describe("update — validaciones contra el estado final", () => {
    const baseGuardado = {
      id: REPORT_ID,
      churchId: CHURCH_A,
      reportType: ReportType.OFFERINGS,
      title: "Ofrendas de junio",
      notes: "",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-06-30T00:00:00Z"),
      data: { totalCop: 500000 },
      createdByAdminAccountId: "author-1",
      createdByDisplayName: "Autor",
    };

    beforeEach(() => {
      permissions.isRoot.mockReturnValue(true);
      reportRepo.findOne.mockResolvedValue({ ...baseGuardado });
      (reportRepo as unknown as { save: jest.Mock }).save = jest.fn((x) => x);
    });

    it("rechaza dejar la fecha final antes de la inicial enviando un solo extremo", async () => {
      // Sólo se manda periodEnd; el inicio guardado es el 1 de junio.
      await expect(
        service.update(
          REPORT_ID,
          { periodEnd: "2026-05-01T00:00:00Z" } as UpdateReportDto,
          root,
        ),
      ).rejects.toThrow(/periodEnd no puede ser anterior/);
    });

    it("acepta mover sólo la fecha final si sigue siendo posterior", async () => {
      await expect(
        service.update(
          REPORT_ID,
          { periodEnd: "2026-07-15T00:00:00Z" } as UpdateReportDto,
          root,
        ),
      ).resolves.toBeDefined();
    });

    it("revalida los datos al cambiar el tipo aunque no se reenvíen", async () => {
      // De OFFERINGS a ATTENDANCE: los datos guardados no traen `count`.
      await expect(
        service.update(
          REPORT_ID,
          { reportType: ReportType.ATTENDANCE } as UpdateReportDto,
          root,
        ),
      ).rejects.toBeDefined();
    });
  });
});
