import { Type } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateDirectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  // Un correo vacío ("") se acepta y el servicio lo convierte a null (permite
  // limpiar el campo al editar). Solo se valida como email si trae contenido.
  @ValidateIf(
    (o) => o.email !== undefined && o.email !== null && o.email !== "",
  )
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsUUID("4")
  linkedAdminAccountId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
