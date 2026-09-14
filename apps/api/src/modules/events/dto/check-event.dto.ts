import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";

import { EventScope } from "../enums/event.enums";
import { RepeatRuleDto } from "./repeat-rule.dto";

/**
 * Consulta de cruces sin guardar nada. La usan los formularios para avisar
 * mientras la persona elige la fecha, antes de intentar crear el evento.
 */
export class CheckEventDto {
  @IsEnum(EventScope)
  scope!: EventScope;

  @IsOptional()
  @IsUUID("4")
  churchId?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  /** Al editar: el propio evento no cuenta como cruce consigo mismo. */
  @IsOptional()
  @IsUUID("4")
  excludeId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeat?: RepeatRuleDto | null;
}
