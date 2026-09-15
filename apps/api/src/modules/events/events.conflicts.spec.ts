import { EventScope } from "./enums/event.enums";
import {
  describirRepeticion,
  generarFechas,
  posicionEnElMes,
  PROXIMIDAD_MS,
  relacionEntre,
} from "./events.conflicts";

/**
 * Reglas del cronograma. Son la parte que más daño hace si se equivoca:
 * un cruce que no se detecta deja a dos iglesias citadas a la misma hora, y
 * una repetición mal calculada programa cultos en días que no son.
 */

/** Evento de prueba: hora de inicio en Colombia y duración en minutos. */
function evento(
  scope: EventScope,
  churchId: string | null,
  inicioLocal: string,
  minutos: number,
  id?: string,
) {
  // "2026-03-15 19:00" en Colombia = 2026-03-16T00:00Z
  const startsAt = new Date(`${inicioLocal}:00-05:00`);
  return {
    id: id ?? null,
    scope,
    churchId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutos * 60 * 1000),
  };
}

const IGLESIA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IGLESIA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("relacionEntre — reglas de cruce", () => {
  it("un culto local encima de un intensivo global SE CRUZA", () => {
    const intensivo = evento(
      EventScope.GLOBAL,
      null,
      "2026-03-15T08:00",
      8 * 60,
    );
    const cultoJovenes = evento(
      EventScope.LOCAL,
      IGLESIA_A,
      "2026-03-15T10:00",
      120,
    );
    expect(relacionEntre(cultoJovenes, intensivo)).toBe("SE_CRUZA");
    // Y visto desde el otro lado, igual.
    expect(relacionEntre(intensivo, cultoJovenes)).toBe("SE_CRUZA");
  });

  it("un culto local a una hora de un global queda MUY CERCA", () => {
    const cultoUnido = evento(
      EventScope.GLOBAL,
      IGLESIA_A,
      "2026-03-15T15:00",
      120,
    );
    // Termina a las 17:00; el local empieza a las 18:00 → hueco de 1 h.
    const cultoLocal = evento(
      EventScope.LOCAL,
      IGLESIA_B,
      "2026-03-15T18:00",
      120,
    );
    expect(relacionEntre(cultoLocal, cultoUnido)).toBe("MUY_CERCA");
  });

  it("con más de dos horas de por medio no hay aviso", () => {
    const global = evento(EventScope.GLOBAL, null, "2026-03-15T08:00", 120);
    // Termina 10:00; el local empieza 12:30 → hueco 2,5 h.
    const local = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T12:30", 60);
    expect(relacionEntre(local, global)).toBeNull();
  });

  it("dos cultos locales de IGLESIAS DISTINTAS a la misma hora no compiten", () => {
    const a = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T19:00", 120);
    const b = evento(EventScope.LOCAL, IGLESIA_B, "2026-03-15T19:00", 120);
    expect(relacionEntre(a, b)).toBeNull();
  });

  it("dos cultos locales de la MISMA iglesia a la misma hora sí se cruzan", () => {
    const a = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T19:00", 120);
    const b = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T20:00", 60);
    expect(relacionEntre(a, b)).toBe("SE_CRUZA");
  });

  it("dos locales de la misma iglesia pegados pero sin solaparse NO avisan", () => {
    // Entre locales sólo importa el cruce real; la cercanía es cosa de globales.
    const a = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T17:00", 120);
    const b = evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T19:00", 120);
    expect(relacionEntre(a, b)).toBeNull();
  });

  it("dos globales se avisan entre sí, por cruce o por cercanía", () => {
    const asamblea = evento(EventScope.GLOBAL, null, "2026-03-15T09:00", 180);
    const encima = evento(EventScope.GLOBAL, null, "2026-03-15T11:00", 120);
    const cerca = evento(EventScope.GLOBAL, null, "2026-03-15T13:30", 60);
    expect(relacionEntre(asamblea, encima)).toBe("SE_CRUZA");
    expect(relacionEntre(asamblea, cerca)).toBe("MUY_CERCA");
  });

  it("un evento nunca se cruza consigo mismo", () => {
    const a = evento(EventScope.GLOBAL, null, "2026-03-15T09:00", 60, "x");
    expect(relacionEntre(a, { ...a })).toBeNull();
  });

  it("el umbral de cercanía es exactamente el configurado", () => {
    const global = evento(EventScope.GLOBAL, null, "2026-03-15T08:00", 60);
    const justoEnElLimite = {
      ...evento(EventScope.LOCAL, IGLESIA_A, "2026-03-15T08:00", 60),
      startsAt: new Date(global.endsAt.getTime() + PROXIMIDAD_MS),
      endsAt: new Date(global.endsAt.getTime() + PROXIMIDAD_MS + 60_000),
    };
    expect(relacionEntre(justoEnElLimite, global)).toBeNull();
  });
});

