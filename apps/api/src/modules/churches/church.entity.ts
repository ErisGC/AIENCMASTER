import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  UpdateDateColumn,
} from "typeorm";

import { ChurchDirector } from "./church-director.entity";

@Entity("churches")
export class Church {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /* ─────────── Identidad ─────────── */

  @Column()
  name!: string;

  @Column()
  city!: string;

  @Column({ type: "text", nullable: true })
  address?: string | null;

  /* ─────────── Maps ─────────── */
  // Coordenadas: base para abrir app en móvil o pestaña en desktop
  @Column({ type: "double precision", nullable: true })
  mapsLat?: number | null;

  @Column({ type: "double precision", nullable: true })
  mapsLng?: number | null;

  // Link opcional si el admin quiere un enlace específico
  @Column({ type: "text", nullable: true })
  mapsUrl?: string | null;

  /* ─────────── Media (Cloudinary) ─────────── */

  // Imagen principal (card / listado)
  @Column({ type: "text", nullable: true })
  mainImageUrl?: string | null;

  @Column({ type: "text", nullable: true })
  mainImagePublicId?: string | null;

  // Imagen de fondo (página de la iglesia)
  @Column({ type: "text", nullable: true })
  coverImageUrl?: string | null;

  @Column({ type: "text", nullable: true })
  coverImagePublicId?: string | null;

  /* ─────────── Info adicional ─────────── */
  // Los representantes ya NO son un texto libre: son registros propios
  // (ChurchDirector) con nombre, cargo, celular, correo y foto.

  @Column({ type: "int", nullable: true })
  avgAttendance?: number | null;

  /* ─────────── Directores ─────────── */

  @OneToMany(() => ChurchDirector, (director) => director.church)
  directors!: ChurchDirector[];

  /* ─────────── Estado ─────────── */

  @Column({ default: true })
  isActive!: boolean;

  /* ─────────── Timestamps ─────────── */

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
