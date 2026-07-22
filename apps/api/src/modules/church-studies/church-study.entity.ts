import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Church } from "../churches/church.entity";

/**
 * Estudio / mensaje en audio de una iglesia local.
 *
 * Lo suben los admins locales (con el permiso de anuncios) o los superadmins.
 * El audio vive en Cloudinary (resource_type "video" para audio); guardamos su
 * public_id y su resource_type para poder borrarlo correctamente.
 */
@Entity("church_studies")
export class ChurchStudy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  churchId!: string;

  @ManyToOne(() => Church, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "churchId" })
  church!: Church;

  /** Nombre del enseñador que dio el estudio. */
  @Column({ type: "text" })
  teacherName!: string;

  /** Tema del estudio. */
  @Column({ type: "text" })
  topic!: string;

  /** Bosquejo / notas opcionales. */
  @Column({ type: "text", nullable: true })
  outline!: string | null;

  /** URL pública del audio en Cloudinary. */
  @Column({ type: "text" })
  audioUrl!: string;

  @Column({ type: "text" })
  audioPublicId!: string;

  /** resource_type con el que Cloudinary lo guardó (audio → "video"). */
  @Column({ type: "text", default: "video" })
  audioResourceType!: string;

  @Column({ type: "text", nullable: true })
  audioFormat!: string | null;

  @Column({ type: "int", nullable: true })
  audioBytes!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
