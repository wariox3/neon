/**
 * Descarga de un catálogo en JSON: las filas tal como las devuelve
 * `/api/catalogos/{nombre}/exportar/`, congeladas al compilar.
 */
import type { APIRoute } from 'astro';

import { filasDe, rutasDeCatalogos } from '../../lib/catalogos-generados';

export const getStaticPaths = rutasDeCatalogos;

export const GET: APIRoute = ({ params }) =>
  new Response(`${JSON.stringify(filasDe(params.nombre!), null, 2)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
