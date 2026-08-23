import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AdminSecurityModule } from "../admin-security/admin-security.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { SupportConversation } from "./support-conversation.entity";
import { SupportMessage } from "./support-message.entity";
import {
  AdminSupportController,
  PublicSupportController,
} from "./support.controllers";
import { SupportService } from "./support.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportConversation, SupportMessage]),
    AdminSecurityModule,
    CloudinaryModule,
  ],
  controllers: [PublicSupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
