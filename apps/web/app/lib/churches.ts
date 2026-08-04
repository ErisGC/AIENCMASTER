import { apiGet } from './api';

/**
 * 📌 Tipo Church
 * Refleja exactamente lo que el backend expone
 * (Church entity pública)
 */
export type ChurchPublicDirector = {
  id: string;
  displayName: string;
  role: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
};

export type Church = {
  id: string;

  /* Identidad */
  name: string;
  city: string;
  address?: string | null;

  /* Maps */
  mapsLat?: number | null;
  mapsLng?: number | null;
  mapsUrl?: string | null;

  /* Media */
  mainImageUrl?: string | null;
  coverImageUrl?: string | null;

  /* avgAttendance NO se expone al público (privado por designio del cliente);
     por eso no está en este tipo. Los representantes tampoco son texto: van
     como registros en `directors`. */

  /* Directores (sólo en findOnePublic) */
  directors?: ChurchPublicDirector[];

  /* Estado */
  isActive: boolean;

  /* Timestamps */
  createdAt: string;
  updatedAt: string;
};

/**
 * 📌 Listado público
 * Devuelve TODAS las iglesias (activas + inactivas)
 * El front decide interacción según isActive
 */
export function getPublicChurches() {
  return apiGet<Church[]>('/churches');
}

/**
 * 📌 Detalle público
 * SOLO funciona si la iglesia está activa
 * Inactivas → backend responde 404
 */
export function getPublicChurchById(id: string) {
  return apiGet<Church>(`/churches/${id}`);
}
