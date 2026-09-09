#!/usr/bin/env node
/**
 * Genera la referencia de la API a partir de un esquema OpenAPI.
 *
 * Corre en TIEMPO DE COMPILACIÓN (`prebuild` y `predev`): el sitio publicado es
 * estático y nunca consulta la API. Lee el esquema de `OPENAPI_SOURCE`, que
 * acepta una ruta local o una URL http(s), y escribe páginas Markdown en
 * `src/content/docs/api/` más el fragmento de barra lateral que consume
 * `astro.config.mjs`.
 *
 * Por defecto lee el esquema publicado del servicio. Para trabajar contra otro:
 *
 *   OPENAPI_SOURCE=http://localhost:8000/api/schema/?format=json npm run build
 *   OPENAPI_SOURCE=../nobelio/openapi.json npm run build
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ESQUEMA_PUBLICADO = 'https://api.rededoc.co/api/schema/?format=json';
const ORIGEN = process.env.OPENAPI_SOURCE?.trim() || ESQUEMA_PUBLICADO;
const EJEMPLO = resolve(RAIZ, 'openapi/ejemplo.json');
const CACHE = resolve(RAIZ, 'openapi/.cache/openapi.json');
const SALIDA = resolve(RAIZ, 'src/content/docs/api');
const SIDEBAR = resolve(RAIZ, 'src/generated/sidebar-api.json');

const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// ---------------------------------------------------------------- utilidades

const log = (...args) => console.log('[referencia]', ...args);

/** Quita tildes y deja un slug apto para URL y nombre de archivo. */
function slug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sin-nombre';
}

/** Escapa `<` fuera de los tramos entre acentos graves, para que Markdown no lo lea como HTML. */
function textoSeguro(texto) {
  if (!texto) return '';
  return String(texto)
    .split(/(`[^`]*`)/g)
    .map((tramo) => (tramo.startsWith('`') ? tramo : tramo.replace(/</g, '&lt;')))
    .join('');
}

/** Aplana el texto para que quepa en una celda de tabla. */
function celda(texto) {
  return textoSeguro(texto).replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
}

function yamlEscapado(texto) {
  return `"${String(texto).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ------------------------------------------------------------ lectura del esquema

async function leerEsquema() {
  const esUrl = /^https?:\/\//i.test(ORIGEN);
  if (!esUrl) {
    const ruta = resolve(RAIZ, ORIGEN);
    if (!existsSync(ruta)) {
      throw new Error(
        `No existe el esquema en ${ruta}. Ajusta OPENAPI_SOURCE (ver .env.example).`,
      );
    }
    log(`esquema local: ${ORIGEN}`);
    return { esquema: JSON.parse(await readFile(ruta, 'utf8')), origen: ruta };
  }

  log(`descargando esquema: ${ORIGEN}`);
  try {
    const respuesta = await fetch(ORIGEN, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} ${respuesta.statusText}`);
    const crudo = await respuesta.text();
    const esquema = JSON.parse(crudo);
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, crudo);
    return { esquema, origen: ORIGEN };
  } catch (error) {
    if (existsSync(CACHE)) {
      log(`aviso: falló la descarga (${error.message}); se usa la copia en caché.`);
      return { esquema: JSON.parse(await readFile(CACHE, 'utf8')), origen: `${ORIGEN} (caché)` };
    }
    throw new Error(`No se pudo descargar ${ORIGEN} y no hay copia en caché: ${error.message}`);
  }
}

// --------------------------------------------------------------- esquemas JSON

