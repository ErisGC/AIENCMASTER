import { cookies } from 'next/headers';

import { COOKIE_ZONA } from './zona-cookie';

/** Si quien visita ya compartió su zona y puede ver los anuncios. */
export async function zonaCompartida(): Promise<boolean> {
  const valor = (await cookies()).get(COOKIE_ZONA)?.value;
  return Boolean(valor && /^\d{10,16}$/.test(valor));
}
