import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  MAX_REPORT_DOCUMENT_BYTES,
  validateReportDocument,
} from "../../common/validation/file-validation";
import { AdminAccount } from "../admin-security/admin-account.entity";
import { AdminSessionService } from "../admin-security/admin-session.service";
import { AdminAccessRequest } from "../admin-security/admin-access-request.entity";
import { AdminDevice } from "../admin-security/admin_device.entity";
import { AdminDeviceStatus } from "../admin-security/enums/admin-device-status.enum";
import { AdminDeviceScope } from "../admin-security/enums/admin-device-scope.enum";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import type { AuthenticatedAdminContext } from "../admin-security/admin-security.types";
import { Church } from "../churches/church.entity";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { Report } from "./report.entity";
import { ReportDocument } from "./report-document.entity";
import { ReportType } from "./enums/report-type.enum";
import { ReportsService } from "./reports.service";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const zipCon = (texto: string) =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(texto, "latin1"),
  ]);

describe("validateReportDocument", () => {
  it("acepta PDF, imagen, Word y Excel, también con tipo genérico", () => {
    expect(
      validateReportDocument({
        filename: "extracto.pdf",
        mimetype: "application/pdf",
        buffer: PDF,
      }).kind,
    ).toBe("pdf");
    expect(
      validateReportDocument({
        filename: "recibo.JPEG",
        mimetype: "image/jpeg",
        buffer: JPG,
      }),
    ).toMatchObject({ kind: "image", extension: "jpg" });
    expect(
      validateReportDocument({
        filename: "acta.docx",
        mimetype: "application/octet-stream",
        buffer: zipCon("[Content_Types].xml word/document.xml"),
      }).kind,
    ).toBe("word");
    expect(
      validateReportDocument({
        filename: "planilla.xlsx",
        mimetype: "",
        buffer: zipCon("xl/workbook.xml"),
      }).kind,
    ).toBe("excel");
    expect(
      validateReportDocument({
        filename: "viejo.xls",
        mimetype: "application/vnd.ms-excel",
        buffer: OLE,
      }).kind,
    ).toBe("excel");
  });

  it("rechaza extensiones no permitidas", () => {
    expect(() =>
      validateReportDocument({
        filename: "virus.exe",
        mimetype: "application/octet-stream",
        buffer: PDF,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateReportDocument({
        filename: "sin-extension",
        mimetype: "application/pdf",
        buffer: PDF,
      }),
    ).toThrow(BadRequestException);
  });

  it("rechaza un archivo cuyo contenido no corresponde a su extensión", () => {
    // Un ZIP cualquiera renombrado a .docx no trae la carpeta word/.
    expect(() =>
      validateReportDocument({
        filename: "falso.docx",
        mimetype: "",
        buffer: zipCon("cualquier/cosa.txt"),
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateReportDocument({
        filename: "falso.pdf",
        mimetype: "application/pdf",
        buffer: JPG,
      }),
    ).toThrow(BadRequestException);
  });

  it("rechaza un tipo declarado que contradice la extensión", () => {
    expect(() =>
      validateReportDocument({
        filename: "doc.pdf",
        mimetype: "image/png",
        buffer: PDF,
      }),
    ).toThrow(BadRequestException);
  });

  it("rechaza archivos vacíos o de más de 10 MB", () => {
    expect(() =>
      validateReportDocument({
        filename: "vacio.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.alloc(0),
      }),
    ).toThrow(BadRequestException);
    const grande = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_REPORT_DOCUMENT_BYTES),
    ]);
    expect(() =>
      validateReportDocument({
        filename: "grande.pdf",
        mimetype: "application/pdf",
        buffer: grande,
      }),
    ).toThrow(BadRequestException);
  });
});

describe("ReportsService — documentos privados", () => {
  let service: ReportsService;

  const CHURCH = "11111111-1111-4111-8111-111111111111";
  const REPORT_ID = "22222222-2222-4222-8222-222222222222";
  const DOC_ID = "33333333-3333-4333-8333-333333333333";

  const root = {
    id: "root-1",
    role: "ROOT",
    displayName: "Principal",
  } as unknown as AdminAccount;
  const autor = {
    id: "admin-1",
    role: "ADMIN",
    displayName: "Tesorero",
  } as unknown as AdminAccount;
  const otro = {
    id: "admin-2",
    role: "ADMIN",
    displayName: "Otro",
  } as unknown as AdminAccount;

  const report = {
    id: REPORT_ID,
    churchId: CHURCH,
    reportType: ReportType.OFFERINGS,
    title: "Ofrendas septiembre",
    periodStart: new Date("2026-09-01T00:00:00Z"),
    periodEnd: new Date("2026-09-30T00:00:00Z"),
  };
  const doc = {
    id: DOC_ID,
    reportId: REPORT_ID,
    fileName: "extracto.pdf",
    mimeType: "application/pdf",
    kind: "pdf",
    sizeBytes: 8,
    publicId: "informes/x/2026-09_offerings_extracto_ab12cd34.pdf",
    uploadedByAdminAccountId: autor.id,
    uploadedByDisplayName: "Tesorero",
    createdAt: new Date(),
  };

  const reportRepo = { findOne: jest.fn(), remove: jest.fn() };
  const churchRepo = { findOne: jest.fn() };
  const documentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    remove: jest.fn(),
  };
  const cloudinary = {
    uploadPrivateDocument: jest.fn(),
    privateDownloadUrl: jest.fn(),
    deletePrivateDocument: jest.fn(),
  };
  const permissions = {
    isRoot: jest.fn((a: AdminAccount) => String(a.role) === "ROOT"),
    hasChurchPermission: jest.fn().mockResolvedValue(true),
    hasGlobalPermission: jest.fn().mockReturnValue(false),
    getAssignedChurchIds: jest.fn().mockResolvedValue([CHURCH]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    permissions.isRoot.mockImplementation(
      (a: AdminAccount) => String(a.role) === "ROOT",
    );
    permissions.hasChurchPermission.mockResolvedValue(true);
    permissions.getAssignedChurchIds.mockResolvedValue([CHURCH]);
    reportRepo.findOne.mockResolvedValue({ ...report });
    documentRepo.find.mockResolvedValue([]);
    documentRepo.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: reportRepo },
        { provide: getRepositoryToken(Church), useValue: churchRepo },
        { provide: getRepositoryToken(ReportDocument), useValue: documentRepo },
        { provide: PermissionsService, useValue: permissions },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  it("el principal ve todos los documentos del informe", async () => {
    await service.findOneForView(REPORT_ID, root);
    const where = (documentRepo.find.mock.calls[0] as [{ where: unknown }])[0]
      .where as Record<string, unknown>;
    expect(where).not.toHaveProperty("uploadedByAdminAccountId");
  });

  it("un administrador solo ve los documentos que él subió", async () => {
    await service.findOneForView(REPORT_ID, otro);
    const where = (documentRepo.find.mock.calls[0] as [{ where: unknown }])[0]
      .where as Record<string, unknown>;
    expect(where.uploadedByAdminAccountId).toBe(otro.id);
  });

  it("la vista del documento no expone su ubicación en Cloudinary", async () => {
    documentRepo.find.mockResolvedValue([doc]);
    const vista = await service.findOneForView(REPORT_ID, root);
    expect(vista.documents).toHaveLength(1);
    expect(vista.documents[0]).not.toHaveProperty("publicId");
    expect(JSON.stringify(vista.documents)).not.toContain("informes/");
  });

  it("otro administrador no puede abrir un documento ajeno", async () => {
    documentRepo.findOne.mockResolvedValue(doc);
    await expect(
      service.documentDownloadUrl(REPORT_ID, DOC_ID, otro),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(cloudinary.privateDownloadUrl).not.toHaveBeenCalled();
  });

  it("quien lo subió y el principal sí lo abren, con enlace que vence", async () => {
    documentRepo.findOne.mockResolvedValue(doc);
    cloudinary.privateDownloadUrl.mockReturnValue({
      url: "https://firmado",
      expiresAt: new Date(),
    });
    await expect(
      service.documentDownloadUrl(REPORT_ID, DOC_ID, autor),
    ).resolves.toMatchObject({ url: "https://firmado" });
    await expect(
      service.documentDownloadUrl(REPORT_ID, DOC_ID, root),
    ).resolves.toMatchObject({ fileName: "extracto.pdf" });
    expect(cloudinary.privateDownloadUrl).toHaveBeenCalledWith(
      doc.publicId,
      300,
    );
  });

  it("otro administrador no puede borrar un documento ajeno", async () => {
    documentRepo.findOne.mockResolvedValue(doc);
    await expect(
      service.removeDocument(REPORT_ID, DOC_ID, otro),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(documentRepo.remove).not.toHaveBeenCalled();
    expect(cloudinary.deletePrivateDocument).not.toHaveBeenCalled();
  });

  it("valida todos los archivos antes de subir el primero", async () => {
    const archivos = [
      { filename: "bueno.pdf", mimetype: "application/pdf", buffer: PDF },
      {
        filename: "malo.exe",
        mimetype: "application/octet-stream",
        buffer: PDF,
      },
    ];
    await expect(
      service.addDocuments(REPORT_ID, archivos, autor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it("si falla una subida, borra lo que alcanzó a subir", async () => {
    cloudinary.uploadPrivateDocument
      .mockResolvedValueOnce({ publicId: "informes/x/primero.pdf", bytes: 8 })
      .mockRejectedValueOnce(new Error("Cloudinary caído"));
    const archivos = [
      { filename: "uno.pdf", mimetype: "application/pdf", buffer: PDF },
      { filename: "dos.pdf", mimetype: "application/pdf", buffer: PDF },
    ];
    await expect(
      service.addDocuments(REPORT_ID, archivos, autor),
    ).rejects.toThrow();
    expect(cloudinary.deletePrivateDocument).toHaveBeenCalledWith(
      "informes/x/primero.pdf",
    );
    expect(documentRepo.save).not.toHaveBeenCalled();
  });

  it("respeta el tope de documentos por informe", async () => {
    documentRepo.count.mockResolvedValue(10);
    const archivos = [
      { filename: "uno.pdf", mimetype: "application/pdf", buffer: PDF },
    ];
    await expect(
      service.addDocuments(REPORT_ID, archivos, autor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("guarda el nombre original y un identificador con período y tipo", async () => {
    cloudinary.uploadPrivateDocument.mockImplementation(
      (_b: Buffer, id: string) => Promise.resolve({ publicId: id, bytes: 8 }),
    );
    const out = await service.addDocuments(
      REPORT_ID,
      [
        {
          filename: "Extracto Bancolombia Sept.pdf",
          mimetype: "application/pdf",
          buffer: PDF,
        },
      ],
      autor,
    );
    const publicId = (
      cloudinary.uploadPrivateDocument.mock.calls[0] as [Buffer, string]
    )[1];
    expect(publicId).toMatch(
      /^informes\/11111111-1111-4111-8111-111111111111\/2026-09_offerings_extracto-bancolombia-sept_[0-9a-f]{8}[.]pdf$/,
    );
    expect(out.documents[0]).toMatchObject({
      fileName: "Extracto Bancolombia Sept.pdf",
      uploadedByAdminAccountId: autor.id,
    });
  });

  it("sin permiso de informes sobre la iglesia no se puede adjuntar", async () => {
    permissions.hasChurchPermission.mockResolvedValue(false);
    const archivos = [
      { filename: "uno.pdf", mimetype: "application/pdf", buffer: PDF },
    ];
    await expect(
      service.addDocuments(REPORT_ID, archivos, otro),
    ).rejects.toThrow();
    expect(cloudinary.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  it("al borrar un informe se borran sus archivos en Cloudinary", async () => {
    documentRepo.find.mockResolvedValue([doc]);
    const out = await service.remove(REPORT_ID, root);
    expect(reportRepo.remove).toHaveBeenCalled();
    expect(cloudinary.deletePrivateDocument).toHaveBeenCalledWith(doc.publicId);
    expect(out.documentsDeleted).toBe(1);
  });

  it("otro administrador no puede borrar un informe con documentos ajenos", async () => {
    documentRepo.find.mockResolvedValue([doc]);
    await expect(service.remove(REPORT_ID, otro)).rejects.toThrow(
      "Solo el administrador principal",
    );
    expect(reportRepo.remove).not.toHaveBeenCalled();
    expect(cloudinary.deletePrivateDocument).not.toHaveBeenCalled();
  });

  it("quien subió los documentos sí puede borrar su informe", async () => {
    documentRepo.find.mockResolvedValue([doc]);
    await expect(service.remove(REPORT_ID, autor)).resolves.toMatchObject({
      documentsDeleted: 1,
    });
  });

  it("un informe solo con documento guarda únicamente esa marca", async () => {
    churchRepo.findOne.mockResolvedValue({ id: CHURCH });
    const repoCreate = jest.fn((x: unknown) => x);
    (reportRepo as Record<string, unknown>).create = repoCreate;
    (reportRepo as Record<string, unknown>).save = jest.fn((x: unknown) =>
      Promise.resolve(x),
    );
    await service.create(
      {
        churchId: CHURCH,
        reportType: ReportType.OFFERINGS,
        title: "Ofrendas en PDF",
        periodStart: "2026-09-01T00:00:00Z",
        periodEnd: "2026-09-30T00:00:00Z",
        data: { documentOnly: true, totalCop: 999 },
      },
      autor,
    );
    expect(repoCreate.mock.calls[0][0]).toMatchObject({
      data: { documentOnly: true },
    });
    expect(
      (repoCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty("totalCop");
  });
});

describe("AdminSessionService — permiso de subida directa", () => {
  let sessions: AdminSessionService;
  const jwt = new JwtService();
  const account = {
    id: "admin-1",
    role: "ADMIN",
    isActive: true,
    tokenVersion: 3,
  } as unknown as AdminAccount;
  const device = {
    id: "dev-row-1",
    deviceId: "device-abc",
    adminAccountId: "admin-1",
    status: AdminDeviceStatus.APPROVED,
    roleScope: AdminDeviceScope.APPROVED_DEVICE,
  } as unknown as AdminDevice;
  const accountRepo = { findOne: jest.fn() };
  const deviceRepo = { findOne: jest.fn() };
  const ctx = {
    account,
    device,
    session: {},
  } as unknown as AuthenticatedAdminContext;

  beforeAll(() => {
    process.env.ADMIN_SESSION_SECRET =
      "secreto-de-prueba-suficientemente-largo";
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    accountRepo.findOne.mockResolvedValue({ ...account });
    deviceRepo.findOne.mockResolvedValue({ ...device });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSessionService,
        { provide: JwtService, useValue: jwt },
        { provide: getRepositoryToken(AdminAccount), useValue: accountRepo },
        { provide: getRepositoryToken(AdminDevice), useValue: deviceRepo },
        { provide: getRepositoryToken(AdminAccessRequest), useValue: {} },
      ],
    }).compile();
    sessions = module.get(AdminSessionService);
  });

  it("emite y valida un permiso para el informe indicado", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    await expect(
      sessions.validateUploadTicket(ticket, "report-documents:R1"),
    ).resolves.toMatchObject({ account: { id: "admin-1" } });
  });

  it("no sirve para otro informe", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    await expect(
      sessions.validateUploadTicket(ticket, "report-documents:R2"),
    ).rejects.toThrow();
  });

  it("rechaza un permiso alterado o ausente", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    const alterado =
      ticket.slice(0, -3) + (ticket.endsWith("aaa") ? "bbb" : "aaa");
    await expect(
      sessions.validateUploadTicket(alterado, "report-documents:R1"),
    ).rejects.toThrow();
    await expect(
      sessions.validateUploadTicket(undefined, "report-documents:R1"),
    ).rejects.toThrow();
  });

  it("un token firmado con la clave de sesión no sirve como permiso", async () => {
    const falso = await jwt.signAsync(
      {
        sub: "admin-1",
        dev: "device-abc",
        tv: 3,
        scope: "report-documents:R1",
      },
      {
        secret: process.env.ADMIN_SESSION_SECRET,
        audience: "aienc-upload",
        expiresIn: 60,
      },
    );
    await expect(
      sessions.validateUploadTicket(falso, "report-documents:R1"),
    ).rejects.toThrow();
  });

  it("deja de servir si la cuenta cambió sus credenciales o se desactivó", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    accountRepo.findOne.mockResolvedValueOnce({ ...account, tokenVersion: 4 });
    await expect(
      sessions.validateUploadTicket(ticket, "report-documents:R1"),
    ).rejects.toThrow();
    accountRepo.findOne.mockResolvedValueOnce({ ...account, isActive: false });
    await expect(
      sessions.validateUploadTicket(ticket, "report-documents:R1"),
    ).rejects.toThrow();
  });

  it("deja de servir si el dispositivo ya no está aprobado", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    deviceRepo.findOne.mockResolvedValueOnce({
      ...device,
      status: AdminDeviceStatus.REVOKED,
    });
    await expect(
      sessions.validateUploadTicket(ticket, "report-documents:R1"),
    ).rejects.toThrow();
  });
});