function resolverRef(esquema, nodo, vistos = new Set()) {
  let actual = nodo;
  while (actual && actual.$ref) {
    if (vistos.has(actual.$ref)) return {};
    vistos.add(actual.$ref);
    const partes = actual.$ref.replace(/^#\//, '').split('/');
    actual = partes.reduce((acc, parte) => acc?.[decodeURIComponent(parte)], esquema);
  }
  return actual ?? {};
}

function nombreDeRef(nodo) {
  return nodo?.$ref ? nodo.$ref.split('/').pop() : null;
}

/** Describe el tipo de un esquema en una línea legible. */
function tipoLegible(esquema, nodo) {
  const ref = nombreDeRef(nodo);
  const s = resolverRef(esquema, nodo);
  if (ref) return `\`${ref}\``;
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' · ');
  if (s.type === 'array') {
    const item = s.items?.$ref ? nombreDeRef(s.items) : resolverRef(esquema, s.items).type;
    return `\`array<${item ?? 'any'}>\``;
  }
  const base = s.type ?? (s.properties ? 'object' : 'any');
  return s.format ? `${base} (${s.format})` : base;
}

/**
 * Propiedades de un objeto que se muestran en un contexto dado: en una petición
 * no van las `readOnly` —las pone el servidor— y en una respuesta no van las
 * `writeOnly`, que solo se envían.
 */
function propiedadesDeContexto(esquema, nodo, contexto) {
  const s = resolverRef(esquema, nodo);
  return Object.entries(s.properties ?? {}).filter(([, prop]) => {
    const resuelta = resolverRef(esquema, prop);
    return contexto === 'peticion' ? !resuelta.readOnly : !resuelta.writeOnly;
  });
}

/** Filas `nombre · tipo · obligatorio · descripción` de las propiedades de un objeto. */
function filasDePropiedades(esquema, nodo, contexto) {
  const s = resolverRef(esquema, nodo);
  const obligatorias = new Set(s.required ?? []);
  return propiedadesDeContexto(esquema, nodo, contexto).map(([nombre, prop]) => {
    const resuelta = resolverRef(esquema, prop);
    const notas = [resuelta.description];
    if (resuelta.readOnly) notas.push('Solo lectura.');
    if (resuelta.nullable) notas.push('Admite `null`.');
    return {
      nombre,
      tipo: tipoLegible(esquema, prop),
      obligatorio: obligatorias.has(nombre) ? 'sí' : 'no',
      descripcion: notas.filter(Boolean).join(' '),
    };
  });
}

/** Valor de ejemplo a partir del esquema, para el cuerpo del `curl` y las respuestas. */
function ejemploDeEsquema(esquema, nodo, contexto, profundidad = 0) {
  const s = resolverRef(esquema, nodo);
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  if (profundidad > 6) return null;

  switch (s.type) {
    case 'array':
      return [ejemploDeEsquema(esquema, s.items ?? {}, contexto, profundidad + 1)];
    case 'integer':
      return s.minimum ?? 1;
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      if (s.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (s.format === 'date') return '2026-01-31';
      if (s.format === 'date-time') return '2026-01-31T10:00:00-05:00';
      if (s.format === 'email') return 'correo@ejemplo.co';
      if (s.format === 'decimal') return '0.00';
      if (s.format === 'password') return '••••••••';
      return 'texto';
    default:
      break;
  }

  if (s.properties) {
    const salida = {};
    for (const [nombre, prop] of propiedadesDeContexto(esquema, nodo, contexto)) {
      salida[nombre] = ejemploDeEsquema(esquema, prop, contexto, profundidad + 1);
    }
    return salida;
  }
  return null;
}

// ------------------------------------------------------------------ operaciones

function recogerOperaciones(esquema) {
  const operaciones = [];
  for (const [ruta, item] of Object.entries(esquema.paths ?? {})) {
    const comunes = item.parameters ?? [];
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (!op) continue;
      operaciones.push({
        ruta,
        metodo,
        op,
        parametros: [...comunes, ...(op.parameters ?? [])],
        etiqueta: op.tags?.[0] ?? 'General',
      });
    }
  }
  return operaciones;
}

function urlBase(esquema) {
  return (
    process.env.PUBLIC_API_BASE?.trim() ||
    esquema.servers?.[0]?.url ||
    'http://localhost:8000'
  ).replace(/\/+$/, '');
}

/** Requisitos de seguridad que aplican a una operación (los suyos o los del esquema). */
function requisitosDeSeguridad(esquema, op) {
  return op.security ?? esquema.security ?? [];
}

