import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Conteo diario del portal público: cuántas veces se vio o se descargó algo
 * en un día (hora de Colombia). No guarda quién, ni su dirección, ni su
 * navegador: solo el número.
 */
@Entity("analytics_daily")
export class AnalyticsDaily {
  @PrimaryColumn({ type: "date" })
  day!: string;

  @PrimaryColumn({ type: "text" })
  kind!: string;

  /** Anuncio, iglesia o estudio contado; el UUID cero si no aplica. */
  @PrimaryColumn({ type: "uuid" })
  targetId!: string;

  @Column({ type: "integer", default: 0 })
  count!: number;
}

/**
 * Visitantes distintos por día. Cada navegador manda un identificador al azar
 * que guarda él mismo; aquí solo queda su huella cifrada con el día, así que
 * no se puede seguir a nadie de un día a otro.
 */
@Entity("analytics_visitors")
export class AnalyticsVisitor {
  @PrimaryColumn({ type: "date" })
  day!: string;

  @PrimaryColumn({ type: "text" })
  visitorHash!: string;
}
