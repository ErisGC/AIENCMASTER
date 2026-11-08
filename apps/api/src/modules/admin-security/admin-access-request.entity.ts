import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { AdminAccount } from "./admin-account.entity";
import { AdminDevice } from "./admin_device.entity";
import { AdminAccessRequestStatus } from "./enums/admin-access-request-status.enum";

@Entity("admin_access_requests")
@Index(["deviceId", "status"])
@Index(
  "IDX_admin_access_requests_single_pending_pair",
  ["adminAccountId", "deviceId"],
  {
    unique: true,
    where: `"status" = 'PENDING' AND "adminAccountId" IS NOT NULL`,
  },
)
@Check(
  "CHK_admin_access_requests_pending_unresolved",
  `"status" <> 'PENDING' OR "resolvedAt" IS NULL`,
)
@Check(
  "CHK_admin_access_requests_resolved_has_timestamp",
  `"status" = 'PENDING' OR "resolvedAt" IS NOT NULL`,
)
export class AdminAccessRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", nullable: true })
  requestedUsername!: string | null;

  @Column({ type: "text", nullable: true })
  adminAccountId!: string | null;

  @ManyToOne(() => AdminAccount, (account) => account.accessRequests, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "adminAccountId" })
  adminAccount!: AdminAccount | null;

  @Column({ type: "text" })
  deviceId!: string;

  @Column({ type: "text" })
  deviceName!: string;

  @Column({ type: "text", default: "" })
  platform!: string;

  @Column({ type: "text", default: "" })
  browser!: string;

  @Column({ type: "text", default: "" })
  userAgent!: string;

  @Column({ type: "text", nullable: true })
  ip!: string | null;

  @Column({
    type: "enum",
    enum: AdminAccessRequestStatus,
    default: AdminAccessRequestStatus.PENDING,
  })
  status!: AdminAccessRequestStatus;

  @CreateDateColumn({ type: "timestamptz" })
  requestedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  resolvedByDeviceId!: string | null;

  @ManyToOne(() => AdminDevice, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "resolvedByDeviceId" })
  resolvedByDevice!: AdminDevice | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  /**
   * Número de dos cifras que la web muestra y que hay que elegir en la app
   * para aprobar (evita aprobar por error un ingreso ajeno). Solo existe
   * cuando la solicitud se aprueba desde la app ("APP").
   */
  @Column({ type: "text", nullable: true })
  confirmCode!: string | null;

  /** Por dónde se aprueba: "APP" (la app de la cuenta) o "PANEL". */
  @Column({ type: "text", nullable: true })
  approvalChannel!: string | null;
}
