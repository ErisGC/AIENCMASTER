import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ValidatableFile } from "../../common/validation/file-validation";
import { Church } from "../churches/church.entity";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { ChurchStudy } from "./church-study.entity";
import { CreateChurchStudyDto } from "./dto/create-church-study.dto";
import { UpdateChurchStudyDto } from "./dto/update-church-study.dto";

const STUDIES_FOLDER = "church-studies";

@Injectable()
export class ChurchStudiesService {
  constructor(
    @InjectRepository(ChurchStudy)
    private readonly repo: Repository<ChurchStudy>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ── Public ── */

  /** Estudios visibles del público, más reciente primero. */
  async listForPublic(churchId: string) {
    const church = await this.churchRepo.findOne({
      where: { id: churchId, isActive: true },
    });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    const studies = await this.repo.find({
      where: { churchId },
      order: { createdAt: "DESC" },
    });
    return studies.map((s) => this.toPublic(s));
  }

  async findOnePublic(id: string) {
    const study = await this.repo.findOne({
      where: { id },
      relations: { church: true },
    });
    if (!study || !study.church?.isActive) {
      throw new NotFoundException("Estudio no encontrado");
    }
    return this.toPublic(study);
  }

  private toPublic(s: ChurchStudy) {
    return {
      id: s.id,
      teacherName: s.teacherName,
      topic: s.topic,
      outline: s.outline,
      audioUrl: s.audioUrl,
      audioFormat: s.audioFormat,
      createdAt: s.createdAt,
    };
  }

  /* ── Admin ── */

  async listForAdmin(churchId: string) {
    return this.repo.find({
      where: { churchId },
      order: { createdAt: "DESC" },
    });
  }

  async create(
    churchId: string,
    dto: CreateChurchStudyDto,
    audio: ValidatableFile,
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    const uploaded = await this.cloudinary.uploadToFolder(
      audio.buffer,
      STUDIES_FOLDER,
    );

    const study = this.repo.create({
      churchId,
      teacherName: dto.teacherName.trim(),
      topic: dto.topic.trim(),
      outline: dto.outline?.trim() || null,
      audioUrl: uploaded.secure_url,
      audioPublicId: uploaded.public_id,
      audioResourceType: uploaded.resource_type ?? "video",
      audioFormat: uploaded.format ?? null,
      audioBytes: typeof uploaded.bytes === "number" ? uploaded.bytes : null,
    });
    return this.repo.save(study);
  }

  async update(churchId: string, id: string, dto: UpdateChurchStudyDto) {
    const study = await this.repo.findOne({ where: { id, churchId } });
    if (!study) throw new NotFoundException("Estudio no encontrado");

    if (dto.teacherName !== undefined)
      study.teacherName = dto.teacherName.trim();
    if (dto.topic !== undefined) study.topic = dto.topic.trim();
    if (dto.outline !== undefined) study.outline = dto.outline?.trim() || null;

    return this.repo.save(study);
  }

  async remove(churchId: string, id: string) {
    const study = await this.repo.findOne({ where: { id, churchId } });
    if (!study) throw new NotFoundException("Estudio no encontrado");

    if (study.audioPublicId) {
      const rt =
        study.audioResourceType === "image" ||
        study.audioResourceType === "raw"
          ? study.audioResourceType
          : "video";
      await this.cloudinary.delete(study.audioPublicId, rt);
    }

    await this.repo.remove(study);
    return { deleted: true, id };
  }
}
