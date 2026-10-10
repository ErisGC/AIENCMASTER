import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

import { ReportType } from "../enums/report-type.enum";

export class QueryReportsDto {
  @IsOptional()
  @IsUUID("4")
  churchId?: string;

  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  /** Filtro: período cubierto >= fromDate */
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /** Filtro: período cubierto <= toDate */
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  /** Solo informes con algún documento que el actor pueda ver. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  withDocuments?: boolean;
}
