import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminChurchAssignment } from "../admin-security/admin-church-assignment.entity";
import { AdminSecurityModule } from "../admin-security/admin-security.module";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { Church } from "../churches/church.entity";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import {
  ReportDirectUploadController,
  ReportsController,
} from "./reports.controller";
import { ReportsService } from "./reports.service";
import { Report } from "./report.entity";
import { ReportDocument } from "./report-document.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      ReportDocument,
      Church,
      AdminChurchAssignment,
    ]),
    AdminSecurityModule,
    CloudinaryModule,
  ],
  controllers: [ReportsController, ReportDirectUploadController],
  providers: [ReportsService, PermissionsService],
})
export class ReportsModule {}