/**
 * Cómo viaja una credencial en el ejemplo, según su definición en
 * `components.securitySchemes`. Si la descripción del esquema muestra la
 * credencial literal —`Authorization: Api-Key <prefijo>.<secreto>`—, se usa esa:
 * es lo único que dice cómo se compone el valor. Si no, se deduce del tipo.
 */
function credencialDeEjemplo(nombre, def) {
  if (!def) return null;

  // El nombre de la cabecera viene de un esquema ajeno: se escapa antes de meterlo
  // en la expresión regular, para que un nombre raro no rompa la compilación.
  const literal = (cabecera) => {
    const patron = cabecera.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const encontrado = new RegExp(`\`\\s*${patron}\\s*:\\s*([^\`]+)\``).exec(def.description ?? '');
    return encontrado?.[1].trim() ?? null;
  };

  if (def.type === 'apiKey') {
    if (!def.name) return null;
    const valor = (def.in === 'header' && literal(def.name)) || `<${nombre.toLowerCase()}>`;
    return { en: def.in, nombre: def.name, valor };
  }

  // `http` y los flujos OAuth acaban todos en una cabecera Authorization.
  const tipo = def.type === 'http' ? (def.scheme ?? 'bearer').toLowerCase() : 'bearer';
  const marca = tipo.charAt(0).toUpperCase() + tipo.slice(1);
  const valor =
    literal('Authorization') ?? `${marca} <${tipo === 'basic' ? 'credenciales' : 'token'}>`;
  return { en: 'header', nombre: 'Authorization', valor };
}

/**
 * Credenciales del ejemplo. Cada entrada de `security` es una alternativa y sus
 * claves se exigen a la vez; para el `curl` basta con la primera que se sepa
 * representar. Sin requisitos no se manda ninguna.
 */
function credencialesDeEjemplo(esquema, op) {
  const definiciones = esquema.components?.securitySchemes ?? {};
  for (const alternativa of requisitosDeSeguridad(esquema, op)) {
    const credenciales = Object.keys(alternativa)
      .map((nombre) => credencialDeEjemplo(nombre, definiciones[nombre]))
      .filter(Boolean);
    if (credenciales.length) return credenciales;
  }
  return [];
}

function ejemploCurl(esquema, { ruta, metodo, op, parametros }) {
  const base = urlBase(esquema);
  const rutaConcreta = ruta.replace(/\{([^}]+)\}/g, '<$1>');
  const credenciales = credencialesDeEjemplo(esquema, op);
  const consulta = [
    ...parametros
      .map((p) => resolverRef(esquema, p))
      .filter((p) => p.in === 'query' && p.required)
      .map((p) => `${p.name}=<${p.name}>`),
    ...credenciales.filter((c) => c.en === 'query').map((c) => `${c.nombre}=${c.valor}`),
  ].join('&');
  const url = `${base}${rutaConcreta}${consulta ? `?${consulta}` : ''}`;

  const lineas = [];
  const verbo = metodo.toUpperCase();
  lineas.push(`curl${verbo === 'GET' ? '' : ` -X ${verbo}`} "${url}" \\`);
  for (const credencial of credenciales) {
    if (credencial.en === 'header') lineas.push(`  -H "${credencial.nombre}: ${credencial.valor}" \\`);
    if (credencial.en === 'cookie') lineas.push(`  -b "${credencial.nombre}=${credencial.valor}" \\`);
  }

  const cuerpo = op.requestBody?.content?.['application/json']?.schema;
  if (cuerpo) {
    lineas.push(`  -H "Content-Type: application/json" \\`);
    const json = JSON.stringify(ejemploDeEsquema(esquema, cuerpo, 'peticion'), null, 2)
      .split('\n')
      .join('\n  ');
    lineas.push(`  -d '${json}'`);
  } else {
    lineas[lineas.length - 1] = lineas.at(-1).replace(/ \\$/, '');
  }
  return lineas.join('\n');
}

