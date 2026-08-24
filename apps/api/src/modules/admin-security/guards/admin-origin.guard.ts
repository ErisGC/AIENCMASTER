import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { AdminAuditService } from "../admin-audit.service";
import type { AdminRequest } from "../admin-security.types";

@Injectable()
export class AdminOriginGuard implements CanActivate {
  private readonly safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  constructor(private readonly auditService: AdminAuditService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    if (this.safeMethods.has(request.method.toUpperCase())) {
      return true;
    }

    const allowedOrigins = this.getAllowedOrigins();
    const origin = this.normalizeOrigin(
      this.extractHeader(request.headers.origin),
    );
    const referer = this.extractHeader(request.headers.referer);

    // Para requests que modifican estado (POST/PUT/PATCH/DELETE)
    // requerimos presencia explícita de Origin o Referer válido.
    // Aceptamos:
    //   - WEB_ORIGIN (la web Next.js en producción/local)
    //   - MOBILE_APP_ORIGIN (la app Flutter, ej. "aiencadmin://app")
    // Si tanto Origin como Referer son inválidos, rechazamos.
    const originAllowed = origin !== null && allowedOrigins.includes(origin);
    const refererAllowed =
      referer !== null &&
      allowedOrigins.some((o) => this.matchesAllowedOrigin(referer, o));

    if (originAllowed || refererAllowed) {
      return true;
    }

    await this.auditService.log({
      actorAdminAccountId: request.adminAuth?.account.id ?? null,
      actorDeviceId: request.adminAuth?.device.id ?? null,
      actionType: "ADMIN_ORIGIN_REJECTED",
      targetType: "ADMIN_HTTP_REQUEST",
      description: `Request bloqueada por validación de Origin/Referer: ${request.method} ${request.url}`,
      ip: request.ip ?? null,
      userAgent:
        typeof request.headers["user-agent"] === "string"
          ? request.headers["user-agent"]
          : "",
      metadata: {
        origin,
        referer,
        allowedOrigins,
      },
    });

    throw new ForbiddenException("Invalid request origin");
  }

  /**
   * Lista de orígenes válidos. Por defecto sólo el `WEB_ORIGIN` (la web
   * Next.js), pero si `MOBILE_APP_ORIGIN` está configurado se acepta también.
   * El valor típico para la app Flutter es `aiencadmin://app`, que coincide
   * con el esquema custom registrado en AndroidManifest.xml.
   */
  private getAllowedOrigins(): string[] {
    // WEB_ORIGIN puede traer varios dominios separados por coma (mudanza de
    // dominio): se aceptan todos mientras dure la transición.
    const web = process.env.WEB_ORIGIN?.trim() || "http://localhost:3000";
    const origins: string[] = [];
    for (const piece of web.split(",")) {
      const norm = this.normalizeOrigin(piece.trim());
      if (norm !== null) origins.push(norm);
    }

    const mobile = process.env.MOBILE_APP_ORIGIN?.trim();
    if (mobile && mobile.length > 0) {
      const mobileNorm = this.normalizeOrigin(mobile);
      if (mobileNorm !== null) origins.push(mobileNorm);
    }
    return origins;
  }

  /**
   * Normaliza un origin para comparación exacta.
   *
   * - Para `http://` y `https://` usamos `URL.origin` (extrae scheme + host +
   *   port y descarta path/query/fragment).
   * - Para esquemas custom (como `aiencadmin://app`) la API del WHATWG hace
   *   `URL.origin === "null"`, lo cual es inseguro porque haría
   *   indistinguibles `aiencadmin://app` y `evil-app://app` (ambos serían
   *   `"null"`). En su lugar comparamos el string original normalizado
   *   (lowercase, sin trailing slash).
   *
   * Devuelve `null` si el valor está vacío o no es un origin razonable.
   */
  private normalizeOrigin(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const value = raw.trim();
    if (value.length === 0) return null;

    // Detectar esquema con regex: `<scheme>://`
    const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (!schemeMatch) return null;
    const scheme = schemeMatch[1].toLowerCase();

    if (scheme === "http" || scheme === "https") {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    }

    // Esquema custom: comparación literal lowercase sin trailing slash ni
    // path/query/fragment (cortamos en el primer '/' después de '://').
    const afterScheme = value.substring(scheme.length + 3); // saltar "://"
    const hostPart = afterScheme
      .split("/")[0]
      .split("?")[0]
      .split("#")[0]
      .toLowerCase();
    if (hostPart.length === 0) return null;
    return `${scheme}://${hostPart}`;
  }

  private extractHeader(value: unknown) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private matchesAllowedOrigin(value: string, allowedOrigin: string) {
    const normalized = this.normalizeOrigin(value);
    return normalized !== null && normalized === allowedOrigin;
  }
}
