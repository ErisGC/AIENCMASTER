import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { EventScope, EventType } from "../enums/event.enums";
import { RepeatRuleDto } from "./repeat-rule.dto";

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsEnum(EventType)
  type!: EventType;

  @IsEnum(EventScope)
  scope!: EventScope;

  /** Iglesia organizadora. Obligatoria para LOCAL; opcional para GLOBAL. */
  @IsOptional()
  @IsUUID("4")
  churchId?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;

  /** Encargados, por identificador de director (cuerpo directivo). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID("4", { each: true })
  directorIds?: string[];

  /**
   * Repetición: cada semana, o el mismo día de la semana cada mes ("el
   * primer jueves"), hasta una fecha. Cada fecha se crea como evento propio,
   * unido a los demás por `seriesId`.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeat?: RepeatRuleDto | null;

  /**
   * Si el evento se cruza con otros, el servidor responde 409 con la lista.
   * Reenviar con este campo en `true` guarda de todos modos; el cruce queda
   * en la auditoría.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeConflicts?: boolean;
}
