import { EventConflictKind, EventScope } from "./enums/event.enums";

/**
 * Reglas de cruce y de repetición del cronograma. Son funciones puras: las
 * usan tanto la comprobación contra la base de datos como la bandeja de
 * avisos, para que las dos digan siempre lo mismo.
 */

/** Menos de este tiempo entre dos eventos cuenta como "demasiado cerca". */
export const PROXIMIDAD_MS = 2 * 60 * 60 * 1000;

export interface EventoLite {
  id?: string | null;
  scope: EventScope;
  churchId: string | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Cómo se relacionan dos eventos, o `null` si no compiten.
 *
 *  - Si alguno es GLOBAL: se cruzan → SE_CRUZA; a menos de dos horas →
 *    MUY_CERCA. Un evento global compite con el cronograma entero, y un
 *    evento local compite con los globales.
 *  - Si ambos son LOCALES: sólo compiten si son de la misma iglesia y se
 *    cruzan en el tiempo. Dos iglesias distintas pueden tener culto a la
 *    misma hora sin problema.
 */
export function relacionEntre(
  a: EventoLite,
  b: EventoLite,
): EventConflictKind | null {
  if (a.id && b.id && a.id === b.id) return null;

  const aInicio = a.startsAt.getTime();
  const aFin = a.endsAt.getTime();
  const bInicio = b.startsAt.getTime();
  const bFin = b.endsAt.getTime();

  const seCruzan = aInicio < bFin && bInicio < aFin;
  // Sin cruce, uno termina antes de que empiece el otro: la diferencia
  // positiva es el hueco entre ambos.
  const hueco = seCruzan ? 0 : Math.max(aInicio - bFin, bInicio - aFin);
  const muyCerca = !seCruzan && hueco < PROXIMIDAD_MS;

  const hayGlobal =
    a.scope === EventScope.GLOBAL || b.scope === EventScope.GLOBAL;

  if (hayGlobal) {
    if (seCruzan) return "SE_CRUZA";
    if (muyCerca) return "MUY_CERCA";
    return null;
  }

  // Ambos locales: sólo importa dentro de la misma iglesia.
  const mismaIglesia =
    a.churchId !== null && b.churchId !== null && a.churchId === b.churchId;
  if (mismaIglesia && seCruzan) return "SE_CRUZA";
  return null;
}

/* ── Repetición ─────────────────────────────────────────────────────────── */

/**
 * Cómo se repite un evento.
 *  - WEEKLY: el mismo día de la semana, a la misma hora, cada semana.
 *  - MONTHLY_BY_WEEKDAY: el mismo día de la semana en la misma posición del
 *    mes ("el primer jueves", "el último sábado"), nunca por número de día.
 */
export type RepeatFrequency = "WEEKLY" | "MONTHLY_BY_WEEKDAY";

/**
 * Colombia no cambia de hora, así que "el primer jueves" se puede calcular
 * desplazando el instante UTC un número fijo de horas y trabajando con los
 * campos UTC de la fecha desplazada. Evita depender de la zona horaria del
 * servidor, que en producción es UTC.
 */
const DESPLAZAMIENTO_COLOMBIA_MS = -5 * 60 * 60 * 1000;

function aLocal(d: Date): Date {
  return new Date(d.getTime() + DESPLAZAMIENTO_COLOMBIA_MS);
}
function deLocal(d: Date): Date {
  return new Date(d.getTime() - DESPLAZAMIENTO_COLOMBIA_MS);
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/**
 * Posición del día de la semana dentro de su mes, en calendario local:
 * 1 = primero, 2 = segundo… y `ultimo` si es la última aparición del mes.
 */
export function posicionEnElMes(instante: Date): {
  diaSemana: number;
  ordinal: number;
  ultimo: boolean;
} {
  const local = aLocal(instante);
  const dia = local.getUTCDate();
  const total = diasDelMes(local.getUTCFullYear(), local.getUTCMonth());
  return {
    diaSemana: local.getUTCDay(),
    ordinal: Math.ceil(dia / 7),
    ultimo: dia + 7 > total,
  };
}

/** Día del mes (1..31) del enésimo o último `diaSemana` de un mes, o null. */
function diaDelMesPara(
  anio: number,
  mes: number,
  diaSemana: number,
  ordinal: number,
  ultimo: boolean,
): number | null {
  const total = diasDelMes(anio, mes);
  if (ultimo) {
    for (let d = total; d >= total - 6; d--) {
      if (new Date(Date.UTC(anio, mes, d)).getUTCDay() === diaSemana) return d;
    }
    return null;
  }
  const primerDiaSemana = new Date(Date.UTC(anio, mes, 1)).getUTCDay();
  const primero = 1 + ((diaSemana - primerDiaSemana + 7) % 7);
  const dia = primero + (ordinal - 1) * 7;
  return dia <= total ? dia : null;
}

/**
 * Fechas de una repetición. Devuelve la fecha original y las siguientes
 * mientras no pasen de `hasta` (inclusive, hasta el final de ese día), con
 * tope para que un error de dedo no genere miles de filas.
 */
export function generarFechas(
  inicio: Date,
  frecuencia: RepeatFrequency,
  hasta: Date,
  tope: number,
): Date[] {
  const limiteLocal = aLocal(hasta);
  limiteLocal.setUTCHours(23, 59, 59, 999);
  const limite = deLocal(limiteLocal).getTime();

  const fechas: Date[] = [];

  if (frecuencia === "WEEKLY") {
    const cursor = new Date(inicio);
    while (cursor.getTime() <= limite && fechas.length < tope) {
      fechas.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return fechas;
  }

  // MONTHLY_BY_WEEKDAY
  const { diaSemana, ordinal, ultimo } = posicionEnElMes(inicio);
  const local = aLocal(inicio);
  const hora = local.getUTCHours();
  const minuto = local.getUTCMinutes();
  let anio = local.getUTCFullYear();
  let mes = local.getUTCMonth();

  // La primera fecha es la original tal cual; de ahí en adelante se calcula
  // mes a mes. Un mes sin esa posición (un "quinto jueves") se salta.
  fechas.push(new Date(inicio));
  for (let i = 0; i < 24 && fechas.length < tope; i++) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
    const dia = diaDelMesPara(anio, mes, diaSemana, ordinal, ultimo);
    if (dia === null) continue;
    const candidata = deLocal(new Date(Date.UTC(anio, mes, dia, hora, minuto)));
    if (candidata.getTime() > limite) break;
    fechas.push(candidata);
  }
  return fechas;
}

/** Texto llano de la regla, para mostrarla a quien no sabe de sistemas. */
export function describirRepeticion(
  frecuencia: RepeatFrequency,
  inicio: Date,
): string {
  const nombres = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const { diaSemana, ordinal, ultimo } = posicionEnElMes(inicio);
  const nombre = nombres[diaSemana];
  // "todos los jueves" no cambia, pero "todos los sábados" y "todos los
  // domingos" sí llevan plural.
  if (frecuencia === "WEEKLY") {
    const plural = nombre.endsWith("o") ? `${nombre}s` : nombre;
    return `todos los ${plural}`;
  }
  const posicion = ultimo
    ? "último"
    : ["primer", "segundo", "tercer", "cuarto", "quinto"][ordinal - 1];
  return `el ${posicion} ${nombre} de cada mes`;
}
