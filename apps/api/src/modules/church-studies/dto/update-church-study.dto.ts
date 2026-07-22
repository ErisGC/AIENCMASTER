import { PartialType } from "@nestjs/mapped-types";

import { CreateChurchStudyDto } from "./create-church-study.dto";

/** Edición de metadatos (enseñador, tema, bosquejo). El audio no se reemplaza
 * aquí: para cambiarlo se elimina el estudio y se vuelve a subir. */
export class UpdateChurchStudyDto extends PartialType(CreateChurchStudyDto) {}
