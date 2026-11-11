import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Church } from "../churches/church.entity";

/**
 * Tipo de evento creado por la propia gente ("Vigilia", "Campamento"…).
 *
 * Se registra solo la primera vez que alguien guarda un evento con ese tipo y
 * desde ahí queda en la lista para los siguientes. Si tiene iglesia, es de esa
 * iglesia; sin iglesia es de toda la Asociación (lo usan los eventos
 * globales). El nombre no distingue mayúsculas: un índice único en la
 * migración impide repetirlo dentro del mismo alcance.
 *
 * Los eventos guardan una copia del nombre (`Event.customTypeName`), así que
 * quitar un tipo de la lista no cambia los eventos que ya lo usan.
 */
@Entity("event_custom_types")
export class EventCustomType {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "uuid", nullable: true })
  churchId!: string | null;

  @ManyToOne(() => Church, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "churchId" })
  church!: Church | null;

  @Column({ type: "uuid", nullable: true })
  createdByAdminAccountId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
