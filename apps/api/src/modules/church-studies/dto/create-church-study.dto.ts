import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateChurchStudyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  teacherName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  outline?: string;
}
