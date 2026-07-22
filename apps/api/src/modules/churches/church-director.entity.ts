import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { Church } from "./church.entity";

/**
 * Director / encargado de una iglesia.
 * Si está vinculado a una cuenta de admin, su foto se hereda del perfil
 * de esa cuenta cuando exista; si no hay vínculo, sólo se muestra el nombre.
 */
@Entity("church_directors")
export class ChurchDirector {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  churchId!: string;

  @ManyToOne(() => Church, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "churchId" })
  church!: Church;

  @Column({ type: "text" })
  displayName!: string;

  /** Cargo / rol opcional (ej. "Pastor principal", "Vicepresidente"). */
  @Column({ type: "text", default: "" })
  role!: string;

  /** Celular de contacto (opcional). Se muestra en la tarjeta pública. */
  @Column({ type: "text", nullable: true })
  phone!: string | null;

  /** Correo de contacto (opcional). Se muestra en la tarjeta pública. */
  @Column({ type: "text", nullable: true })
  email!: string | null;

  /** Foto subida específicamente para el director (independiente del admin). */
  @Column({ type: "text", nullable: true })
  photoUrl!: string | null;

  @Column({ type: "text", nullable: true })
  photoPublicId!: string | null;

  /** Si está vinculado a un AdminAccount, su foto del perfil prevalece. */
  @Column({ type: "uuid", nullable: true })
  linkedAdminAccountId!: string | null;

  @ManyToOne(() => AdminAccount, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "linkedAdminAccountId" })
  linkedAdminAccount!: AdminAccount | null;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
