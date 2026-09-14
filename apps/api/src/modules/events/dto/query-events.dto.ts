import { IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";

import { EventScope } from "../enums/event.enums";

export class QueryEventsDto {
  /** Inicio de la ventana (inclusive). Por defecto: hoy. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin de la ventana (inclusive). Por defecto: 60 días después de `from`. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID("4")
  churchId?: string;

  @IsOptional()
  @IsEnum(EventScope)
  scope?: EventScope;
}
