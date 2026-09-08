/** Quién está usando el panel, según la cookie que trae el navegador. */
import { useEffect, useState } from 'react';

import { ErrorApi, api, irAIngreso } from './api';

/** Lo que `GET /api/seguridad/me/` devuelve de quien pregunta. */
export interface Usuario {
  id: number;
  email: string;
  nombre_corto: string | null;
  is_staff: boolean;
  is_verified: boolean;
  mfa_activo: boolean;
}

export type Sesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo' }
  /** No se pudo preguntar: la API no responde, o el navegador bloqueó la petición. */
  | { estado: 'error'; error: unknown }
  | { estado: 'autenticado'; usuario: Usuario };

/**
 * Pregunta a la API quién es quien mira la página.
 *
 * No se puede resolver en el cliente: la cookie es `httpOnly`, así que su mera
 * presencia no es observable desde JavaScript. La única forma de saber si la
 * sesión sigue viva es pedir algo y ver qué contesta.
 *
 * `exigir` manda a la pantalla de ingreso cuando no hay sesión. Se deja apagado
 * en las páginas públicas del panel (ingreso, registro, confirmación), que
 * necesitan saber si hay sesión pero no exigirla.
 */
export function useSesion(exigir = true): Sesion {
  const [sesion, setSesion] = useState<Sesion>({ estado: 'cargando' });

  useEffect(() => {
    let vigente = true;

    api<Usuario>('/api/seguridad/me/')
      .then((usuario) => {
        if (vigente) setSesion({ estado: 'autenticado', usuario });
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        // Un 401 aquí ya viene después del intento de refresco que hace el
        // cliente: si llega, la sesión terminó de verdad.
        if (error instanceof ErrorApi && error.estado === 401) {
          setSesion({ estado: 'anonimo' });
          if (exigir) irAIngreso();
          return;
        }
        // Un fallo de red no es "no hay sesión": mandar al ingreso aquí
        // escondería el problema real —la API caída, o el navegador bloqueando
        // la petición por CORS— detrás de un formulario que tampoco va a
        // funcionar. Se dice lo que pasa.
        setSesion({ estado: 'error', error });
      });

    return () => {
      vigente = false;
    };
  }, [exigir]);

  return sesion;
}

/** Cierra la sesión y vuelve al ingreso. */
export async function cerrarSesion(): Promise<void> {
  try {
    await api('/api/seguridad/token/cerrar/', { metodo: 'POST' });
  } catch {
    // Cerrar sesión con una sesión ya rota no es un error: el resultado es el
    // que se pedía. Las cookies caducan solas.
  }
  window.location.href = '/app/ingresar/';
}
