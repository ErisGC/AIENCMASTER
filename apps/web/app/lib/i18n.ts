/**
 * Helpers para mostrar valores del backend (roles, estados, códigos de
 * auditoría) en español al usuario final. Todos los administradores son
 * hispanohablantes — los identificadores quedan en el código (legibles
 * para el desarrollador) pero al usuario nunca le mostramos "ROOT",
 * "PENDING", "ADMIN_INVITATION_CREATED", etc.
 */

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'ROOT':
      return 'Administrador principal';
    case 'ADMIN':
      return 'Administrador';
    default:
      return role ?? '—';
  }
}

/** Versión corta para badges/chips donde no cabe el texto largo. */
export function roleShortLabel(role: string | null | undefined): string {
  switch (role) {
    case 'ROOT':
      return 'Principal';
    case 'ADMIN':
      return 'Admin';
    default:
      return role ?? '—';
  }
}

export function invitationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING':
      return 'Pendiente';
    case 'ACCEPTED':
      return 'Aceptada';
    case 'REVOKED':
      return 'Revocada';
    case 'EXPIRED':
      return 'Expirada';
    default:
      return status ?? '—';
  }
}

export function reportTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'OFFERINGS':
      return 'Ofrendas';
    case 'ATTENDANCE':
      return 'Asistencia';
    case 'EXPENSES':
      return 'Gasto / egreso';
    case 'EVENT':
      return 'Evento especial';
    case 'REQUEST':
      return 'Solicitud';
    case 'OTHER':
      return 'Otro';
    default:
      return type ?? '—';
  }
}

/**
 * Traduce los códigos de la tabla de auditoría (admin-audit.service.ts) a
 * frases legibles. Mantén sincronizada con la app Flutter
 * (apps/admin_app/lib/core/models/domain.dart).
 */
