/**
 * Los catálogos tal como los descargó `scripts/generar-catalogos.mjs`.
 *
 * Solo se usa al compilar (la tabla de cada página y las descargas JSON y CSV);
 * el panel de `/app/` sigue pidiéndolos en vivo con `catalogos.ts`. Se lee del
 * disco y no con `import` para que `astro check` no falle en un clon recién
 * hecho, donde el archivo todavía no existe.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CatalogoGenerado {
  nombre: string;
  titulo: string;
  descripcion: string;
  registros: number;
}

export type Fila = Record<string, string | number | boolean | null>;

interface Datos {
  indice: CatalogoGenerado[];
  filas: Record<string, Fila[]>;
}

let datos: Datos | undefined;

export function catalogosGenerados(): Datos {
  datos ??= JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/generated/catalogos.json'), 'utf8'),
  ) as Datos;
  return datos;
}

/** Rutas estáticas de las descargas: una por catálogo. */
export function rutasDeCatalogos() {
  return catalogosGenerados().indice.map(({ nombre }) => ({ params: { nombre } }));
}

export function filasDe(nombre: string): Fila[] {
  return catalogosGenerados().filas[nombre] ?? [];
}

/**
 * Columnas de un catálogo, en el orden en que llegan. `activo` solo se enseña
 * si alguna fila está inactiva: con todas activas es una columna de «sí».
 */
export function columnasDe(filas: Fila[]): string[] {
  const columnas = [...new Set(filas.flatMap((fila) => Object.keys(fila)))];
  const hayInactivas = filas.some((fila) => fila.activo === false);
  return hayInactivas ? columnas : columnas.filter((columna) => columna !== 'activo');
}
