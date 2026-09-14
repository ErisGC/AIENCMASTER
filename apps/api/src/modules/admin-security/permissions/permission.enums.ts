/**
 * Catálogo de permisos del sistema.
 *
 * Hay dos dimensiones de permisos:
 *
 * 1. GLOBALES (GlobalPermission): aplican a toda la plataforma.
 *    Solo el ROOT los tiene todos por defecto. Pueden delegarse a otros
 *    admins explícitamente.
 *
 * 2. POR IGLESIA (ChurchPermission): se asignan a la relación
 *    admin ↔ iglesia (AdminChurchAssignment). Un admin con varias
 *    iglesias puede tener distintos permisos en cada una.
 *
 * Mantener estos enums es la fuente única de la verdad: añadir un
 * permiso aquí + en el catálogo `PERMISSION_CATALOG` y el sistema lo
 * reconoce automáticamente en validaciones, UI y templates.
 */

export enum GlobalPermission {
  MANAGE_GLOBAL_ANNOUNCEMENTS = "MANAGE_GLOBAL_ANNOUNCEMENTS",
  MANAGE_CHURCHES = "MANAGE_CHURCHES",
  MANAGE_ADMINS = "MANAGE_ADMINS",
  VIEW_ALL_REPORTS = "VIEW_ALL_REPORTS",
  MANAGE_GLOBAL_EVENTS = "MANAGE_GLOBAL_EVENTS",
}

export enum ChurchPermission {
  MANAGE_CHURCH_ANNOUNCEMENTS = "MANAGE_CHURCH_ANNOUNCEMENTS",
  SUBMIT_REPORTS = "SUBMIT_REPORTS",
  EDIT_CHURCH_INFO = "EDIT_CHURCH_INFO",
  MANAGE_DIRECTORS = "MANAGE_DIRECTORS",
  MANAGE_EVENTS = "MANAGE_EVENTS",
}

/**
 * Catálogo legible para consumir desde el frontend. Cada entrada
 * incluye una etiqueta corta y una descripción para que la UI muestre
 * claramente qué hace cada permiso (en lugar de pedirle al usuario que
 * memorice nombres internos).
 */
export interface PermissionDescriptor {
  key: string;
  label: string;
  description: string;
  group: "global" | "church";
}

export const PERMISSION_CATALOG: PermissionDescriptor[] = [
  {
    key: GlobalPermission.MANAGE_GLOBAL_ANNOUNCEMENTS,
    label: "Gestionar anuncios globales",
    description:
      "Crear, editar y eliminar anuncios que se muestran en la página pública de AIENC.",
    group: "global",
  },
  {
    key: GlobalPermission.MANAGE_CHURCHES,
    label: "Gestionar iglesias",
    description:
      "Crear nuevas iglesias, eliminarlas y editar cualquier iglesia del directorio.",
    group: "global",
  },
  {
    key: GlobalPermission.MANAGE_ADMINS,
    label: "Gestionar administradores",
    description:
      "Invitar nuevos administradores, asignar permisos, desactivar cuentas y eliminar.",
    group: "global",
  },
  {
    key: GlobalPermission.VIEW_ALL_REPORTS,
    label: "Ver informes de todas las iglesias",
    description:
      "Acceso de lectura a informes de cualquier iglesia, no sólo las asignadas.",
    group: "global",
  },
  {
    key: GlobalPermission.MANAGE_GLOBAL_EVENTS,
    label: "Gestionar eventos globales",
    description:
      "Programar, editar y eliminar eventos que competen a varias iglesias (cultos unidos, asambleas, intensivos) en el cronograma general.",
    group: "global",
  },
  {
    key: ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
    label: "Gestionar anuncios de la iglesia",
    description:
      "Publicar, editar y eliminar anuncios visibles en la página pública de esta iglesia.",
    group: "church",
  },
  {
    key: ChurchPermission.SUBMIT_REPORTS,
    label: "Subir informes",
    description:
      "Registrar ofrendas, asistencia, egresos, eventos y solicitudes de la iglesia.",
    group: "church",
  },
  {
    key: ChurchPermission.EDIT_CHURCH_INFO,
    label: "Editar información de la iglesia",
    description:
      "Modificar dirección, mapa, fotos, promedio de asistentes y representantes. El nombre nunca se puede modificar.",
    group: "church",
  },
  {
    key: ChurchPermission.MANAGE_DIRECTORS,
    label: "Gestionar directores",
    description:
      "Agregar, editar o eliminar a los directores encargados que aparecen en la iglesia.",
    group: "church",
  },
  {
    key: ChurchPermission.MANAGE_EVENTS,
    label: "Gestionar eventos de la iglesia",
    description:
      "Programar, editar y eliminar los cultos y actividades de esta iglesia en el cronograma. El sistema avisa si se cruzan con eventos globales.",
    group: "church",
  },
];

/** Set helper: todos los permisos globales (los que tiene ROOT). */
export const ALL_GLOBAL_PERMISSIONS: GlobalPermission[] =
  Object.values(GlobalPermission);

/** Set helper: todos los permisos por iglesia. */
export const ALL_CHURCH_PERMISSIONS: ChurchPermission[] =
  Object.values(ChurchPermission);

/**
 * Templates predefinidos. La UI los muestra como "preset" y siempre
 * con su descripción visible para que el ROOT vea exactamente qué
 * marca antes de aplicar.
 */
export interface PermissionTemplate {
  key: string;
  name: string;
  description: string;
  globalPermissions: GlobalPermission[];
  churchPermissions: ChurchPermission[];
}

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    key: "PASTOR",
    name: "Pastor",
    description:
      "Tiene control total sobre la iglesia: anuncios, informes, directores y la información pública.",
    globalPermissions: [],
    churchPermissions: [
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
      ChurchPermission.SUBMIT_REPORTS,
      ChurchPermission.EDIT_CHURCH_INFO,
      ChurchPermission.MANAGE_DIRECTORS,
      ChurchPermission.MANAGE_EVENTS,
    ],
  },
  {
    key: "TREASURER",
    name: "Tesorero",
    description:
      "Sólo puede subir informes (ofrendas, egresos, asistencia, eventos y solicitudes).",
    globalPermissions: [],
    churchPermissions: [ChurchPermission.SUBMIT_REPORTS],
  },
  {
    key: "SECRETARY",
    name: "Secretario",
    description:
      "Anuncios y eventos de la iglesia, y registro de asistencia / informes generales.",
    globalPermissions: [],
    churchPermissions: [
      ChurchPermission.MANAGE_CHURCH_ANNOUNCEMENTS,
      ChurchPermission.SUBMIT_REPORTS,
      ChurchPermission.MANAGE_EVENTS,
    ],
  },
  {
    key: "CUSTOM",
    name: "Personalizado",
    description:
      "Marca cada permiso manualmente. Recomendado cuando el rol no coincide con los presets.",
    globalPermissions: [],
    churchPermissions: [],
  },
];
