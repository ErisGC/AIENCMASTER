import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminSecurityModule } from "../admin-security/admin-security.module";
import { ChurchDirector } from "../churches/church-director.entity";
import { Church } from "../churches/church.entity";
import { Event } from "./event.entity";
import {
  AdminEventsController,
  PublicChurchEventsController,
  PublicEventsController,
} from "./events.controllers";
import { EventsService } from "./events.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Church, ChurchDirector]),
    // Aporta PermissionsService, los guards y la auditoría ya instanciados.
    AdminSecurityModule,
  ],
  controllers: [
    PublicEventsController,
    PublicChurchEventsController,
    AdminEventsController,
  ],
  providers: [EventsService],
})
export class EventsModule {}
