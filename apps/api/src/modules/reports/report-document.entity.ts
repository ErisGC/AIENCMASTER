import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { Report } from "./report.entity";

/**
 * Documento adjunto a un informe: el archivo que la iglesia entrega como
 * soporte (extracto, planilla, acta, fotos de recibos).
 *
 * Es privado. Solo lo ven el administrador principal y la cuenta que lo
 * subió. El archivo vive en Cloudinary como crudo con entrega
 * `authenticated`; aquí solo se guarda su `publicId`, nunca una URL, y cada
 * apertura genera un enlace que vence en minutos.
 */
@Entity("report_documents")
@Index(["reportId"])
export class ReportDocument {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  reportId!: string;

  @ManyToOne(() => Report, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "reportId" })
  report!: Report;

  /** Nombre original del archivo, tal como lo subió el administrador. */
  @Column({ type: "text" })
  fileName!: string;

  @Column({ type: "text" })
  mimeType!: string;

  /** pdf | image | word | excel */
  @Column({ type: "text" })
  kind!: string;

  @Column({ type: "integer" })
  sizeBytes!: number;

  @Column({ type: "text" })
  publicId!: string;

  @Column({ type: "uuid" })
  uploadedByAdminAccountId!: string;

  @ManyToOne(() => AdminAccount, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "uploadedByAdminAccountId" })
  uploadedByAdminAccount!: AdminAccount;

  @Column({ type: "text" })
  uploadedByDisplayName!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
