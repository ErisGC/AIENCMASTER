import { IsString, Matches, MaxLength } from "class-validator";

/** Número de dos cifras que muestra la web y se elige en la app. */
export class ApproveLinkedRequestDto {
  @IsString()
  @Matches(/^\d{2}$/)
  code!: string;
}

/** Nombre para reconocer la sesión ("Computador de la oficina"). */
export class RenameLinkedDeviceDto {
  @IsString()
  @MaxLength(60)
  name!: string;
}