function tablaDeParametros(esquema, parametros) {
  const resueltos = parametros.map((p) => resolverRef(esquema, p));
  if (!resueltos.length) return '';
  const filas = resueltos.map(
    (p) =>
      `| \`${p.name}\` | ${p.in} | ${tipoLegible(esquema, p.schema ?? {})} | ${p.required ? 'sí' : 'no'} | ${celda(p.description)} |`,
  );
  return [
    '## Parámetros',
    '',
    '| Nombre | En | Tipo | Obligatorio | Descripción |',
    '| --- | --- | --- | --- | --- |',
    ...filas,
    '',
  ].join('\n');
}

function tablaDePropiedades(esquema, nodo, titulo, { obligatorio = true, contexto } = {}) {
  const filas = filasDePropiedades(esquema, nodo, contexto);
  if (!filas.length) return '';
  const cabecera = obligatorio
    ? ['| Campo | Tipo | Obligatorio | Descripción |', '| --- | --- | --- | --- |']
    : ['| Campo | Tipo | Descripción |', '| --- | --- | --- |'];
  return [
    titulo,
    '',
    ...cabecera,
    ...filas.map((f) =>
      obligatorio
        ? `| \`${f.nombre}\` | ${f.tipo} | ${f.obligatorio} | ${celda(f.descripcion)} |`
        : `| \`${f.nombre}\` | ${f.tipo} | ${celda(f.descripcion)} |`,
    ),
  ].join('\n');
}

function bloqueDeCuerpo(esquema, op) {
  const contenido = op.requestBody?.content;
  if (!contenido) return '';
  const tipoMedia = contenido['application/json'] ? 'application/json' : Object.keys(contenido)[0];
  const nodo = contenido[tipoMedia]?.schema;
  const partes = [`## Cuerpo de la petición`, ''];
  partes.push(
    `Tipo de contenido: \`${tipoMedia}\`${op.requestBody.required ? ' · obligatorio' : ''}.`,
    '',
  );
  if (op.requestBody.description) partes.push(textoSeguro(op.requestBody.description), '');
  if (nodo) {
    const tabla = tablaDePropiedades(esquema, nodo, '### Campos', { contexto: 'peticion' });
    if (tabla) partes.push(tabla);
  }
  return partes.join('\n');
}

function bloqueDeRespuestas(esquema, op) {
  const respuestas = op.responses ?? {};
  const codigos = Object.keys(respuestas);
  if (!codigos.length) return '';

  const partes = ['## Respuestas', ''];
  partes.push('| Código | Descripción |', '| --- | --- |');
  for (const codigo of codigos) {
    const r = resolverRef(esquema, respuestas[codigo]);
    partes.push(`| \`${codigo}\` | ${celda(r.description)} |`);
  }
  partes.push('');

  for (const codigo of codigos) {
    const r = resolverRef(esquema, respuestas[codigo]);
    const nodo = r.content?.['application/json']?.schema;
    if (!nodo) continue;
    const tabla = tablaDePropiedades(esquema, nodo, `### \`${codigo}\` — cuerpo`, {
      obligatorio: false,
      contexto: 'respuesta',
    });
    if (tabla) partes.push(tabla, '');
    const ejemplo = ejemploDeEsquema(esquema, nodo, 'respuesta');
    if (ejemplo && typeof ejemplo === 'object') {
      partes.push('```json', JSON.stringify(ejemplo, null, 2), '```', '');
    }
  }
  return partes.join('\n');
}

