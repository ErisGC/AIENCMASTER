import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateChurchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  mapsLat?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  mapsLng?: number | null;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  mapsUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mainImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mainImagePublicId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImagePublicId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  avgAttendance?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
