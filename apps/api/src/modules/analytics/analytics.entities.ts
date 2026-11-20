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

/**
 * Personas que aceptaron compartir su zona, por día. La zona es una celda de
 * una décima de grado (unos 11 km): nunca se guarda la ubicación exacta.
 */
@Entity("analytics_places_daily")
export class AnalyticsPlaceDaily {
  @PrimaryColumn({ type: "date" })
  day!: string;

  @PrimaryColumn({ type: "smallint" })
  lat10!: number;

  @PrimaryColumn({ type: "smallint" })
  lon10!: number;

  @Column({ type: "integer", default: 0 })
  count!: number;
}

/** Nombre de cada zona (ciudad o municipio), sacado de OpenStreetMap. */
@Entity("analytics_places")
export class AnalyticsPlace {
  @PrimaryColumn({ type: "smallint" })
  lat10!: number;

  @PrimaryColumn({ type: "smallint" })
  lon10!: number;

  @Column({ type: "text", nullable: true })
  city!: string | null;

  @Column({ type: "text", nullable: true })
  region!: string | null;

  @Column({ type: "text", nullable: true })
  country!: string | null;

  @Column({ type: "text", nullable: true })
  countryCode!: string | null;

  /** Cuándo se consultó el nombre; null si todavía no. */
  @Column({ type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  /** false si la consulta falló y hay que repetirla más adelante. */
  @Column({ type: "boolean", default: false })
  ok!: boolean;
}
