import { IsDateString, IsIn } from "class-validator";

import type { RepeatFrequency } from "../events.conflicts";

/**
 * Regla de repetición. Se define al crear: cada fecha se guarda como evento
 * propio, unido a los demás por `seriesId`, y se revisa contra el cronograma
 * por su cuenta.
 */
export class RepeatRuleDto {
  /** WEEKLY: cada semana. MONTHLY_BY_WEEKDAY: "el primer jueves de cada mes". */
  @IsIn(["WEEKLY", "MONTHLY_BY_WEEKDAY"])
  frequency!: RepeatFrequency;

  /** Última fecha admitida (inclusive). Como mucho un año después del inicio. */
  @IsDateString()
  until!: string;
}
