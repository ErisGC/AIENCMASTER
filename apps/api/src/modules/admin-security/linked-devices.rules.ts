import { createHash, randomInt } from "node:crypto";

import type { AdminAccount } from "./admin-account.entity";
import type { AdminDevice } from "./admin_device.entity";
import { AdminDeviceScope } from "./enums/admin-device-scope.enum";
import { AdminDeviceStatus } from "./enums/admin-device-status.enum";
import { AdminRole } from "./enums/admin-role.enum";

/*
 * Reglas de los dispositivos vinculados (como los de WhatsApp):
 *
 *  - La app del teléfono ("APP") es la llave de su cuenta: aprueba los
 *    ingresos web de esa misma cuenta, eligiendo el número que muestra la web.
 *  - Cerrar sesión en la web desaprueba ese navegador (queda SIGNED_OUT) si la
 *    cuenta tiene una llave con la que volver a aprobarlo.
 *  - La cuenta principal tiene sus poderes completos (cuentas, permisos,
 *    auditoría) en su app y en los navegadores que apruebe con ella, además
 *    del dispositivo principal clásico (ROOT_DEVICE), que se conserva.
 */

/** "En uso": hubo actividad en los últimos minutos. */
export const IN_USE_WINDOW_MS = 3 * 60 * 1000;

/**
 * Ventana privada: si avisó que se cerró y en este tiempo no volvió a dar
 * señales (una recarga sí las da), la sesión se toma como cerrada.
 */
export const EPHEMERAL_CLOSE_GRACE_MS = 90 * 1000;

export function isAppDevice(device: Pick<AdminDevice, "clientKind">) {
  return device.clientKind === "APP";
}

/**
 * Llave activa: app aprobada, no pausada y con la sesión abierta. Una app
 * que cerró sesión no puede responder un "¿Eres tú?", así que mientras tanto
 * los ingresos web de esa cuenta los aprueba la administración principal.
 */
export function isActiveKey(
  device: Pick<
    AdminDevice,
    "clientKind" | "status" | "pausedAt" | "trustedTokenHash"
  >,
) {
  return (
    isAppDevice(device) &&
    device.status === AdminDeviceStatus.APPROVED &&
    !device.pausedAt &&
    !!device.trustedTokenHash
  );
}

/**
 * ¿Este dispositivo tiene los poderes del administrador principal? Solo para
 * la cuenta ROOT: el dispositivo principal clásico, su app aprobada, o un
 * navegador aprobado desde esa app.
 */
export function isPrincipalDevice(
  account: Pick<AdminAccount, "role">,
  device: Pick<
    AdminDevice,
    "roleScope" | "status" | "clientKind" | "approvedVia" | "pausedAt"
  >,
) {
  if (account.role !== AdminRole.ROOT) return false;
  if (device.status !== AdminDeviceStatus.APPROVED || device.pausedAt) {
    return false;
  }
  if (device.roleScope === AdminDeviceScope.ROOT_DEVICE) return true;
  return isAppDevice(device) || device.approvedVia === "APP";
}

/**
 * Ventana privada que se cerró y no volvió: su sesión ya no existe en el
 * navegador (las cookies se borran al cerrar), así que se da por cerrada.
 */
export function isEphemeralClosed(
  device: Pick<AdminDevice, "ephemeral" | "windowClosedAt" | "lastSeenAt">,
  now = Date.now(),
) {
  if (!device.ephemeral || !device.windowClosedAt) return false;
  const closedAt = device.windowClosedAt.getTime();
  const lastSeen = device.lastSeenAt?.getTime() ?? 0;
  return lastSeen <= closedAt && now - closedAt > EPHEMERAL_CLOSE_GRACE_MS;
}

export type LinkedDeviceState =
  | "IN_USE"
  | "OPEN"
  | "WINDOW_CLOSED"
  | "PAUSED"
  | "SIGNED_OUT"
  | "PENDING"
  | "REJECTED"
  | "REVOKED";

/** Estado que se muestra en la app para cada dispositivo. */
export function linkedDeviceState(
  device: Pick<
    AdminDevice,
    | "status"
    | "pausedAt"
    | "ephemeral"
    | "windowClosedAt"
    | "lastSeenAt"
    | "trustedTokenHash"
  >,
  now = Date.now(),
): LinkedDeviceState {
  switch (device.status) {
    case AdminDeviceStatus.PENDING:
      return "PENDING";
    case AdminDeviceStatus.REJECTED:
      return "REJECTED";
    case AdminDeviceStatus.REVOKED:
      return "REVOKED";
    case AdminDeviceStatus.SIGNED_OUT:
      return "SIGNED_OUT";
  }
  if (device.pausedAt) return "PAUSED";
  if (!device.trustedTokenHash || isEphemeralClosed(device, now)) {
    return "SIGNED_OUT";
  }
  const lastSeen = device.lastSeenAt?.getTime() ?? 0;
  const closed =
    device.windowClosedAt && device.windowClosedAt.getTime() >= lastSeen;
  if (closed) return "WINDOW_CLOSED";
  return now - lastSeen <= IN_USE_WINDOW_MS ? "IN_USE" : "OPEN";
}

/** Número de confirmación de dos cifras (10 a 99). */
export function generateConfirmCode() {
  return String(randomInt(10, 100));
}

/**
 * Tres números para elegir en la app: el correcto y dos señuelos. Salen de la
 * solicitud misma, así que no cambian entre una consulta y otra.
 */
export function confirmCodeOptions(requestId: string, code: string) {
  const opciones = new Set<string>([code]);
  let semilla = createHash("sha256").update(`${requestId}:${code}`).digest();
  let i = 0;
  while (opciones.size < 3) {
    if (i >= semilla.length - 1) {
      semilla = createHash("sha256").update(semilla).digest();
      i = 0;
    }
    opciones.add(String(10 + (semilla.readUInt16BE(i) % 90)));
    i += 2;
  }
  // Orden estable pero sin dejar el correcto siempre primero.
  return [...opciones].sort(
    (a, b) =>
      createHash("sha256").update(`${requestId}${a}`).digest()[0] -
      createHash("sha256").update(`${requestId}${b}`).digest()[0],
  );
}
