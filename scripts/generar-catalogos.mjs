#!/usr/bin/env node
/**
 * Genera la sección «Catálogos DIAN» a partir de la API.
 *
 * Corre en TIEMPO DE COMPILACIÓN (`prebuild` y `predev`), igual que
 * `generar-referencia.mjs`: el sitio publicado es estático y nunca consulta la
 * API. Los catálogos son públicos (no piden credencial), así que basta con dos
 * rutas:
 *
 *   GET /api/catalogos/                    qué catálogos hay, de dónde salen y
 *                                          qué campos de la API los usan
 *   GET /api/catalogos/{nombre}/exportar/  el catálogo entero, sin paginar
 *
 * Escribe dos cosas:
 *
 *   src/generated/catalogos.json      índice y filas; de aquí leen la tabla de
 *                                     cada página y las descargas JSON y CSV
 *   src/content/docs/catalogos/*.mdx  una página por catálogo y el índice
 *
 * Como la referencia, sale de `PUBLIC_API_BASE` (producción si no se define), y
 * si la API no responde se usa la última copia descargada.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Igual que en `generar-referencia.mjs`: el `.env` hay que pedirlo a mano.
try {
  process.loadEnvFile(resolve(RAIZ, '.env'));
} catch {
  // sin `.env`: valores por defecto o lo que traiga el entorno
}

const API_PUBLICADA = 'https://api.rededoc.co';
const API = (process.env.PUBLIC_API_BASE?.trim() || API_PUBLICADA).replace(/\/+$/, '');
const CACHE = resolve(RAIZ, 'openapi/.cache/catalogos.json');
const DATOS = resolve(RAIZ, 'src/generated/catalogos.json');
const SALIDA = resolve(RAIZ, 'src/content/docs/catalogos');

// ---------------------------------------------------------------- utilidades

const log = (...args) => console.log('[catalogos]', ...args);

/**
 * Deja un texto de la API listo para MDX: fuera de los tramos entre acentos
 * graves, `<`, `{` y `}` se leerían como JSX.
 */
function textoMdx(texto) {
  if (!texto) return '';
  return String(texto)
    .split(/(`[^`]*`)/g)
    .map((tramo) =>
      tramo.startsWith('`')
        ? tramo
        : tramo.replace(/</g, '&lt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;'),
    )
    .join('');
}

function celda(texto) {
  return textoMdx(texto).replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
}

function yamlEscapado(texto) {
  return `"${String(texto).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** La descripción sin marcas, cortada para el `<meta name="description">`. */
function paraMeta(texto, maximo = 155) {
  const limpio = String(texto ?? '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  return `${limpio.slice(0, maximo - 1).replace(/\s+\S*$/, '')}…`;
}

const numero = (n) => n.toLocaleString('es-CO');

const fecha = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Bogota',
      })
    : '—';

// ------------------------------------------------------------------ descarga

async function json(url) {
  const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status} ${respuesta.statusText}`);
  return respuesta.json();
}

/**
 * Índice y filas de todos los catálogos. La URL de exportación se arma con
 * `API` y no con la `url_exportar` que devuelve el índice: detrás de un proxy
 * esa puede traer un host interno.
 */
async function descargar() {
  log(`descargando catálogos de ${API}`);
  const indice = await json(`${API}/api/catalogos/`);
  const filas = {};
  for (const catalogo of indice) {
    filas[catalogo.nombre] = await json(
      `${API}/api/catalogos/${encodeURIComponent(catalogo.nombre)}/exportar/`,
    );
  }
  return { api: API, descargado: new Date().toISOString(), indice, filas };
}

async function leerCatalogos() {
  try {
    const datos = await descargar();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, JSON.stringify(datos));
    return { datos, origen: API };
  } catch (error) {
    if (existsSync(CACHE)) {
      log(`aviso: falló la descarga (${error.message}); se usa la copia en caché.`);
      return { datos: JSON.parse(await readFile(CACHE, 'utf8')), origen: `${API} (caché)` };
    }
    throw new Error(`No se pudieron descargar los catálogos y no hay copia en caché: ${error.message}`);
  }
}

// ------------------------------------------------------------------- páginas

const VALOR = { id: 'el `id`', codigo: 'el `codigo`' };

function bloqueDeUsos(catalogo) {
  const usos = catalogo.usos ?? [];
  if (!usos.length) return '';
  const partes = [
    '## Dónde se usa',
    '',
    '| Ruta | Campo | Se envía |',
    '| --- | --- | --- |',
    ...usos.map(
      (uso) => `| \`${uso.ruta}\` | \`${uso.campo}\` | ${VALOR[uso.valor] ?? `\`${uso.valor}\``} |`,
    ),
  ];
  // Un mismo catálogo puede pedirse por `id` en una ruta y por `codigo` en
  // otra (el municipio del emisor frente al del adquiriente). Es justo el
  // error que no se ve hasta que la API responde 400.
  const valores = new Set(usos.map((uso) => uso.valor));
  if (valores.size > 1) {
    partes.push(
      '',
      ':::caution[Según la ruta, el `id` o el `codigo`]',
      'Este catálogo no se envía igual en todas partes: mira la última columna antes de',
      'mandar el valor.',
      ':::',
    );
  }
  return partes.join('\n');
}

function bloqueDeOrigen(catalogo) {
  const anexos = catalogo.anexos_tecnicos ?? [];
  const filas = [
    ['Lista DIAN', catalogo.lista_dian ? `\`${catalogo.lista_dian}\`` : '—'],
    [
      anexos.length > 1 ? 'Anexos técnicos' : 'Anexo técnico',
      anexos.length
        ? anexos
            .map((a) => `${celda(a.documento)} ${celda(a.version)} (${celda(a.resolucion)})`)
            .join('<br />')
        : '—',
    ],
    ['Registros', numero(catalogo.registros ?? 0)],
    ['Última modificación', fecha(catalogo.ultima_modificacion)],
  ];
  return [
    '## Origen',
    '',
    '| Dato | Valor |',
    '| --- | --- |',
    ...filas.map(([dato, valor]) => `| ${dato} | ${valor} |`),
  ].join('\n');
}

