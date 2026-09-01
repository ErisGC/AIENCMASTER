import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  UploadApiErrorResponse,
  UploadApiResponse,
  v2 as cloudinary,
} from "cloudinary";

import type { CloudinaryUploadResult } from "../../common/types";

/** Default folder used when no folder is specified. */
const DEFAULT_FOLDER = "misc";

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);

  onModuleInit() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        "Cloudinary credentials are incomplete — uploads will fail at runtime.",
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  /** Upload a buffer to the default "announcements" folder. */
  upload(buffer: Buffer): Promise<CloudinaryUploadResult> {
    return this.uploadToFolder(buffer, "announcements");
  }

  /** Upload a buffer to a specific Cloudinary folder. */
  uploadToFolder(
    buffer: Buffer,
    folder: string,
  ): Promise<CloudinaryUploadResult> {
    const safeFolder = folder?.trim() || DEFAULT_FOLDER;

    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
            folder: safeFolder,
            access_mode: "public",
          },
          (
            error: UploadApiErrorResponse | undefined,
            result: UploadApiResponse | undefined,
          ) => {
            if (error) {
              const message =
                typeof error.message === "string" && error.message.length > 0
                  ? error.message
                  : "Cloudinary upload failed";
              reject(new Error(message));
            } else if (result) {
              resolve({
                public_id: result.public_id,
                secure_url: result.secure_url,
                resource_type: result.resource_type,
                format: result.format,
                original_filename: result.original_filename,
                bytes: result.bytes,
              });
            } else {
              reject(new Error("Cloudinary upload returned no result"));
            }
          },
        )
        .end(buffer);
    });
  }

  /**
   * Delete a resource by its public ID.
   *
   * `resourceType` must match how the asset was stored. Cloudinary treats
   * audio as `video`, so deleting a study audio requires passing "video";
   * images use the default. Passing the wrong type silently no-ops on
   * Cloudinary's side, which is why we thread it through.
   */
  /**
   * Traduce el `resource_type` guardado al que acepta el borrado.
   *
   * Cloudinary clasifica los audios como `video`, y borrar con el tipo
   * equivocado no falla: simplemente no borra nada. Por eso el tipo con el que
   * se subió el archivo se guarda en la base de datos y se usa al eliminarlo.
   * Cualquier valor desconocido cae a `image`, que es el tipo por defecto.
   */
  static resourceTypeFor(
    raw: string | null | undefined,
  ): "image" | "video" | "raw" {
    if (raw === "video" || raw === "raw") return raw;
    return "image";
  }

  async delete(
    publicId: string,
    resourceType: "image" | "video" | "raw" = "image",
  ): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to delete Cloudinary resource ${publicId}: ${String(error)}`,
      );
    }
  }
}
