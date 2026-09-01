import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudinaryService } from "../cloudinary/cloudinary.service";
import {
  ValidatableFile,
  validateChurchImage,
} from "../../common/validation/file-validation";
import { SiteBackground } from "./site-background.entity";
import { SiteSettings } from "./site-settings.entity";
import { UpdateBackgroundDto } from "./dto/update-background.dto";
import { UpdateSiteSettingsDto } from "./dto/update-site-settings.dto";

const SETTINGS_ID = "default";
const BACKGROUNDS_FOLDER = "site-backgrounds";

interface UploadInputs {
  desktop: ValidatableFile;
  mobile?: ValidatableFile;
  label?: string;
}

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(SiteBackground)
    private readonly bgRepo: Repository<SiteBackground>,
    @InjectRepository(SiteSettings)
    private readonly settingsRepo: Repository<SiteSettings>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /* ── Settings ── */

  async getSettings(): Promise<SiteSettings> {
    let settings = await this.settingsRepo.findOne({
      where: { id: SETTINGS_ID },
    });
    if (!settings) {
      // Inserción tolerante a la carrera: la fila es única (id fijo) y esto lo
      // invoca también el portal público, así que dos peticiones a la vez con
      // la tabla vacía intentaban crearla las dos y una fallaba con error de
      // servidor por clave duplicada. Con ON CONFLICT DO NOTHING gana la
      // primera y la segunda simplemente relee.
      await this.settingsRepo
        .createQueryBuilder()
        .insert()
        .into(SiteSettings)
        .values({
          id: SETTINGS_ID,
          backgroundIntervalSeconds: 8,
          backgroundFadeSeconds: 1,
          backgroundEnabled: true,
        })
        .orIgnore()
        .execute();

      settings = await this.settingsRepo.findOneOrFail({
        where: { id: SETTINGS_ID },
      });
    }
    return settings;
  }

  async updateSettings(dto: UpdateSiteSettingsDto): Promise<SiteSettings> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }

  /* ── Backgrounds (público) ── */

  async getPublicBackgrounds() {
    const [items, settings] = await Promise.all([
      this.bgRepo.find({
        where: { isActive: true },
        order: { sortOrder: "ASC", createdAt: "ASC" },
      }),
      this.getSettings(),
    ]);

    return {
      images: items.map((bg) => ({
        id: bg.id,
        imageUrl: bg.imageUrl,
        mobileImageUrl: bg.mobileImageUrl,
      })),
      intervalSeconds: settings.backgroundIntervalSeconds,
      fadeSeconds: settings.backgroundFadeSeconds,
      enabled: settings.backgroundEnabled,
    };
  }

  /* ── Backgrounds (admin) ── */

  findAllForAdmin() {
    return this.bgRepo.find({
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async create(input: UploadInputs): Promise<SiteBackground> {
    validateChurchImage(input.desktop);
    if (input.mobile) validateChurchImage(input.mobile);

    const desktop = await this.cloudinary.uploadToFolder(
      input.desktop.buffer,
      BACKGROUNDS_FOLDER,
    );
    let mobile: { secure_url: string; public_id: string } | null = null;
    if (input.mobile) {
      const result = await this.cloudinary.uploadToFolder(
        input.mobile.buffer,
        BACKGROUNDS_FOLDER,
      );
      mobile = { secure_url: result.secure_url, public_id: result.public_id };
    }

    // Calcular siguiente sortOrder.
    const lastOrder = await this.bgRepo
      .createQueryBuilder("b")
      .select("MAX(b.sortOrder)", "max")
      .getRawOne<{ max: number | null }>();
    const nextOrder = (lastOrder?.max ?? -1) + 1;

    const bg = this.bgRepo.create({
      imageUrl: desktop.secure_url,
      imagePublicId: desktop.public_id,
      mobileImageUrl: mobile?.secure_url ?? null,
      mobileImagePublicId: mobile?.public_id ?? null,
      label: (input.label ?? "").trim(),
      sortOrder: nextOrder,
      isActive: true,
    });
    return this.bgRepo.save(bg);
  }

  async update(id: string, dto: UpdateBackgroundDto): Promise<SiteBackground> {
    const bg = await this.bgRepo.findOne({ where: { id } });
    if (!bg) throw new NotFoundException("Imagen de fondo no encontrada");
    if (dto.label !== undefined) bg.label = dto.label.trim();
    if (dto.sortOrder !== undefined) bg.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) bg.isActive = dto.isActive;
    return this.bgRepo.save(bg);
  }

  async remove(id: string) {
    const bg = await this.bgRepo.findOne({ where: { id } });
    if (!bg) throw new NotFoundException("Imagen de fondo no encontrada");

    // Borrar de Cloudinary (no bloqueante en caso de error remoto).
    await this.cloudinary.delete(bg.imagePublicId);
    if (bg.mobileImagePublicId) {
      await this.cloudinary.delete(bg.mobileImagePublicId);
    }

    await this.bgRepo.remove(bg);
    return { deleted: true, id };
  }

  async reorder(orderedIds: string[]) {
    const all = await this.bgRepo.find();
    const map = new Map(all.map((b) => [b.id, b]));
    const updates: SiteBackground[] = [];
    orderedIds.forEach((bgId, index) => {
      const bg = map.get(bgId);
      if (bg) {
        bg.sortOrder = index;
        updates.push(bg);
      }
    });
    await this.bgRepo.save(updates);
    return { ok: true };
  }
}
