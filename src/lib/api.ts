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

/** Un elemento de la lista `errores` de la API. */
export interface ErrorDeLista {
  codigo: string;
  mensaje: string;
}

/**
 * Un 4xx/5xx de la API.
 *
 * nobelio normaliza todos sus errores a
 * `{"detail": "...", "errores": [{"codigo": "...", "mensaje": "..."}]}`
 * (`apps.nucleo.api.exception_handler`), así que el cliente puede contar con esa
 * forma y no adivinar dónde está el mensaje. Cuando el fallo es de un campo, el
 * mensaje llega con la ruta delante —`url: Tiene que ser…`,
 * `responsabilidades[0]: …`—, y de ahí sale `errores`, el mapa por campo que
 * pintan los formularios.
 */
export class ErrorApi extends Error {
  estado: number;
  errores: ErroresPorCampo;
  /** La lista tal cual la manda la API, para enseñarla entera. */
  lista: ErrorDeLista[];
  /** Segundos que faltan para poder reintentar. Solo en un 429. */
  segundosDeEspera?: number;

  constructor(
    estado: number,
    detalle: string,
    errores: ErroresPorCampo = {},
    segundosDeEspera?: number,
    lista: ErrorDeLista[] = [],
  ) {
    super(detalle);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.errores = errores;
    this.lista = lista;
    this.segundosDeEspera = segundosDeEspera;
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
  /** Objeto (va como JSON) o `FormData` (va como multipart, para los archivos). */
  cuerpo?: unknown;
  /** Interno: evita que el reintento tras refrescar se reintente a su vez. */
  reintentar?: boolean;
}

function url(ruta: string): string {
  return ruta.startsWith('http') ? ruta : `${BASE}${ruta}`;
}

/**
 * Cuánto hay que esperar tras un 429.
 *
 * `Retry-After` es lo correcto, pero no es una cabecera que el navegador deje
 * leer entre orígenes salvo que la API la anuncie en `CORS_EXPOSE_HEADERS`. Por
 * eso, si no está, se saca del propio mensaje, que ya trae los segundos.
 */
function esperaDe(respuesta: Response, detalle: string): number | undefined {
  if (respuesta.status !== 429) return undefined;

  const cabecera = Number(respuesta.headers.get('Retry-After'));
  if (Number.isFinite(cabecera) && cabecera > 0) return Math.ceil(cabecera);

  const enElMensaje = detalle.match(/(\d+)\s*segundo/i);
  return enElMensaje ? Number(enElMensaje[1]) : undefined;
}

/** Ruta de campo al principio de un mensaje: `url: `, `lineas[0].valor: `. */
const RUTA_DE_CAMPO = /^([A-Za-z_]\w*(?:\[\d+\]|\.\w+)*): (.+)$/s;

/**
 * El mapa por campo a partir de la lista de la API.
 *
 * Cada error queda bajo su ruta completa y, además, bajo el campo de arriba
 * (`responsabilidades[0]` también en `responsabilidades`), que es el que tiene
 * un control en el formulario.
 */
function porCampo(lista: ErrorDeLista[]): ErroresPorCampo {
  const errores: ErroresPorCampo = {};
  for (const { mensaje } of lista) {
    const partes = RUTA_DE_CAMPO.exec(mensaje);
    if (!partes) continue;
    const [, ruta, texto] = partes;
    const raiz = ruta.split(/[.[]/)[0];
    for (const clave of new Set([ruta, raiz])) (errores[clave] ??= []).push(texto);
  }
  return errores;
}

async function cuerpoDeError(respuesta: Response): Promise<ErrorApi> {
  let detalle = `La API respondió ${respuesta.status}.`;
  let errores: ErroresPorCampo = {};
  let lista: ErrorDeLista[] = [];
  try {
    const datos = await respuesta.json();
    if (typeof datos?.detail === 'string') detalle = datos.detail;
    if (Array.isArray(datos?.errores)) {
      lista = (datos.errores as unknown[])
        .filter((e): e is ErrorDeLista => typeof (e as ErrorDeLista)?.mensaje === 'string')
        .map((e) => ({ codigo: String(e.codigo ?? ''), mensaje: e.mensaje }));
      errores = porCampo(lista);
    } else if (datos?.errores && typeof datos.errores === 'object') {
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
  return new ErrorApi(
    respuesta.status,
    detalle,
    errores,
    esperaDe(respuesta, detalle),
    lista,
  );
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

  // Un `FormData` viaja tal cual: el `Content-Type` lo pone el navegador, que es
  // el único que sabe qué frontera (`boundary`) va a usar. Ponerlo a mano deja
  // el cuerpo ilegible para el servidor.
  const multipart = cuerpo instanceof FormData;

  const respuesta = await fetch(url(ruta), {
    method: metodo,
    credentials: 'include',
    headers:
      cuerpo === undefined || multipart ? undefined : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : multipart ? cuerpo : JSON.stringify(cuerpo),
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