function bloqueDeSeguridad(esquema, op) {
  const requisitos = requisitosDeSeguridad(esquema, op);
  if (!requisitos.length) {
    return ['## Autenticación', '', 'No requiere credencial.', ''].join('\n');
  }
  const definiciones = esquema.components?.securitySchemes ?? {};
  const nombres = [...new Set(requisitos.flatMap((r) => Object.keys(r)))];
  const lineas = ['## Autenticación', ''];
  lineas.push('Cualquiera de estas credenciales:', '');
  for (const nombre of nombres) {
    const def = definiciones[nombre] ?? {};
    lineas.push(`- **${nombre}** — ${textoSeguro(def.description) || `esquema \`${def.type}\`.`}`);
  }
  lineas.push('');
  return lineas.join('\n');
}

function paginaDeOperacion(esquema, operacion, orden, provisional) {
  const { ruta, metodo, op, parametros } = operacion;
  const titulo = op.summary || `${metodo.toUpperCase()} ${ruta}`;

  const frontmatter = [
    '---',
    `title: ${yamlEscapado(titulo)}`,
    op.description ? `description: ${yamlEscapado(resumen(op.description))}` : null,
    'sidebar:',
    `  order: ${orden}`,
    op.deprecated ? '  badge:\n    text: obsoleto\n    variant: caution' : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const bloques = [
    frontmatter,
    avisoProvisional(provisional),
    `<p><span class="metodo-http" data-metodo="${metodo}">${metodo.toUpperCase()}</span> ` +
      `<span class="ruta-endpoint">${ruta}</span></p>`,
    op.description ? textoSeguro(op.description) : '',
    op.operationId ? `**operationId:** \`${op.operationId}\`` : '',
    bloqueDeSeguridad(esquema, op),
    tablaDeParametros(esquema, parametros),
    bloqueDeCuerpo(esquema, op),
    ['## Ejemplo', '', '```bash', ejemploCurl(esquema, operacion), '```'].join('\n'),
    bloqueDeRespuestas(esquema, op),
  ];

  return bloques.map((b) => b.trim()).filter(Boolean).join('\n\n');
}

/** Primera frase de una descripción, recortada para el frontmatter. */
function resumen(texto) {
  const primera = String(texto).split(/\r?\n/)[0].trim();
  if (primera.length <= 160) return primera;
  const corte = primera.slice(0, 160);
  return `${corte.slice(0, corte.lastIndexOf(' '))}…`;
}

function avisoProvisional(provisional) {
  if (!provisional) return '';
  return [
    ':::caution[Esquema provisional]',
    'Esta página se generó con el esquema de ejemplo del repositorio, no con el de RedEDoc.',
    'Las rutas, los campos y las respuestas van a cambiar cuando se conecte el esquema real.',
    ':::',
    '',
  ].join('\n');
}

