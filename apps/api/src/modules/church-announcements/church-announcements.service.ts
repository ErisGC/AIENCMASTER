import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { Church } from "../churches/church.entity";
import { ChurchAnnouncementAttachment } from "./church-announcement-attachment.entity";
import { ChurchAnnouncement } from "./church-announcement.entity";
import { CreateChurchAnnouncementDto } from "./dto/create-church-announcement.dto";
import { UpdateChurchAnnouncementDto } from "./dto/update-church-announcement.dto";

interface IncomingFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class ChurchAnnouncementsService {
  constructor(
    @InjectRepository(ChurchAnnouncement)
    private readonly repo: Repository<ChurchAnnouncement>,
    @InjectRepository(ChurchAnnouncementAttachment)
    private readonly attachmentRepo: Repository<ChurchAnnouncementAttachment>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    private readonly cloudinary: CloudinaryService,
    private readonly dataSource: DataSource,
  ) {}

  /* ── Public ── */

  async listForPublic(churchId: string) {
    const church = await this.churchRepo.findOne({
      where: { id: churchId, isActive: true },
    });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    return this.repo.find({
      where: { churchId },
      relations: ["attachments"],
      order: { createdAt: "DESC" },
    });
  }

  async findOnePublic(id: string) {
    const announcement = await this.repo.findOne({
      where: { id },
      relations: ["attachments", "church"],
    });
    if (!announcement) throw new NotFoundException("Anuncio no encontrado");
    if (!announcement.church?.isActive) {
      throw new NotFoundException("Anuncio no disponible");
    }
    return announcement;
  }

  /* ── Admin ── */

  async listForAdmin(churchId: string) {
    return this.repo.find({
      where: { churchId },
      relations: ["attachments"],
      order: { createdAt: "DESC" },
    });
  }

  async findOneForAdmin(churchId: string, id: string) {
    const announcement = await this.repo.findOne({
      where: { id, churchId },
      relations: ["attachments"],
    });
    if (!announcement) throw new NotFoundException("Anuncio no encontrado");
    return announcement;
  }

  async create(
    churchId: string,
    dto: CreateChurchAnnouncementDto,
    files: IncomingFile[],
    actor: Pick<AdminAccount, "id">,
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    const uploads: ChurchAnnouncementAttachment[] = [];
    const uploadedPublicIds: string[] = [];

    try {
      for (const file of files) {
        const result = await this.cloudinary.uploadToFolder(
          file.buffer,
          `church-announcements/${churchId}`,
        );
        uploadedPublicIds.push(result.public_id);

        const att = this.attachmentRepo.create({
          publicId: result.public_id,
          url: result.secure_url,
          resourceType: result.resource_type,
          format: result.format,
          name: file.filename,
          size: result.bytes,
        });
        uploads.push(att);
      }

      const created = await this.dataSource.transaction(async (manager) => {
        const announcement = manager.create(ChurchAnnouncement, {
          churchId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          author: dto.author.trim(),
          createdByAdminAccountId: actor.id,
          lastUpdatedByAdminAccountId: null,
        });
        const saved = await manager.save(announcement);

        for (const att of uploads) {
          att.announcement = saved;
        }
        if (uploads.length) await manager.save(uploads);
        return saved;
      });

      return this.findOneForAdmin(churchId, created.id);
    } catch (err) {
      // Cleanup en Cloudinary si la DB falla
      for (const id of uploadedPublicIds) {
        await this.cloudinary.delete(id);
      }
      throw err;
    }
  }

  async update(
    churchId: string,
    id: string,
    dto: UpdateChurchAnnouncementDto,
    actor: Pick<AdminAccount, "id">,
  ) {
    const announcement = await this.findOneForAdmin(churchId, id);
    Object.assign(announcement, {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description.trim(),
      }),
      ...(dto.author !== undefined && { author: dto.author.trim() }),
      lastUpdatedByAdminAccountId: actor.id,
    });
    return this.repo.save(announcement);
  }

  async remove(churchId: string, id: string) {
    const announcement = await this.findOneForAdmin(churchId, id);

    // Borrar archivos en Cloudinary primero
    for (const att of announcement.attachments ?? []) {
      await this.cloudinary.delete(
        att.publicId,
        CloudinaryService.resourceTypeFor(att.resourceType),
      );
    }

    await this.repo.remove(announcement);
    return { deleted: true, id };
  }
}
