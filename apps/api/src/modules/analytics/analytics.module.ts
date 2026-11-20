import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminSecurityModule } from "../admin-security/admin-security.module";
import {
  AdminStatsController,
  PublicAnalyticsController,
} from "./analytics.controllers";
import { AnalyticsDaily, AnalyticsVisitor } from "./analytics.entities";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsDaily, AnalyticsVisitor]),
    // Guards de la cuenta principal y el freno por dirección.
    AdminSecurityModule,
  ],
  controllers: [PublicAnalyticsController, AdminStatsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