describe("generarFechas — repetición", () => {
  it("cada semana conserva día y hora local, y respeta el límite", () => {
    const inicio = new Date("2026-01-08T19:00:00-05:00"); // jueves
    const fechas = generarFechas(
      inicio,
      "WEEKLY",
      new Date("2026-02-05T00:00:00-05:00"),
      60,
    );
    expect(fechas).toHaveLength(5); // 8, 15, 22, 29 ene y 5 feb
    for (const f of fechas) {
      expect(f.getUTCDay()).toBe(inicio.getUTCDay());
      expect(f.getUTCHours()).toBe(inicio.getUTCHours());
    }
    expect(fechas[4].toISOString()).toBe("2026-02-06T00:00:00.000Z"); // 5 feb 19:00 Colombia
  });

  it("el primer jueves de cada mes cae en el primer jueves de cada mes", () => {
    const inicio = new Date("2026-01-01T19:00:00-05:00"); // jueves 1 de enero
    const fechas = generarFechas(
      inicio,
      "MONTHLY_BY_WEEKDAY",
      new Date("2026-06-30T00:00:00-05:00"),
      60,
    );
    // Primeros jueves de 2026: 1 ene, 5 feb, 5 mar, 2 abr, 7 may, 4 jun.
    const dias = fechas.map((f) => {
      const local = new Date(f.getTime() - 5 * 60 * 60 * 1000);
      return `${local.getUTCMonth() + 1}/${local.getUTCDate()}`;
    });
    expect(dias).toEqual(["1/1", "2/5", "3/5", "4/2", "5/7", "6/4"]);
  });

  it("el último sábado del mes se calcula como 'último', no como 'cuarto'", () => {
    // 31 de enero de 2026 es sábado y es el último (y quinto) del mes.
    const inicio = new Date("2026-01-31T16:00:00-05:00");
    const pos = posicionEnElMes(inicio);
    expect(pos.diaSemana).toBe(6);
    expect(pos.ultimo).toBe(true);

    const fechas = generarFechas(
      inicio,
      "MONTHLY_BY_WEEKDAY",
      new Date("2026-04-30T00:00:00-05:00"),
      60,
    );
    const dias = fechas.map((f) => {
      const local = new Date(f.getTime() - 5 * 60 * 60 * 1000);
      return `${local.getUTCMonth() + 1}/${local.getUTCDate()}`;
    });
    // Últimos sábados: 31 ene, 28 feb, 28 mar, 25 abr.
    expect(dias).toEqual(["1/31", "2/28", "3/28", "4/25"]);
  });

  it("un 'quinto lunes' se salta los meses que no lo tienen", () => {
    // 30 de marzo de 2026 es el quinto lunes de marzo (y el último).
    const inicio = new Date("2026-03-30T18:00:00-05:00");
    const fechas = generarFechas(
      inicio,
      "MONTHLY_BY_WEEKDAY",
      new Date("2026-08-31T00:00:00-05:00"),
      60,
    );
    // Al ser el último lunes, sigue como "último lunes": 27 abr, 25 may, 29 jun, 27 jul, 31 ago.
    expect(fechas).toHaveLength(6);
  });

  it("respeta el tope de fechas", () => {
    const inicio = new Date("2026-01-04T10:00:00-05:00");
    const fechas = generarFechas(
      inicio,
      "WEEKLY",
      new Date("2030-01-01T00:00:00-05:00"),
      60,
    );
    expect(fechas).toHaveLength(60);
  });

  it("si el límite es anterior a la primera fecha, devuelve sólo la primera o nada según la regla", () => {
    const inicio = new Date("2026-05-10T10:00:00-05:00");
    expect(
      generarFechas(
        inicio,
        "WEEKLY",
        new Date("2026-05-01T00:00:00-05:00"),
        60,
      ),
    ).toHaveLength(0);
  });
});

describe("describirRepeticion — texto llano", () => {
  it("nombra el día para la repetición semanal", () => {
    expect(
      describirRepeticion("WEEKLY", new Date("2026-01-08T19:00:00-05:00")),
    ).toBe("todos los jueves");
  });

  it("pone en plural los días que lo llevan (sábados, domingos)", () => {
    expect(
      describirRepeticion("WEEKLY", new Date("2026-01-11T10:00:00-05:00")),
    ).toBe("todos los domingos");
    expect(
      describirRepeticion("WEEKLY", new Date("2026-01-10T10:00:00-05:00")),
    ).toBe("todos los sábados");
  });

  it("nombra la posición y el día para la mensual", () => {
    expect(
      describirRepeticion(
        "MONTHLY_BY_WEEKDAY",
        new Date("2026-01-01T19:00:00-05:00"),
      ),
    ).toBe("el primer jueves de cada mes");
    expect(
      describirRepeticion(
        "MONTHLY_BY_WEEKDAY",
        new Date("2026-01-31T16:00:00-05:00"),
      ),
    ).toBe("el último sábado de cada mes");
  });
});
