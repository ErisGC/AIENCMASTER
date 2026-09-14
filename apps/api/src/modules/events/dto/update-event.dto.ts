import { OmitType, PartialType } from "@nestjs/mapped-types";

import { CreateEventDto } from "./create-event.dto";

/**
 * La repetición semanal sólo aplica al crear: editar afecta a UNA fecha.
 * Para cambiar toda una serie se eliminan sus fechas y se vuelve a crear.
 */
export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ["repeat"] as const),
) {}