export function actionTypeLabel(code: string): string {
  switch (code) {
    // ── Sesión ──
    case 'LOGIN_SUCCEEDED':
    case 'ADMIN_LOGIN_SUCCESS':
      return 'Inicio de sesión';
    case 'LOGIN_SUCCEEDED_DEVICE_VERIFICATION_DISABLED':
      return 'Inicio de sesión (verificación de dispositivo desactivada)';
    case 'LOGIN_FAILED':
    case 'ADMIN_LOGIN_FAILED':
      return 'Intento de inicio de sesión fallido';
    case 'LOGIN_BLOCKED_DEVICE_CONFLICT':
      return 'Inicio de sesión bloqueado (conflicto de dispositivo)';
    case 'LOGIN_BLOCKED_INACTIVE_ACCOUNT':
      return 'Inicio de sesión bloqueado (cuenta inactiva)';
    case 'LOGOUT':
    case 'ADMIN_LOGOUT':
      return 'Cierre de sesión';

    // ── Bootstrap / recuperación ROOT ──
    case 'ROOT_BOOTSTRAPPED':
      return 'Cuenta principal inicial creada';
    case 'ROOT_BOOTSTRAP_FAILED':
      return 'Intento fallido de bootstrap';
    case 'ROOT_DEVICE_RECOVERED':
      return 'Dispositivo principal recuperado';
    case 'ROOT_RECOVERY_FAILED':
      return 'Intento fallido de recuperación';
    case 'ROOT_ACCESS_DENIED_ROLE':
      return 'Acceso ROOT denegado (rol)';
    case 'ROOT_ACCESS_DENIED_DEVICE':
      return 'Acceso ROOT denegado (dispositivo)';

    // ── Invitaciones / cuentas ──
    case 'ADMIN_INVITATION_CREATED':
      return 'Invitación creada';
    case 'ROOT_INVITATION_CREATED':
      return 'Invitación ROOT creada';
    case 'ADMIN_INVITATION_REVOKED':
      return 'Invitación revocada';
    case 'ADMIN_INVITATION_ACCEPTED':
      return 'Invitación aceptada';
    case 'ADMIN_ACCOUNT_CREATED':
      return 'Cuenta creada';
    case 'ROOT_ACCOUNT_CREATED':
      return 'Cuenta ROOT creada';
    case 'ADMIN_ACCOUNT_DEACTIVATED':
      return 'Cuenta desactivada';
    case 'ADMIN_ACCOUNT_REACTIVATED':
      return 'Cuenta reactivada';
    case 'ADMIN_PASSWORD_RESET':
      return 'Contraseña reseteada';
    case 'ADMIN_PROFILE_PHOTO_UPDATED':
      return 'Foto de perfil actualizada';
    case 'ADMIN_PROFILE_PHOTO_REMOVED':
      return 'Foto de perfil eliminada';
    case 'ROLE_PROMOTED_TO_ROOT':
      return 'Cuenta promovida a administrador principal';
    case 'ROLE_DEMOTED_TO_ADMIN':
      return 'Cuenta degradada a administrador';

    // ── Permisos ──
    case 'ADMIN_PERMISSIONS_UPDATED':
    case 'ADMIN_GLOBAL_PERMISSIONS_UPDATED':
      return 'Permisos globales actualizados';
    case 'ADMIN_CHURCH_PERMISSIONS_UPDATED':
      return 'Permisos de iglesia actualizados';
    case 'ADMIN_CHURCH_ASSIGNED':
      return 'Iglesia asignada';
    case 'ADMIN_CHURCH_UNASSIGNED':
      return 'Iglesia removida';

    // ── Solicitudes de acceso ──
    case 'ACCESS_REQUEST_CREATED':
      return 'Solicitud de acceso creada';
    case 'ACCESS_REQUEST_APPROVED':
      return 'Solicitud de acceso aprobada';
    case 'ACCESS_REQUEST_REJECTED':
      return 'Solicitud de acceso rechazada';

    // ── Dispositivos ──
    case 'DEVICE_REVOKED':
      return 'Dispositivo revocado';

    // ── Informes ──
    case 'REPORT_CREATED':
      return 'Informe creado';
    case 'REPORT_UPDATED':
      return 'Informe editado';
    case 'REPORT_DELETED':
      return 'Informe eliminado';
    case 'REPORT_DOCUMENT_ADDED':
      return 'Documento adjunto a un informe';
    case 'REPORT_DOCUMENT_VIEWED':
      return 'Documento de informe consultado';
    case 'REPORT_DOCUMENT_DELETED':
      return 'Documento de informe eliminado';

    // ── Cronograma ──
    case 'EVENT_CREATED':
      return 'Evento creado';
    case 'EVENT_SERIES_CREATED':
      return 'Serie de eventos creada';
    case 'EVENT_UPDATED':
      return 'Evento editado';
    case 'EVENT_DELETED':
      return 'Evento eliminado';
    case 'EVENT_SERIES_DELETED':
      return 'Serie de eventos eliminada';

    // ── Anuncios ──
    case 'ANNOUNCEMENT_CREATED':
      return 'Anuncio creado';
    case 'ANNOUNCEMENT_UPDATED':
      return 'Anuncio editado';
    case 'ANNOUNCEMENT_DELETED':
      return 'Anuncio eliminado';
    case 'CHURCH_ANNOUNCEMENT_CREATED':
      return 'Anuncio de iglesia creado';
    case 'CHURCH_ANNOUNCEMENT_UPDATED':
      return 'Anuncio de iglesia editado';
    case 'CHURCH_ANNOUNCEMENT_DELETED':
      return 'Anuncio de iglesia eliminado';

    // ── Iglesias ──
    case 'CHURCH_CREATED':
      return 'Iglesia creada';
    case 'CHURCH_UPDATED':
      return 'Iglesia editada';
    case 'CHURCH_DELETED':
      return 'Iglesia eliminada';
    case 'CHURCH_TOGGLED':
      return 'Iglesia activada/desactivada';
    case 'CHURCH_DEACTIVATED':
      return 'Iglesia desactivada';
    case 'CHURCH_REACTIVATED':
      return 'Iglesia reactivada';

    // ── Directores ──
    case 'CHURCH_DIRECTOR_CREATED':
    case 'DIRECTOR_CREATED':
      return 'Director añadido';
    case 'CHURCH_DIRECTOR_UPDATED':
    case 'DIRECTOR_UPDATED':
      return 'Director editado';
    case 'CHURCH_DIRECTOR_DELETED':
    case 'DIRECTOR_DELETED':
      return 'Director eliminado';

    // ── Sitio / configuración pública ──
    case 'SITE_SETTINGS_UPDATED':
      return 'Configuración del sitio actualizada';
    case 'SITE_BACKGROUND_CREATED':
      return 'Imagen de fondo añadida';
    case 'SITE_BACKGROUND_UPDATED':
      return 'Imagen de fondo editada';
    case 'SITE_BACKGROUND_DELETED':
      return 'Imagen de fondo eliminada';
    case 'SITE_BACKGROUND_REORDERED':
      return 'Fondos reordenados';

    // ── Seguridad ──
    case 'ADMIN_ORIGIN_REJECTED':
      return 'Petición bloqueada (origen inválido)';

    default: {
      // Fallback: "SNAKE_CASE" → "Snake case"
      const cleaned = code.replace(/_/g, ' ').toLowerCase();
      if (cleaned.length === 0) return code;
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }
}

export function targetTypeLabel(targetType: string | null | undefined): string {
  switch (targetType) {
    case 'REPORT':
      return 'Informe';
    case 'EVENT':
      return 'Evento';
    case 'ANNOUNCEMENT':
      return 'Anuncio global';
    case 'CHURCH_ANNOUNCEMENT':
      return 'Anuncio de iglesia';
    case 'CHURCH':
      return 'Iglesia';
    case 'ADMIN_INVITATION':
      return 'Invitación';
    case 'ADMIN_ACCOUNT':
      return 'Cuenta de administrador';
    case 'DIRECTOR':
      return 'Director';
    case 'ADMIN_HTTP_REQUEST':
      return 'Petición HTTP';
    case null:
    case undefined:
    case '':
      return '—';
    default:
      return targetType;
  }
}
