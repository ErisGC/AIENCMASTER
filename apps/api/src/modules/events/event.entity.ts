import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { ChurchDirector } from "../churches/church-director.entity";
import { Church } from "../churches/church.entity";
import { EventScope, EventType } from "./enums/event.enums";

/**
 * Evento del cronograma: un culto, una reunión, una asamblea, un intensivo.
 *
 * Vive en una sola tabla para que la detección de cruces sea una consulta
 * sobre un rango de tiempo, sin importar el alcance. Un evento LOCAL pertenece
 * a una iglesia (`churchId`); un evento GLOBAL puede tener iglesia
 * organizadora o ninguna (lo organiza la Asociación).
 *
 * Los cultos que se repiten cada semana se crean como eventos independientes
 * unidos por `seriesId`: cada fecha se revisa contra el cronograma por su
 * cuenta y se puede editar o eliminar sin tocar las demás.
 */
@Entity("events")
@Index("IDX_events_startsAt", ["startsAt"])
@Index("IDX_events_church", ["churchId"])
@Index("IDX_events_scope_startsAt", ["scope", "startsAt"])
@Index("IDX_events_series", ["seriesId"])
export class Event {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Iglesia organizadora. Obligatoria si el alcance es LOCAL. */
  @Column({ type: "uuid", nullable: true })
  churchId!: string | null;

  @ManyToOne(() => Church, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "churchId" })
  church!: Church | null;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: EventType, enumName: "event_type" })
  type!: EventType;

  @Column({ type: "enum", enum: EventScope, enumName: "event_scope" })
  scope!: EventScope;

  @Column({ type: "timestamptz" })
  startsAt!: Date;

  @Column({ type: "timestamptz" })
  endsAt!: Date;

  @Column({ type: "text", nullable: true })
  location!: string | null;

  /** Une las fechas de un evento que se repite. */
  @Column({ type: "uuid", nullable: true })
  seriesId!: string | null;

  /** Regla de la serie (WEEKLY | MONTHLY_BY_WEEKDAY), para mostrarla. */
  @Column({ type: "text", nullable: true })
  seriesRule!: string | null;

  /**
   * Encargados del evento, definidos en consenso. Son registros del cuerpo
   * directivo de las iglesias; en un evento global pueden ser de varias.
   */
  @ManyToMany(() => ChurchDirector)
  @JoinTable({
    name: "event_directors",
    joinColumn: { name: "eventId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "directorId", referencedColumnName: "id" },
  })
  directors!: ChurchDirector[];

  @Column({ type: "uuid" })
  createdByAdminAccountId!: string;

  @ManyToOne(() => AdminAccount, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "createdByAdminAccountId" })
  createdByAdminAccount!: AdminAccount;

  /** Copia del nombre del autor, para que el historial sobreviva a la cuenta. */
  @Column({ type: "text" })
  createdByDisplayName!: string;

  @Column({ type: "uuid", nullable: true })
  lastUpdatedByAdminAccountId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
