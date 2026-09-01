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

  // Las imágenes NO se declaran aquí a propósito: `mainImageUrl`,
  // `mainImagePublicId`, `coverImageUrl` y `coverImagePublicId` los escribe el
  // servidor al subir el archivo a Cloudinary, y nadie más debe poder tocarlos.
  //
  // Cuando estaban en el DTO, un administrador con permiso para editar la
  // iglesia podía enviar un identificador de Cloudinary cualquiera; en la
  // siguiente edición con imagen, el servidor lo tomaba por la imagen anterior
  // y la borraba, de modo que se podían destruir archivos de otras iglesias o
  // los fondos del portal. Además, mandarlos junto con un archivo pisaba en la
  // base de datos la imagen recién subida.
  //
  // Como la validación rechaza los campos no declarados, enviarlos ahora da un
  // error claro en vez de pasar de largo. Ningún cliente los envía: la web y la
  // app sólo los leen para mostrar la imagen.

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
