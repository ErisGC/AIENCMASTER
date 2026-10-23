import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AdminAccessRequest } from "./admin-access-request.entity";
import { AdminAccount } from "./admin-account.entity";
import { AdminSessionService } from "./admin-session.service";
import type {
  AdminRequest,
  AuthenticatedAdminContext,
} from "./admin-security.types";
import { AdminDevice } from "./admin_device.entity";
import { rutaDeSubidaDirecta } from "./direct-upload-routes";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminAuthGuard } from "./guards/admin-auth.guard";

const ID = "3f1c2a8e-1b2c-4d5e-8f90-123456789abc";

describe("rutaDeSubidaDirecta", () => {
  it("admite las rutas de subida del panel", () => {
    expect(rutaDeSubidaDirecta("post", "/admin/announcements")).toBe(
      "POST /admin/announcements",
    );
    expect(rutaDeSubidaDirecta("PATCH", `/admin/churches/${ID}`)).toBe(
      `PATCH /admin/churches/${ID}`,
    );
    expect(
      rutaDeSubidaDirecta("POST", `/admin/churches/${ID}/studies?x=1`),
    ).toBe(`POST /admin/churches/${ID}/studies`);
    expect(
      rutaDeSubidaDirecta("POST", `/admin/support/inbox/${ID}/messages`),
    ).toBe(`POST /admin/support/inbox/${ID}/messages`);
  });

  it("rechaza las demás rutas y métodos", () => {
    expect(rutaDeSubidaDirecta("GET", "/admin/announcements")).toBeNull();
    expect(rutaDeSubidaDirecta("DELETE", `/admin/directors/${ID}`)).toBeNull();
    expect(rutaDeSubidaDirecta("POST", "/admin/security/accounts")).toBeNull();
    expect(rutaDeSubidaDirecta("POST", "/admin/upload-tickets")).toBeNull();
    expect(
      rutaDeSubidaDirecta("PATCH", `/admin/churches/${ID}/toggle`),
    ).toBeNull();
    expect(
      rutaDeSubidaDirecta("PATCH", "/admin/churches/../security/accounts"),
    ).toBeNull();
    expect(rutaDeSubidaDirecta(undefined, "/admin/announcements")).toBeNull();
  });
});

describe("AdminSessionService — permiso de subida por ruta", () => {
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
  const peticion = (method: string, url: string) =>
    ({ method, url, headers: {} }) as unknown as AdminRequest;

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

  it("no emite permisos para rutas fuera de la lista", async () => {
    await expect(
      sessions.issueRouteUploadTicket(ctx, "POST", "/admin/security/accounts"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("el permiso da el mismo contexto que la sesión en su ruta", async () => {
    const { ticket } = await sessions.issueRouteUploadTicket(
      ctx,
      "POST",
      "/admin/announcements",
    );
    const auth = await sessions.validateRouteUploadTicket(
      peticion("POST", "/admin/announcements"),
      ticket,
    );
    expect(auth.account.id).toBe("admin-1");
    expect(auth.device.deviceId).toBe("device-abc");
    expect(auth.session).toMatchObject({
      state: "ACTIVE",
      accountId: "admin-1",
    });
  });

  it("sirve una sola vez", async () => {
    const { ticket } = await sessions.issueRouteUploadTicket(
      ctx,
      "POST",
      "/admin/announcements",
    );
    await sessions.validateRouteUploadTicket(
      peticion("POST", "/admin/announcements"),
      ticket,
    );
    await expect(
      sessions.validateRouteUploadTicket(
        peticion("POST", "/admin/announcements"),
        ticket,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("no sirve en otra ruta ni con otro método", async () => {
    const { ticket } = await sessions.issueRouteUploadTicket(
      ctx,
      "POST",
      `/admin/churches/${ID}/studies`,
    );
    await expect(
      sessions.validateRouteUploadTicket(
        peticion("POST", `/admin/churches/${ID}/directors`),
        ticket,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      sessions.validateRouteUploadTicket(
        peticion("DELETE", `/admin/churches/${ID}/studies`),
        ticket,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("un permiso de documentos de informe no sirve como permiso de ruta", async () => {
    const { ticket } = await sessions.issueUploadTicket(
      ctx,
      "report-documents:R1",
      60,
    );
    await expect(
      sessions.validateRouteUploadTicket(
        peticion("POST", "/admin/announcements"),
        ticket,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("deja de servir si la cuenta cambió sus credenciales", async () => {
    const { ticket } = await sessions.issueRouteUploadTicket(
      ctx,
      "POST",
      "/admin/me/photo",
    );
    accountRepo.findOne.mockResolvedValueOnce({ ...account, tokenVersion: 4 });
    await expect(
      sessions.validateRouteUploadTicket(
        peticion("POST", "/admin/me/photo"),
        ticket,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("AdminAuthGuard — subida directa", () => {
  const contexto = (request: Partial<AdminRequest>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it("con permiso valida el permiso y no pide la sesión", async () => {
    const auth = {
      account: { id: "a" },
    } as unknown as AuthenticatedAdminContext;
    const sessions = {
      validateRouteUploadTicket: jest.fn().mockResolvedValue(auth),
      validateActiveAdminRequest: jest.fn(),
    };
    const guard = new AdminAuthGuard(
      sessions as unknown as AdminSessionService,
    );
    const request = {
      method: "POST",
      url: "/admin/announcements",
      headers: { "x-aienc-upload-ticket": "t" },
    } as unknown as AdminRequest;
    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
    expect(request.adminAuth).toBe(auth);
    expect(sessions.validateActiveAdminRequest).not.toHaveBeenCalled();
  });

  it("sin permiso sigue exigiendo la sesión", async () => {
    const auth = {
      account: { id: "a" },
    } as unknown as AuthenticatedAdminContext;
    const sessions = {
      validateRouteUploadTicket: jest.fn(),
      validateActiveAdminRequest: jest.fn().mockResolvedValue(auth),
    };
    const guard = new AdminAuthGuard(
      sessions as unknown as AdminSessionService,
    );
    const request = {
      method: "POST",
      url: "/admin/announcements",
      headers: {},
    };
    await guard.canActivate(contexto(request as unknown as AdminRequest));
    expect(sessions.validateRouteUploadTicket).not.toHaveBeenCalled();
    expect(sessions.validateActiveAdminRequest).toHaveBeenCalled();
  });
});
