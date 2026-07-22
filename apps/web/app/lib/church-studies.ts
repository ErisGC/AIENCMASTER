import { API_BASE_URL } from './api';

/** Estudio / mensaje en audio de una iglesia, tal como lo expone el backend. */
export type ChurchStudy = {
  id: string;
  teacherName: string;
  topic: string;
  outline: string | null;
  audioUrl: string;
  audioFormat: string | null;
  createdAt: string;
};

/**
 * Estudios públicos de una iglesia (más reciente primero). Degrada a lista
 * vacía si la API no responde, para no tumbar la página de la iglesia.
 */
export async function getPublicChurchStudies(
  churchId: string,
): Promise<ChurchStudy[]> {
  const res = await fetch(`${API_BASE_URL}/churches/${churchId}/studies`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status} on /churches/${churchId}/studies`);
  }
  return res.json() as Promise<ChurchStudy[]>;
}
