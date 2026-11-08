import type { AdminDevice } from "./admin_device.entity";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";
import {
  EPHEMERAL_CLOSE_GRACE_MS,
  confirmCodeOptions,
  isActiveKey,
  isEphemeralClosed,
  isPrincipalDevice,
  linkedDeviceState,
} from "./linked-devices.rules";

function dispositivo(parcial: Partial<AdminDevice>): AdminDevice {
  return {
    status: AdminDeviceStatus.APPROVED,
    roleScope: AdminDeviceScope.APPROVED_DEVICE,
    clientKind: "WEB",
    approvedVia: null,
    pausedAt: null,
    ephemeral: false,
    windowClosedAt: null,
    lastSeenAt: new Date(),
    trustedTokenHash: "hash",
    ...parcial,
  } as AdminDevice;
}

const root = { role: AdminRole.ROOT };
const admin = { role: AdminRole.ADMIN };

describe("linked-devices.rules", () => {
  describe("isPrincipalDevice", () => {
    it("da poderes de principal al dispositivo principal clásico", () => {
      expect(
        isPrincipalDevice(
          root,
          dispositivo({ roleScope: AdminDeviceScope.ROOT_DEVICE }),
        ),
      ).toBe(true);
    });

    it("da poderes de principal a la app de la cuenta principal", () => {
      expect(isPrincipalDevice(root, dispositivo({ clientKind: "APP" }))).toBe(
        true,
      );
    });

    it("da poderes de principal a un navegador aprobado desde esa app", () => {
      expect(isPrincipalDevice(root, dispositivo({ approvedVia: "APP" }))).toBe(
        true,
      );
    });

    it("no a un navegador aprobado desde el panel", () => {
      expect(
        isPrincipalDevice(root, dispositivo({ approvedVia: "PANEL" })),
      ).toBe(false);
    });

    it("nunca a otra cuenta que no sea la principal", () => {
      expect(isPrincipalDevice(admin, dispositivo({ clientKind: "APP" }))).toBe(
        false,
      );
    });

    it("no mientras esté pausado o con la sesión cerrada", () => {
      expect(
        isPrincipalDevice(
          root,
          dispositivo({ clientKind: "APP", pausedAt: new Date() }),
        ),
      ).toBe(false);
      expect(
        isPrincipalDevice(
          root,
          dispositivo({
            approvedVia: "APP",
            status: AdminDeviceStatus.SIGNED_OUT,
          }),
        ),
      ).toBe(false);
    });
  });

  it("una llave es una app aprobada y no pausada", () => {
    expect(isActiveKey(dispositivo({ clientKind: "APP" }))).toBe(true);
    expect(isActiveKey(dispositivo({ clientKind: "WEB" }))).toBe(false);
    expect(
      isActiveKey(dispositivo({ clientKind: "APP", pausedAt: new Date() })),
    ).toBe(false);
  });

  it("una app que cerró sesión deja de ser llave", () => {
    expect(
      isActiveKey(dispositivo({ clientKind: "APP", trustedTokenHash: null })),
    ).toBe(false);
  });

  describe("ventana privada", () => {
    const cerrada = new Date(Date.now() - EPHEMERAL_CLOSE_GRACE_MS - 1000);

    it("cerrar la ventana privada cierra la sesión si no vuelve", () => {
      const d = dispositivo({
        ephemeral: true,
        windowClosedAt: cerrada,
        lastSeenAt: new Date(cerrada.getTime() - 5000),
      });
      expect(isEphemeralClosed(d)).toBe(true);
      expect(linkedDeviceState(d)).toBe("SIGNED_OUT");
    });

    it("una recarga (actividad después del aviso) la mantiene viva", () => {
      const d = dispositivo({
        ephemeral: true,
        windowClosedAt: cerrada,
        lastSeenAt: new Date(cerrada.getTime() + 1000),
      });
      expect(isEphemeralClosed(d)).toBe(false);
    });

    it("en una ventana normal, cerrar la página no cierra la sesión", () => {
      const d = dispositivo({
        ephemeral: false,
        windowClosedAt: cerrada,
        lastSeenAt: new Date(cerrada.getTime() - 5000),
      });
      expect(isEphemeralClosed(d)).toBe(false);
      expect(linkedDeviceState(d)).toBe("WINDOW_CLOSED");
    });
  });

  it("estado que muestra la app", () => {
    expect(linkedDeviceState(dispositivo({}))).toBe("IN_USE");
    expect(
      linkedDeviceState(
        dispositivo({ lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) }),
      ),
    ).toBe("OPEN");
    expect(linkedDeviceState(dispositivo({ pausedAt: new Date() }))).toBe(
      "PAUSED",
    );
    expect(
      linkedDeviceState(dispositivo({ status: AdminDeviceStatus.SIGNED_OUT })),
    ).toBe("SIGNED_OUT");
    expect(linkedDeviceState(dispositivo({ trustedTokenHash: null }))).toBe(
      "SIGNED_OUT",
    );
  });

  it("los números para elegir son tres, distintos, estables e incluyen el correcto", () => {
    const id = "6f1f2b1e-1111-4a2b-9c3d-000000000001";
    const opciones = confirmCodeOptions(id, "47");
    expect(opciones).toHaveLength(3);
    expect(new Set(opciones).size).toBe(3);
    expect(opciones).toContain("47");
    expect(confirmCodeOptions(id, "47")).toEqual(opciones);
    for (const o of opciones) expect(o).toMatch(/^\d{2}$/);
  });
});
