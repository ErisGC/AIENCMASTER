'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  AdminSessionResponse,
} from '@/app/lib/admin-auth';

const LS_KEY = 'aienc-admin:active-church-id';

// El navegador puede bloquear el almacenamiento (modo privado, datos del
// sitio bloqueados): leer o escribir lanzaría y tumbaría todo el panel.
function leerGuardada(): string | null {
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function guardar(id: string | null) {
  try {
    if (id) window.localStorage.setItem(LS_KEY, id);
    else window.localStorage.removeItem(LS_KEY);
  } catch {
    /* sin almacenamiento: la elección vale mientras la página esté abierta */
  }
}

export interface ChurchAssignmentLite {
  churchId: string;
  churchName: string | null;
  permissions: string[];
}

interface ActiveChurchContextValue {
  /**
   * Iglesia activa para el admin actual.
   * Devuelve null si:
   *  - El admin es ROOT (puede operar sobre todas; en cuyo caso se
   *    espera que cada pantalla maneje el "modo todos").
   *  - El admin no tiene ninguna iglesia asignada todavía.
   *  - La sesión aún no se cargó.
   */
  activeChurchId: string | null;
  activeChurch: ChurchAssignmentLite | null;
  assignments: ChurchAssignmentLite[];
  isRoot: boolean;
  isLoaded: boolean;
  /** Permisos globales de la cuenta (la principal los tiene todos). */
  globalPermissions: string[];
  setActiveChurchId: (id: string | null) => void;
}

const ActiveChurchContext = createContext<ActiveChurchContextValue | null>(
  null,
);

export function ActiveChurchProvider({
  session,
  children,
}: {
  session: AdminSessionResponse | null;
  children: React.ReactNode;
}) {
  const isRoot = session?.account?.role === 'ROOT';
  const isLoaded = session !== null;

  const assignments = useMemo<ChurchAssignmentLite[]>(
    () => session?.account?.churchAssignments ?? [],
    [session],
  );

  const [activeChurchId, setActiveChurchIdState] = useState<string | null>(
    null,
  );

  // Inicialización: usar lo que esté en localStorage si pertenece a las
  // asignaciones del admin; si no, escoger la primera asignación.
  //
  // Este efecto sincroniza state local con dos fuentes externas:
  //   - la sesión async (`isLoaded`, `isRoot`, `assignments`)
  //   - `localStorage` (sólo disponible en cliente)
  //
  // No podemos derivar este valor durante el render porque `localStorage`
  // no existe en SSR; eso causaría mismatch de hidratación. Cada setState
  // dentro del efecto está justificado y no produce cascade-render real
  // (depende sólo de inputs que cambian fuera de React).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isLoaded) return;
    if (isRoot) {
      // ROOT no necesita selector; mantenemos lo que tenga (puede ser null)
      const stored = leerGuardada();
      setActiveChurchIdState(stored && stored.length > 0 ? stored : null);
      return;
    }
    if (assignments.length === 0) {
      setActiveChurchIdState(null);
      return;
    }
    const stored = leerGuardada();
    const valid =
      stored && assignments.some((a) => a.churchId === stored)
        ? stored
        : assignments[0].churchId;
    setActiveChurchIdState(valid);
    guardar(valid);
  }, [isLoaded, isRoot, assignments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setActiveChurchId = useCallback((id: string | null) => {
    setActiveChurchIdState(id);
    guardar(id);
  }, []);

  const globalPermissions = useMemo<string[]>(
    () => session?.account?.globalPermissions ?? [],
    [session],
  );

  const activeChurch = useMemo(
    () =>
      activeChurchId
        ? assignments.find((a) => a.churchId === activeChurchId) ?? null
        : null,
    [activeChurchId, assignments],
  );

  const value = useMemo(
    () => ({
      activeChurchId,
      activeChurch,
      assignments,
      isRoot,
      isLoaded,
      globalPermissions,
      setActiveChurchId,
    }),
    [activeChurchId, activeChurch, assignments, isRoot, isLoaded, globalPermissions, setActiveChurchId],
  );

  return (
    <ActiveChurchContext.Provider value={value}>
      {children}
    </ActiveChurchContext.Provider>
  );
}

export function useActiveChurch() {
  const ctx = useContext(ActiveChurchContext);
  if (!ctx) {
    throw new Error('useActiveChurch debe usarse dentro de ActiveChurchProvider');
  }
  return ctx;
}
