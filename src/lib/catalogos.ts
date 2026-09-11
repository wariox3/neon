/**
 * Catálogos DIAN para los desplegables del formulario de emisor.
 *
 * Son de solo lectura y públicos (`AllowAny` en la API), así que se pueden
 * cargar antes de tener sesión. Se cachean en memoria porque el formulario los
 * pide varias veces y no cambian durante una visita.
 *
 * Hay dos formas de usarlos, y la elige el tamaño del catálogo. La API pagina de
 * diez en diez y no admite `page_size`, así que traerse entero uno grande
 * costaría cien peticiones: los municipios (más de mil) y los países se resuelven
 * **buscando**, no desplegando.
 */
import { type Pagina, api } from './api';

export interface Item {
  id: number;
  codigo: string;
  nombre: string;
  activo?: boolean;
}

export interface Municipio extends Item {
  departamento: number;
  departamento_codigo: string;
}

/** Tope de páginas de `catalogo()`. Ver el comentario de arriba. */
const MAXIMO_PAGINAS = 8;

const cache = new Map<string, Promise<Item[]>>();

async function todas(nombre: string): Promise<Item[]> {
  const items: Item[] = [];
  let siguiente: string | null = `/api/catalogos/${nombre}/`;
  for (let pagina = 0; siguiente && pagina < MAXIMO_PAGINAS; pagina += 1) {
    const respuesta: Pagina<Item> = await api<Pagina<Item>>(siguiente);
    items.push(...respuesta.results);
    siguiente = respuesta.next;
  }
  return items.filter((item) => item.activo !== false);
}

/** Un catálogo corto, entero, para pintar un `<select>`. */
export function catalogo(nombre: string): Promise<Item[]> {
  let pendiente = cache.get(nombre);
  if (!pendiente) {
    pendiente = todas(nombre).catch((error) => {
      // Un fallo no puede quedarse cacheado: la siguiente pantalla volvería a
      // fallar sin haberlo intentado siquiera.
      cache.delete(nombre);
      throw error;
    });
    cache.set(nombre, pendiente);
  }
  return pendiente;
}

/**
 * Busca en un catálogo grande por código o nombre.
 *
 * Devuelve solo la primera página: es un autocompletado, no un listado. Quien
 * no encuentre lo que busca escribe un poco más.
 */
export async function buscar<T extends Item = Item>(
  nombre: string,
  texto: string,
): Promise<T[]> {
  const consulta = texto.trim();
  if (!consulta) return [];
  const pagina = await api<Pagina<T>>(
    `/api/catalogos/${nombre}/?search=${encodeURIComponent(consulta)}`,
  );
  return pagina.results;
}

/** Busca un elemento por su código exacto, para rellenar lo que ya está guardado. */
export async function porCodigo<T extends Item = Item>(
  nombre: string,
  codigo: string,
): Promise<T | undefined> {
  if (!codigo) return undefined;
  const encontrados = await buscar<T>(nombre, codigo);
  return encontrados.find((item) => item.codigo === codigo);
}

// Catálogos cortos: se despliegan enteros.
export const TIPO_IDENTIFICACION = 'tipo-identificacion';
export const TIPO_ORGANIZACION = 'tipo-organizacion';
export const RESPONSABILIDAD_FISCAL = 'responsabilidad-fiscal';
export const DEPARTAMENTO = 'departamento';
export const TIPO_FACTURA = 'tipo-factura';

// Catálogos grandes: se buscan.
export const PAIS = 'pais';
export const MUNICIPIO = 'municipio';
