import { IsDateString, IsOptional, IsUUID } from "class-validator";

/**
 * Filtros de la serie temporal de métricas.
 *
 * Existe porque este endpoint recibía los parámetros crudos, sin validar, a
 * diferencia del listado de informes: una fecha con basura llegaba como fecha
 * inválida hasta el motor de base de datos y respondía con un error de
 * servidor ante una entrada trivial.
 */
export class QueryMetricsDto {
  @IsOptional()
  @IsUUID("4")
  churchId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
