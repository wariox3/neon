/**
 * El único sitio de la aplicación que habla con la API de RedEDoc.
 *
 * Dos reglas que no se pueden romper en ninguna llamada:
 *
 * 1. `credentials: 'include'`. La sesión son cookies `httpOnly` que el
 *    JavaScript no puede leer; sin esta opción el navegador no las manda y todo
 *    responde 401. No hay ningún token que guardar ni ninguna cabecera
 *    `Authorization` que poner: la API rechaza el `Bearer` a propósito.
 * 2. Un solo reintento tras refrescar. Si dos peticiones simultáneas reciben
 *    401 a la vez, comparten el mismo refresco en vuelo (`refrescoEnVuelo`); de
 *    lo contrario la segunda rotaría el token que la primera acaba de emitir y
 *    anularía la sesión recién renovada.
 */

const BASE = (import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '');

/** Dónde mandar a quien se queda sin sesión. */
export const RUTA_INGRESO = '/app/ingresar/';

/** Errores por campo, tal y como los pinta un formulario. */
export type ErroresPorCampo = Record<string, string[]>;

/**
 * Un 4xx/5xx de la API.
 *
 * nobelio normaliza todos sus errores a `{"detail": ..., "errores": {...}}`
 * (`apps.nucleo.api.exception_handler`), así que el cliente puede contar con esa
 * forma y no adivinar dónde está el mensaje.
 */
export class ErrorApi extends Error {
  estado: number;
  errores: ErroresPorCampo;

  constructor(estado: number, detalle: string, errores: ErroresPorCampo = {}) {
    super(detalle);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.errores = errores;
  }

  /** El primer mensaje de un campo, si lo hay. */
  de(campo: string): string | undefined {
    return this.errores[campo]?.[0];
  }
}

/** Una página de un listado paginado (`PageNumberPagination`, 10 por página). */
export interface Pagina<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const POR_PAGINA = 10;

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  /** Interno: evita que el reintento tras refrescar se reintente a su vez. */
  reintentar?: boolean;
}

function url(ruta: string): string {
  return ruta.startsWith('http') ? ruta : `${BASE}${ruta}`;
}

async function cuerpoDeError(respuesta: Response): Promise<ErrorApi> {
  let detalle = `La API respondió ${respuesta.status}.`;
  let errores: ErroresPorCampo = {};
  try {
    const datos = await respuesta.json();
    if (typeof datos?.detail === 'string') detalle = datos.detail;
    if (datos?.errores && typeof datos.errores === 'object') {
      errores = datos.errores as ErroresPorCampo;
    } else if (datos && typeof datos === 'object' && !('detail' in datos)) {
      // Un serializer que falla antes del handler devuelve los campos sueltos.
      errores = datos as ErroresPorCampo;
      const primero = Object.values(errores)[0];
      if (Array.isArray(primero) && primero[0]) detalle = primero[0];
    }
  } catch {
    // Sin cuerpo JSON (502 de un proxy, corte de red): se queda el genérico.
  }
  return new ErrorApi(respuesta.status, detalle, errores);
}

let refrescoEnVuelo: Promise<boolean> | null = null;

/** Renueva el acceso con la cookie de refresco. `false` si la sesión terminó. */
function refrescar(): Promise<boolean> {
  refrescoEnVuelo ??= fetch(url('/api/seguridad/token/refresh/'), {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refrescoEnVuelo = null;
    });
  return refrescoEnVuelo;
}

/** Llama a la API y devuelve el cuerpo ya deserializado. Lanza `ErrorApi`. */
export async function api<T = unknown>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, reintentar = true } = opciones;

  const respuesta = await fetch(url(ruta), {
    method: metodo,
    credentials: 'include',
    headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

  if (respuesta.status === 401 && reintentar) {
    if (await refrescar()) {
      return api<T>(ruta, { ...opciones, reintentar: false });
    }
  }

  if (!respuesta.ok) throw await cuerpoDeError(respuesta);
  if (respuesta.status === 204) return undefined as T;

  const texto = await respuesta.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Manda a la pantalla de ingreso conservando a dónde quería ir la persona. */
export function irAIngreso(): void {
  const destino = window.location.pathname + window.location.search;
  const volver = destino.startsWith('/app/') && destino !== RUTA_INGRESO
    ? `?volver=${encodeURIComponent(destino)}`
    : '';
  window.location.href = `${RUTA_INGRESO}${volver}`;
}
