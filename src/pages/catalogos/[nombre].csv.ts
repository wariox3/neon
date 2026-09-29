/**
 * Descarga de un catálogo en CSV, con todas las columnas del JSON.
 *
 * Separado por comas y con BOM: sin él, Excel abre el UTF-8 como Latin-1 y
 * destroza las tildes de los nombres.
 */
import type { APIRoute } from 'astro';

import { type Fila, filasDe, rutasDeCatalogos } from '../../lib/catalogos-generados';

export const getStaticPaths = rutasDeCatalogos;

/** RFC 4180: entre comillas si lleva coma, comillas o salto de línea. */
function campo(valor: Fila[string]): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export const GET: APIRoute = ({ params }) => {
  const filas = filasDe(params.nombre!);
  const columnas = [...new Set(filas.flatMap((fila) => Object.keys(fila)))];
  const lineas = [
    columnas.join(','),
    ...filas.map((fila) => columnas.map((columna) => campo(fila[columna])).join(',')),
  ];
  return new Response(`﻿${lineas.join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
