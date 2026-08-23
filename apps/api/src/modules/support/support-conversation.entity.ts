import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";

export enum SupportAuthorKind {
  GUEST = "GUEST",
  ADMIN = "ADMIN",
}

export enum SupportConversationStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
  BLOCKED = "BLOCKED",
}

/**
 * Hilo de soporte con el administrador principal.
 *
 * Lo abre un visitante del portal público (GUEST, identificado por un token
 * que guarda su propio navegador) o un administrador autenticado (ADMIN).
 */
@Entity("support_conversations")
@Index("IDX_support_conversations_guest", ["guestTokenHash"])
@Index("IDX_support_conversations_last", ["lastMessageAt"])
export class SupportConversation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  subject!: string;

  @Column({ type: "enum", enum: SupportAuthorKind })
  authorKind!: SupportAuthorKind;

  /** Nombre que declara quien escribe. Para ADMIN se copia su displayName. */
  @Column({ type: "text" })
  authorName!: string;

  /** Sólo para ADMIN. */
  @Column({ type: "uuid", nullable: true })
  authorAdminAccountId!: string | null;

  @ManyToOne(() => AdminAccount, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "authorAdminAccountId" })
  authorAdminAccount!: AdminAccount | null;

  /** Sólo para GUEST: hash del token que identifica al navegador. */
  @Column({ type: "text", nullable: true })
  guestTokenHash!: string | null;

  @Column({
    type: "enum",
    enum: SupportConversationStatus,
    default: SupportConversationStatus.OPEN,
  })
  status!: SupportConversationStatus;

  @Column({ type: "timestamptz" })
  lastMessageAt!: Date;

  /** Última vez que el administrador principal abrió el hilo. */
  @Column({ type: "timestamptz", nullable: true })
  rootReadAt!: Date | null;

  /** Última vez que lo abrió quien lo creó. */
  @Column({ type: "timestamptz", nullable: true })
  authorReadAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
