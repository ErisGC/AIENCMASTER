/**
 * Tipos de evento del cronograma.
 *
 * Coinciden con los tipos ENUM de Postgres `event_type` y `event_scope`
 * (declarados con `enumName` en la entidad para que la sincronización de
 * desarrollo y la migración generen exactamente los mismos nombres).
 */
export enum EventType {
  CULTO = "CULTO",
  CULTO_UNIDO = "CULTO_UNIDO",
  CULTO_JOVENES = "CULTO_JOVENES",
  CULTO_DAMAS = "CULTO_DAMAS",
  CULTO_CABALLEROS = "CULTO_CABALLEROS",
  REUNION = "REUNION",
  ASAMBLEA = "ASAMBLEA",
  ESTUDIO = "ESTUDIO",
  INTENSIVO = "INTENSIVO",
  OTRO = "OTRO",
}

/**
 * Alcance del evento.
 *
 *  - LOCAL: compete a una sola iglesia. Sólo avisa si se cruza (o queda muy
 *    cerca) de un evento GLOBAL, o si se cruza con otro evento local de la
 *    misma iglesia.
 *  - GLOBAL: compete a varias iglesias (cultos unidos, asambleas, intensivos,
 *    reuniones de estudio). Avisa si se cruza con cualquier otro evento.
 */
export enum EventScope {
  LOCAL = "LOCAL",
  GLOBAL = "GLOBAL",
}

/** Cómo se relacionan dos eventos que compiten por el mismo tiempo. */
export type EventConflictKind = "SE_CRUZA" | "MUY_CERCA";
