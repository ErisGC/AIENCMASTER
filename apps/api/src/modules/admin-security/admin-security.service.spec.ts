import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AdminAccount } from './admin-account.entity';
import { AdminAccessRequest } from './admin-access-request.entity';
import { AdminActionLog } from './admin-action-log.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminChurchAssignment } from './admin-church-assignment.entity';
import { AdminSecurityService } from './admin-security.service';
import { AdminSessionService } from './admin-session.service';
import { AdminDevice } from './admin_device.entity';
import { Church } from '../churches/church.entity';
import { AdminAccessRequestStatus } from './enums/admin-access-request-status.enum';
import { AdminDeviceScope } from './enums/admin-device-scope.enum';
import { AdminDeviceStatus } from './enums/admin-device-status.enum';
import { AdminRole } from './enums/admin-role.enum';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
};

type TransactionWork = (manager: {
  getRepository: (entity: unknown) => unknown;
}) => Promise<unknown>;

type TransactionRunner = (
  isolation: unknown,
  work: TransactionWork,
) => Promise<unknown>;

function createRepoMock<T>() {
  return {
    create: jest.fn((value: Partial<T>) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as MockRepo<T>;
}

describe('AdminSecurityService', () => {
  const accountRepo = createRepoMock<AdminAccount>();
  const deviceRepo = createRepoMock<AdminDevice>();
  const accessRequestRepo = createRepoMock<AdminAccessRequest>();
  const auditRepo = createRepoMock<AdminActionLog>();
  const assignmentRepo = createRepoMock<AdminChurchAssignment>();
  const churchRepo = createRepoMock<Church>();

  const sessionService = {
    accessRequestTtlSeconds: 86400,
    isPendingRequestExpired: jest.fn(),
    hashPassword: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  const transactionMock = jest.fn<
    ReturnType<TransactionRunner>,
    Parameters<TransactionRunner>
  >();

  const dataSource: Pick<DataSource, 'transaction'> = {
    transaction: transactionMock,
  };

  let service: AdminSecurityService;

  beforeEach(async () => {
    jest.clearAllMocks();

    transactionMock.mockImplementation((_isolation, work) =>
      Promise.resolve(
        work({
          getRepository: (entity: unknown) => {
            if (entity === AdminAccessRequest) return accessRequestRepo;
            if (entity === AdminDevice) return deviceRepo;
            if (entity === AdminActionLog) return auditRepo;
            throw new Error('Unexpected repository');
          },
        }),
      ),
    );

    const expireQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    accessRequestRepo.createQueryBuilder.mockReturnValue(expireQueryBuilder);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminSecurityService,
        {
          provide: getRepositoryToken(AdminAccount),
          useValue: accountRepo,
        },
        {
          provide: getRepositoryToken(AdminDevice),
          useValue: deviceRepo,
        },
        {
          provide: getRepositoryToken(AdminAccessRequest),
          useValue: accessRequestRepo,
        },
        {
          provide: getRepositoryToken(AdminActionLog),
          useValue: auditRepo,
        },
        {
          provide: getRepositoryToken(AdminChurchAssignment),
          useValue: assignmentRepo,
        },
        {
          provide: getRepositoryToken(Church),
          useValue: churchRepo,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: AdminSessionService,
          useValue: sessionService,
        },
        {
          provide: AdminAuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = moduleRef.get(AdminSecurityService);
  });

  it('only approves access requests that are still pending', async () => {
    accessRequestRepo.findOne.mockResolvedValue({
      id: 'request-1',
      adminAccountId: 'admin-1',
      adminAccount: {
        id: 'admin-1',
        role: AdminRole.ADMIN,
      },
      deviceId: 'device-1',
      deviceName: 'Equipo nuevo',
      platform: 'Windows',
      browser: 'Chrome',
      userAgent: 'jest-agent',
      ip: '127.0.0.1',
      status: AdminAccessRequestStatus.REJECTED,
    });

    await expect(
      service.approveAccessRequest(
        'request-1',
        {},
        {
          account: { id: 'root-account' } as AdminAccount,
          device: { id: 'root-device' } as AdminDevice,
          session: {} as never,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only rejects access requests that are still pending', async () => {
    accessRequestRepo.findOne.mockResolvedValue({
      id: 'request-2',
      adminAccountId: 'admin-1',
      adminAccount: {
        id: 'admin-1',
        role: AdminRole.ADMIN,
      },
      deviceId: 'device-2',
      deviceName: 'Equipo rechazado',
      platform: 'Windows',
      browser: 'Chrome',
      userAgent: 'jest-agent',
      ip: '127.0.0.1',
      status: AdminAccessRequestStatus.APPROVED,
    });

    await expect(
      service.rejectAccessRequest(
        'request-2',
        {},
        {
          account: { id: 'root-account' } as AdminAccount,
          device: { id: 'root-device' } as AdminDevice,
          session: {} as never,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to revoke the root device', async () => {
    deviceRepo.findOne.mockResolvedValue({
      id: 'root-device-row',
      deviceId: 'root-device',
      adminAccountId: 'root-account',
      roleScope: AdminDeviceScope.ROOT_DEVICE,
      status: AdminDeviceStatus.APPROVED,
    });

    await expect(
      service.revokeDevice('root-device-row', {
        account: { id: 'root-account' } as AdminAccount,
        device: { id: 'root-device-row' } as AdminDevice,
        session: {} as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes an approved device and clears its trusted token', async () => {
    deviceRepo.findOne.mockResolvedValue({
      id: 'device-row',
      deviceId: 'device-1',
      deviceName: 'Equipo secundario',
      adminAccountId: 'admin-1',
      roleScope: AdminDeviceScope.APPROVED_DEVICE,
      status: AdminDeviceStatus.APPROVED,
      trustedTokenHash: 'trusted-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
      adminAccount: {
        id: 'admin-1',
        username: 'admin',
        displayName: 'Admin',
        role: AdminRole.ADMIN,
      },
    });
    deviceRepo.save.mockResolvedValue({
      id: 'device-row',
      deviceId: 'device-1',
      deviceName: 'Equipo secundario',
      adminAccountId: 'admin-1',
      roleScope: AdminDeviceScope.APPROVED_DEVICE,
      status: AdminDeviceStatus.REVOKED,
      trustedTokenHash: null,
      revokedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      adminAccount: {
        id: 'admin-1',
        username: 'admin',
        displayName: 'Admin',
        role: AdminRole.ADMIN,
      },
    });

    const result = await service.revokeDevice('device-row', {
      account: { id: 'root-account' } as AdminAccount,
      device: { id: 'root-device-row' } as AdminDevice,
      session: {} as never,
    });

    expect(result.status).toBe(AdminDeviceStatus.REVOKED);
    expect(deviceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AdminDeviceStatus.REVOKED,
        trustedTokenHash: null,
      }),
    );
  });

  // -- updateAccountRole --
  //
  // El sistema admite UNA sola cuenta principal, garantizado por un indice
  // unico en la base de datos y por un chequeo que impide arrancar la API si
  // alguna vez hubiera dos.
  //
  // Las pruebas que habia aqui simulaban justo ese estado imposible (dos
  // cuentas principales a la vez) y por eso pasaban, dando por buena una
  // funcionalidad que en produccion no podia completarse en ninguno de sus dos
  // sentidos: promover chocaba contra el indice y devolvia un error de
  // servidor, y degradar exigia "mas de una principal".
  describe('updateAccountRole', () => {
    const ROOT_ACTOR_ID = 'root-actor';
    const TARGET_ID = 'target';

    function rootActorCtx(): AuthenticatedAdminContext {
      return {
        account: { id: ROOT_ACTOR_ID, username: 'root' },
        device: { id: 'dev-root' },
      } as unknown as AuthenticatedAdminContext;
    }

    beforeEach(() => {
      accountRepo.findOne.mockImplementation(async ({ where }) => {
        const w = where as { id?: string };
        if (w.id === ROOT_ACTOR_ID) {
          return {
            id: ROOT_ACTOR_ID,
            username: 'root',
            role: AdminRole.ROOT,
            isActive: true,
            tokenVersion: 1,
          } as AdminAccount;
        }
        if (w.id === TARGET_ID) {
          return {
            id: TARGET_ID,
            username: 'otro',
            role: AdminRole.ADMIN,
            isActive: true,
            tokenVersion: 1,
          } as AdminAccount;
        }
        return null;
      });
    });

    it('explica por que no se puede, en vez de fallar contra el indice', async () => {
      await expect(
        service.updateAccountRole(TARGET_ID, AdminRole.ROOT, rootActorCtx()),
      ).rejects.toThrow(/una sola cuenta de administrador principal/);
      expect(accountRepo.save).not.toHaveBeenCalled();
    });

    it('sigue rechazando cambiarse el rol a uno mismo', async () => {
      await expect(
        service.updateAccountRole(ROOT_ACTOR_ID, AdminRole.ADMIN, rootActorCtx()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accountRepo.save).not.toHaveBeenCalled();
    });

    it('sigue exigiendo que quien lo intenta sea la cuenta principal', async () => {
      accountRepo.findOne.mockImplementation(async ({ where }) => {
        const w = where as { id?: string };
        if (w.id === ROOT_ACTOR_ID) {
          return {
            id: ROOT_ACTOR_ID,
            role: AdminRole.ADMIN,
            isActive: true,
          } as AdminAccount;
        }
        return { id: TARGET_ID, role: AdminRole.ADMIN } as AdminAccount;
      });

      await expect(
        service.updateAccountRole(TARGET_ID, AdminRole.ROOT, rootActorCtx()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
