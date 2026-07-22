import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminChurchAssignment } from "../admin-security/admin-church-assignment.entity";
import { AdminSecurityModule } from "../admin-security/admin-security.module";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { Church } from "../churches/church.entity";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import {
  AdminChurchStudiesController,
  PublicChurchStudiesController,
} from "./church-studies.controllers";
import { ChurchStudy } from "./church-study.entity";
import { ChurchStudiesService } from "./church-studies.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ChurchStudy, Church, AdminChurchAssignment]),
    AdminSecurityModule,
    CloudinaryModule,
  ],
  controllers: [AdminChurchStudiesController, PublicChurchStudiesController],
  providers: [ChurchStudiesService, PermissionsService],
})
export class ChurchStudiesModule {}