function paginaIndice(esquema, porEtiqueta, provisional, origen) {
  const info = esquema.info ?? {};
  const partes = [
    '---',
    'title: "Referencia de la API"',
    'description: "Endpoints de RedEDoc generados a partir de su esquema OpenAPI."',
    'sidebar:',
    '  order: 0',
    '  label: "Vista general"',
    '---',
    '',
    avisoProvisional(provisional),
    'Esta referencia se genera en tiempo de compilación a partir del esquema OpenAPI del',
    'servicio. No se escribe a mano: para corregir algo de esta sección hay que corregirlo',
    'en el esquema.',
    '',
  ].filter(Boolean);

  if (info.description) partes.push(textoSeguro(info.description), '');

  partes.push(
    '## Versión del esquema',
    '',
    `| Dato | Valor |`,
    `| --- | --- |`,
    `| Título | ${celda(info.title ?? '—')} |`,
    `| Versión | \`${info.version ?? '—'}\` |`,
    `| OpenAPI | \`${esquema.openapi ?? '—'}\` |`,
    `| Generada | ${new Date().toISOString().slice(0, 10)} |`,
    '',
  );

  if (esquema.servers?.length) {
    partes.push('## Servidores', '');
    for (const servidor of esquema.servers) {
      partes.push(`- \`${servidor.url}\`${servidor.description ? ` — ${textoSeguro(servidor.description)}` : ''}`);
    }
    partes.push('');
  }

  const definiciones = esquema.components?.securitySchemes ?? {};
  if (Object.keys(definiciones).length) {
    partes.push('## Credenciales', '');
    for (const [nombre, def] of Object.entries(definiciones)) {
      partes.push(`- **${nombre}** — ${textoSeguro(def.description) || `esquema \`${def.type}\`.`}`);
    }
    partes.push('');
  }

  partes.push('## Operaciones', '');
  for (const [etiqueta, grupo] of porEtiqueta) {
    partes.push(`### ${textoSeguro(etiqueta)}`, '');
    const descripcion = esquema.tags?.find((t) => t.name === etiqueta)?.description;
    if (descripcion) partes.push(textoSeguro(descripcion), '');
    for (const item of grupo) {
      partes.push(
        `- [\`${item.metodo.toUpperCase()} ${item.ruta}\`](/api/${item.dirSlug}/${item.slug}/) — ${celda(item.op.summary ?? '')}`,
      );
    }
    partes.push('');
  }

  partes.push(`<!-- generado por scripts/generar-referencia.mjs desde ${origen} -->`);
  return partes.join('\n');
}

// ------------------------------------------------------------------- principal

async function principal() {
  const { esquema, origen } = await leerEsquema();
  const rutaEjemplo = !/^https?:\/\//i.test(ORIGEN) && resolve(RAIZ, ORIGEN) === EJEMPLO;
  const provisional = Boolean(esquema['x-neon-provisional']) || rutaEjemplo;
  if (provisional) log('aviso: el esquema está marcado como PROVISIONAL.');

  const operaciones = recogerOperaciones(esquema);
  if (!operaciones.length) throw new Error('El esquema no declara ninguna operación.');

  // Orden de las etiquetas: el del esquema primero, el resto alfabético.
  const ordenEtiquetas = (esquema.tags ?? []).map((t) => t.name);
  const etiquetas = [...new Set(operaciones.map((o) => o.etiqueta))].sort((a, b) => {
    const ia = ordenEtiquetas.indexOf(a);
    const ib = ordenEtiquetas.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'es');
  });

  const usados = new Set();
  const porEtiqueta = etiquetas.map((etiqueta) => [
    etiqueta,
    operaciones
      .filter((o) => o.etiqueta === etiqueta)
      .map((o) => {
        const dirSlug = slug(etiqueta);
        let base = slug(o.op.operationId || `${o.metodo}-${o.ruta}`);
        let candidato = `${dirSlug}/${base}`;
        let n = 2;
        while (usados.has(candidato)) candidato = `${dirSlug}/${base}-${n++}`;
        usados.add(candidato);
        return { ...o, dirSlug, slug: candidato.split('/')[1] };
      }),
  ]);

  await rm(SALIDA, { recursive: true, force: true });
  await mkdir(SALIDA, { recursive: true });

  let escritas = 0;
  for (const [, grupo] of porEtiqueta) {
    for (const [indice, item] of grupo.entries()) {
      const destino = resolve(SALIDA, item.dirSlug, `${item.slug}.md`);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, `${paginaDeOperacion(esquema, item, indice + 1, provisional)}\n`);
      escritas += 1;
    }
  }

  await writeFile(
    resolve(SALIDA, 'index.md'),
    `${paginaIndice(esquema, porEtiqueta, provisional, origen)}\n`,
  );

  // Barra lateral con las etiquetas tal cual las escribe el esquema (con tildes).
  const sidebar = [
    { label: 'Vista general', link: '/api/' },
    ...porEtiqueta.map(([etiqueta, grupo]) => ({
      label: etiqueta,
      collapsed: true,
      items: grupo.map((item) => ({
        label: item.op.summary || `${item.metodo.toUpperCase()} ${item.ruta}`,
        link: `/api/${item.dirSlug}/${item.slug}/`,
      })),
    })),
  ];
  await mkdir(dirname(SIDEBAR), { recursive: true });
  await writeFile(SIDEBAR, `${JSON.stringify(sidebar, null, 2)}\n`);

  log(`${escritas + 1} páginas escritas en src/content/docs/api/ desde ${origen}`);
}

principal().catch((error) => {
  console.error(`[referencia] ERROR: ${error.message}`);
  process.exit(1);
});
