import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminSecurityModule } from "../admin-security/admin-security.module";
import {
  AdminStatsController,
  PublicAnalyticsController,
} from "./analytics.controllers";
import {
  AnalyticsDaily,
  AnalyticsPlace,
  AnalyticsPlaceDaily,
  AnalyticsVisitor,
} from "./analytics.entities";
import { LugaresService } from "./analytics.places";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsDaily,
      AnalyticsVisitor,
      AnalyticsPlaceDaily,
      AnalyticsPlace,
    ]),
    // Guards de la cuenta principal y el freno por dirección.
    AdminSecurityModule,
  ],
  controllers: [PublicAnalyticsController, AdminStatsController],
  providers: [AnalyticsService, LugaresService],
})
export class AnalyticsModule {}
