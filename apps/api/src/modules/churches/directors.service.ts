import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AdminAccount } from "../admin-security/admin-account.entity";
import { AdminRole } from "../admin-security/enums/admin-role.enum";
import { ChurchPermission } from "../admin-security/permissions/permission.enums";
import { PermissionsService } from "../admin-security/permissions/permissions.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import {
  ValidatableFile,
  validateChurchImage,
} from "../../common/validation/file-validation";
import { ChurchDirector } from "./church-director.entity";
import { Church } from "./church.entity";
import { CreateDirectorDto } from "./dto/create-director.dto";
import { UpdateDirectorDto } from "./dto/update-director.dto";

const DIRECTORS_FOLDER = "church-directors";

@Injectable()
export class DirectorsService {
  constructor(
    @InjectRepository(ChurchDirector)
    private readonly directorRepo: Repository<ChurchDirector>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(AdminAccount)
    private readonly accountRepo: Repository<AdminAccount>,
    private readonly cloudinary: CloudinaryService,
    private readonly permissions: PermissionsService,
  ) {}

  /* ── Helpers ── */

  /**
   * Autoriza la gestión de directores de una iglesia. Exige el permiso
   * canónico MANAGE_DIRECTORS sobre ESA iglesia (ROOT pasa siempre); resuelto
   * contra AdminChurchAssignment, no contra el campo legacy assignedChurchId.
   * Así un admin con otro permiso (p.ej. tesorero con sólo SUBMIT_REPORTS) no
   * puede crear/editar/borrar directores, y nadie puede tocar una iglesia
   * sobre la que no tiene asignación.
   */
  private async assertScope(actor: AdminAccount, churchId: string) {
    await this.permissions.assertChurchPermission(
      actor,
      churchId,
      ChurchPermission.MANAGE_DIRECTORS,
    );
  }

  /* ── Public ── */

  /**
   * Lista de directores visibles para una iglesia.
   * La foto resultante prefiere la del AdminAccount vinculado si existe.
   */
  async findPublicByChurch(churchId: string) {
    const directors = await this.directorRepo.find({
      where: { churchId },
      relations: { linkedAdminAccount: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });

    return directors.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      role: d.role,
      phone: d.phone ?? null,
      email: d.email ?? null,
      photoUrl: d.linkedAdminAccount?.profilePhotoUrl ?? d.photoUrl ?? null,
    }));
  }

  /* ── Admin ── */

  async findAdminByChurch(churchId: string, actor: AdminAccount) {
    await this.assertScope(actor, churchId);
    const directors = await this.directorRepo.find({
      where: { churchId },
      relations: { linkedAdminAccount: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return directors.map((d) => ({
      id: d.id,
      churchId: d.churchId,
      displayName: d.displayName,
      role: d.role,
      phone: d.phone ?? null,
      email: d.email ?? null,
      photoUrl: d.photoUrl,
      linkedAdminAccountId: d.linkedAdminAccountId,
      linkedAdminPhotoUrl: d.linkedAdminAccount?.profilePhotoUrl ?? null,
      linkedAdminUsername: d.linkedAdminAccount?.username ?? null,
      sortOrder: d.sortOrder,
      createdAt: d.createdAt,
    }));
  }

  async create(
    churchId: string,
    dto: CreateDirectorDto,
    photo: ValidatableFile | null,
    actor: AdminAccount,
  ) {
    await this.assertScope(actor, churchId);

    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Iglesia no encontrada");

    if (dto.linkedAdminAccountId) {
      const linked = await this.accountRepo.findOne({
        where: { id: dto.linkedAdminAccountId },
      });
      if (!linked) throw new NotFoundException("Cuenta admin no encontrada");
      // Sólo se puede vincular una cuenta que tenga una asignación real a esta
      // iglesia (o ROOT, que puede vincular cualquiera). Se valida contra
      // AdminChurchAssignment, no contra el campo legacy assignedChurchId.
      if (actor.role !== AdminRole.ROOT) {
        const linkedChurchIds =
          await this.permissions.getAssignedChurchIds(linked);
        if (!linkedChurchIds.includes(churchId)) {
          throw new ForbiddenException(
            "Esa cuenta admin no pertenece a esta iglesia",
          );
        }
      }
    }

    let photoUrl: string | null = null;
    let photoPublicId: string | null = null;
    if (photo) {
      validateChurchImage(photo);
      const uploaded = await this.cloudinary.uploadToFolder(
        photo.buffer,
        DIRECTORS_FOLDER,
      );
      photoUrl = uploaded.secure_url;
      photoPublicId = uploaded.public_id;
    }

    const director = this.directorRepo.create({
      churchId,
      displayName: dto.displayName.trim(),
      role: (dto.role ?? "").trim(),
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      linkedAdminAccountId: dto.linkedAdminAccountId ?? null,
      photoUrl,
      photoPublicId,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.directorRepo.save(director);
  }

  async update(
    id: string,
    dto: UpdateDirectorDto,
    photo: ValidatableFile | null,
    actor: AdminAccount,
  ) {
    const director = await this.directorRepo.findOne({ where: { id } });
    if (!director) throw new NotFoundException("Director no encontrado");
    await this.assertScope(actor, director.churchId);

    if (dto.displayName !== undefined)
      director.displayName = dto.displayName.trim();
    if (dto.role !== undefined) director.role = dto.role.trim();
    if (dto.phone !== undefined) director.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined)
      director.email = dto.email?.trim().toLowerCase() || null;
    if (dto.sortOrder !== undefined) director.sortOrder = dto.sortOrder;
    if (dto.linkedAdminAccountId !== undefined) {
      director.linkedAdminAccountId = dto.linkedAdminAccountId ?? null;
    }

    if (photo) {
      validateChurchImage(photo);
      // Borrar la foto anterior si existía
      if (director.photoPublicId) {
        await this.cloudinary.delete(director.photoPublicId);
      }
      const uploaded = await this.cloudinary.uploadToFolder(
        photo.buffer,
        DIRECTORS_FOLDER,
      );
      director.photoUrl = uploaded.secure_url;
      director.photoPublicId = uploaded.public_id;
    }

    return this.directorRepo.save(director);
  }

  async remove(id: string, actor: AdminAccount) {
    const director = await this.directorRepo.findOne({ where: { id } });
    if (!director) throw new NotFoundException("Director no encontrado");
    await this.assertScope(actor, director.churchId);

    if (director.photoPublicId) {
      await this.cloudinary.delete(director.photoPublicId);
    }

    await this.directorRepo.remove(director);
    return { deleted: true, id };
  }
}
