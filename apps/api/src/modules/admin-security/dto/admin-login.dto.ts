import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName!: string;

  @IsString()
  @MaxLength(50)
  platform!: string;

  @IsString()
  @MaxLength(100)
  browser!: string;

  /**
   * Ventana privada o equipo compartido: al cerrar la ventana la sesión se
   * da por cerrada y el navegador deja de estar aprobado.
   */
  @IsOptional()
  @IsBoolean()
  ephemeral?: boolean;
}
