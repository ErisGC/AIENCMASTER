import { IsIn, IsString, Matches, MaxLength } from "class-validator";

export class CreateUploadTicketDto {
  @IsIn(["POST", "PATCH"])
  method!: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^\/admin\//)
  path!: string;
}
