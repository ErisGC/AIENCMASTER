// Igual que el resto de DTO del proyecto. Este era el único que lo tomaba de
// `@nestjs/swagger`, y ese import era el ÚNICO uso de una dependencia que
// arrastraba además la interfaz de Swagger, que el proyecto no monta.
import { PartialType } from "@nestjs/mapped-types";
import { CreateAnnouncementDto } from "./create-announcement.dto";

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}
