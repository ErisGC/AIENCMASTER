import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindOptionsWhere, ILike, Between } from "typeorm";

import { Announcement } from "./announcement.entity";
import { AnnouncementAttachment } from "./attachment.entity";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

import { CloudinaryService } from "../cloudinary/cloudinary.service";

type IncomingFile = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly repo: Repository<Announcement>,

    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ─────────────── Helpers ─────────────── */

  private normalizeUpload(result: any, file: IncomingFile) {
    if (
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !result?.public_id ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !result?.secure_url ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !result?.resource_type ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      !result?.format
    ) {
      throw new Error("Invalid Cloudinary upload response");
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      publicId: result.public_id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      url: result.secure_url,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      resourceType: result.resource_type,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      format: result.format,
      name: file.filename,
      size: file.buffer?.length ?? 0,
    };
  }

  /* ─────────────── Queries ─────────────── */

  findLatestFive() {
    return this.repo.find({
      order: { createdAt: "DESC" },
      take: 5,
    });
  }

  async findOneById(id: string) {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ["attachments"],
    });

    if (!entity) {
      throw new NotFoundException("Announcement not found");
    }

    return entity;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const entity = await this.findOneById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string) {
    // Trae attachments para poder borrar también en Cloudinary
    const entity = await this.repo.findOne({
      where: { id },
      relations: ["attachments"],
    });

    if (!entity) {
      throw new NotFoundException("Announcement not found");
    }

    // 1) Intentar borrar en Cloudinary primero (mejor evitar huérfanos)
    const attachments = entity.attachments ?? [];
    for (const att of attachments) {
      try {
        // Con el tipo con el que se guardó: los videos se archivan como
        // `video` y borrarlos como imagen no falla, simplemente no borra.
        await this.cloudinary.delete(
          att.publicId,
          CloudinaryService.resourceTypeFor(att.resourceType),
        );
      } catch {
        // Si falla Cloudinary, no detenemos el borrado de BD:
        // pero quedaría un huérfano externo. Si quieres "modo estricto",
        // aquí se puede lanzar error.
      }
    }

    // 2) Borrar en BD (attachments caen por CASCADE)
    await this.repo.remove(entity);
    return { deleted: true, id };
  }

  /* ─────────────── Mutations ─────────────── */

  async createWithFiles(dto: CreateAnnouncementDto, files: IncomingFile[]) {
    // 0) Crear anuncio sin adjuntos (todavía no persistimos definitivo)
    const uploadedResults: Array<{
      file: IncomingFile;
      uploadResult: Awaited<ReturnType<CloudinaryService["upload"]>>;
    }> = [];

    try {
      // 1) Subir archivos a Cloudinary primero (operación externa)
      if (files?.length) {
        for (const file of files) {
          const uploadResult = await this.cloudinary.upload(file.buffer);
          uploadedResults.push({ uploadResult, file });
        }
      }

      // 2) Persistir en BD dentro de transacción
      const saved = await this.repo.manager.transaction(async (manager) => {
        const announcementRepo = manager.getRepository(Announcement);
        const attachmentRepo = manager.getRepository(AnnouncementAttachment);

        const announcement = announcementRepo.create(dto);
        await announcementRepo.save(announcement);

        if (!uploadedResults.length) {
          return announcement;
        }

        const attachments = uploadedResults.map(({ uploadResult, file }) =>
          attachmentRepo.create({
            ...this.normalizeUpload(uploadResult, file),
            announcement,
          }),
        );

        await attachmentRepo.save(attachments);

        // Retornar con attachments (sin requerir nueva query)
        return {
          ...announcement,
          attachments,
        };
      });

      return saved;
    } catch (err) {
      // 3) Limpieza: si algo falla, borrar lo subido a Cloudinary
      for (const { uploadResult } of uploadedResults) {
        try {
          await this.cloudinary.delete(
            uploadResult.public_id,
            CloudinaryService.resourceTypeFor(uploadResult.resource_type),
          );
        } catch {
          // Si falla la limpieza, no ocultamos el error original.
        }
      }
      throw err;
    }
  }

  /* ─────────────── Pagination ─────────────── */

  findAll() {
    return this.repo.find({
      order: { createdAt: "DESC" },
    });
  }

  /** Listado para el panel admin (incluye adjuntos). */
  findAllForAdmin() {
    return this.repo.find({
      order: { createdAt: "DESC" },
      relations: ["attachments"],
    });
  }

  findPaginatedWithFilters(
    limit: number,
    offset: number,
    title?: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const where: FindOptionsWhere<Announcement> = {};

    if (title) {
      where.title = ILike(`%${title}%`);
    }

    if (fromDate && toDate) {
      where.createdAt = Between(new Date(fromDate), new Date(toDate));
    } else if (fromDate) {
      where.createdAt = Between(new Date(fromDate), new Date());
    }

    return this.repo.find({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
      relations: ["attachments"],
    });
  }
}
