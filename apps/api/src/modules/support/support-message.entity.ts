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
import { SupportConversation } from "./support-conversation.entity";

export enum SupportSenderKind {
  /** Quien abrió el hilo: visitante o administrador. */
  AUTHOR = "AUTHOR",
  /** El administrador principal respondiendo. */
  ROOT = "ROOT",
}

export interface SupportAttachment {
  url: string;
  publicId: string;
  /** "image" | "audio" */
  kind: string;
  /** resource_type con el que Cloudinary lo guardó, para poder borrarlo. */
  resourceType: string;
  name: string;
  bytes: number;
}

@Entity("support_messages")
@Index("IDX_support_messages_conversation", ["conversationId", "createdAt"])
export class SupportMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  conversationId!: string;

  @ManyToOne(() => SupportConversation, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation!: SupportConversation;

  @Column({ type: "enum", enum: SupportSenderKind })
  senderKind!: SupportSenderKind;

  /** Cuenta que envía, cuando el remitente está autenticado. */
  @Column({ type: "uuid", nullable: true })
  senderAdminAccountId!: string | null;

  @ManyToOne(() => AdminAccount, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "senderAdminAccountId" })
  senderAdminAccount!: AdminAccount | null;

  /** Cuerpo CIFRADO en reposo (AES-256-GCM). Ver support-crypto.ts. */
  @Column({ type: "text" })
  bodyCipher!: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  attachments!: SupportAttachment[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