function paginaDeCatalogo(catalogo, orden) {
  const { nombre, titulo } = catalogo;
  return [
    '---',
    `title: ${yamlEscapado(titulo)}`,
    `description: ${yamlEscapado(paraMeta(`Catálogo DIAN de ${titulo.toLowerCase()}: ${catalogo.descripcion}`))}`,
    'sidebar:',
    `  order: ${orden}`,
    '---',
    '',
    "import TablaCatalogo from '../../../components/TablaCatalogo.astro';",
    '',
    textoMdx(catalogo.descripcion),
    '',
    bloqueDeUsos(catalogo),
    '',
    '## Valores',
    '',
    `<TablaCatalogo nombre=${yamlEscapado(nombre)} />`,
    '',
    '## Descargar',
    '',
    `- [\`${nombre}.json\`](/catalogos/${nombre}.json) y [\`${nombre}.csv\`](/catalogos/${nombre}.csv): el catálogo entero, tal como lo compiló este sitio.`,
    `- En vivo, sin credencial: \`GET ${API_PUBLICADA}/api/catalogos/${nombre}/exportar/\`.`,
    '',
    bloqueDeOrigen(catalogo),
    '',
    `{/* generado por scripts/generar-catalogos.mjs */}`,
    '',
  ].join('\n');
}

function paginaIndice(indice, datos) {
  const partes = [
    '---',
    'title: "Catálogos DIAN"',
    `description: ${yamlEscapado(
      'Las listas oficiales de la DIAN que usa la API de RedEDoc: tipos de identificación, ' +
        'responsabilidades fiscales, tributos, unidades de medida, municipios… Para consultar y descargar.',
    )}`,
    'sidebar:',
    '  order: 0',
    '  label: "Todos los catálogos"',
    '---',
    '',
    'Varios campos de la API no reciben texto libre sino un valor de una lista oficial de la',
    'DIAN: el tipo de identificación, el tributo, la unidad de medida, el municipio… Aquí',
    'están todas esas listas, con qué campos las usan y si esperan el `id` o el `codigo`.',
    '',
    'Cada una se puede descargar en JSON o CSV para cargarla en tu sistema, o consultar en',
    'vivo en la API: `/api/catalogos/` es público y no pide credencial.',
    '',
    '| Catálogo | Registros | Descargar |',
    '| --- | ---: | --- |',
    ...indice.map(
      (c) =>
        `| [${celda(c.titulo)}](/catalogos/${c.nombre}/) | ${numero(c.registros ?? 0)} | ` +
        `[JSON](/catalogos/${c.nombre}.json) · [CSV](/catalogos/${c.nombre}.csv) |`,
    ),
    '',
    '## El `id` o el `codigo`',
    '',
    'Cada fila tiene las dos cosas. El `codigo` es el de la DIAN. El `id` es el de RedEDoc:',
    'en cada página, la tabla «Dónde se usa» dice cuál de los dos espera cada campo.',
    '',
    ':::tip[El `id` es fijo]',
    'Cada código tiene un `id` asignado de una vez y para siempre, el mismo en todos los',
    'ambientes: el que ves aquí es el que acepta la API, en pruebas y en producción. Un código',
    'nuevo recibe un `id` nuevo; uno existente no cambia de `id`. En el tipo de identificación',
    'el `id` es el propio código: `13` cédula, `31` NIT.',
    ':::',
    '',
    '## En la API',
    '',
    '```bash',
    '# Qué catálogos hay, de qué lista y anexo salen y qué campos los usan',
    `curl ${API_PUBLICADA}/api/catalogos/`,
    '',
    '# Un catálogo entero, sin paginar',
    `curl ${API_PUBLICADA}/api/catalogos/municipio/exportar/`,
    '',
    '# Buscar por código o nombre',
    `curl "${API_PUBLICADA}/api/catalogos/municipio/?search=Medell"`,
    '```',
    '',
    '{/* generado por scripts/generar-catalogos.mjs */}',
    '',
  ];
  return partes.join('\n');
}

// ------------------------------------------------------------------ principal

async function principal() {
  const { datos, origen } = await leerCatalogos();
  if (!datos.indice?.length) throw new Error('La API no devolvió ningún catálogo.');

  await mkdir(dirname(DATOS), { recursive: true });
  await writeFile(DATOS, JSON.stringify(datos));

  await rm(SALIDA, { recursive: true, force: true });
  await mkdir(SALIDA, { recursive: true });
  await writeFile(resolve(SALIDA, 'index.mdx'), paginaIndice(datos.indice, datos));
  for (const [posicion, catalogo] of datos.indice.entries()) {
    await writeFile(
      resolve(SALIDA, `${catalogo.nombre}.mdx`),
      paginaDeCatalogo(catalogo, posicion + 1),
    );
  }

  log(`${datos.indice.length + 1} páginas escritas en src/content/docs/catalogos/ desde ${origen}`);
}

principal().catch((error) => {
  console.error(`[catalogos] ERROR: ${error.message}`);
  process.exit(1);
});
