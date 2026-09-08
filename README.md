# neon

Sitio público de **RedEDoc**, el servicio gratuito de facturación electrónica DIAN para
Colombia: la cara con la que la gente lo descubre y aprende a usarlo.

Son tres cosas y nada más:

1. **Información del servicio** — qué es, para quién y qué resuelve.
2. **Documentación en prosa** — guías: empezar, autenticación, habilitación ante la DIAN,
   flujo de emisión y tipos de documento.
3. **Referencia de la API** — generada desde un `openapi.json`, nunca escrita a mano.

## Qué no es

No lleva registro, ni inicio de sesión, ni panel, ni sesión, ni estado, ni llamadas a la
API en tiempo de ejecución. Todo eso vive en otro proyecto. El resultado de `npm run build`
son archivos estáticos que se pueden servir desde cualquier CDN o Pages sin backend.

## Stack

- [Astro](https://astro.build) con TypeScript, salida 100 % estática.
- [Starlight](https://starlight.astro.build) para la navegación, el buscador y el tema.
- Sin framework de aplicaciones. El único JavaScript que llega al navegador es el que
  Starlight necesita (buscador, tabla de contenidos, cambio de tema).

## Desarrollo

Requiere Node 20.3+ (o 18.20.8+, o 22+).

```bash
npm install
npm run dev      # http://localhost:4321
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Genera la referencia y levanta el servidor de desarrollo. |
| `npm run build` | Genera la referencia y compila el sitio en `dist/`. |
| `npm run preview` | Sirve `dist/` como quedaría publicado. |
| `npm run referencia` | Solo regenera la referencia de la API. |
| `npm run check` | Diagnóstico de TypeScript y de los archivos Astro. |

`referencia` corre solo: npm la ejecuta en `predev` y `prebuild`.

## Compilación y publicación

```bash
npm run build     # → dist/
```

`dist/` es un sitio estático completo. Para publicarlo basta con servir esa carpeta:
Cloudflare Pages, Netlify, Vercel, GitHub Pages o cualquier CDN, todos en su capa gratuita.
El comando de compilación es `npm run build` y el directorio de salida es `dist`.

> **TODO:** fijar `site` en `astro.config.mjs` con el dominio definitivo. Sin eso Astro no
> genera el sitemap y las URLs canónicas quedan relativas.

## La referencia de la API

Las páginas de `/api/` **se generan en tiempo de compilación** con
`scripts/generar-referencia.mjs`, que lee un esquema OpenAPI y escribe Markdown en
`src/content/docs/api/`, más el fragmento de barra lateral `src/generated/sidebar-api.json`
que consume `astro.config.mjs`.

Las dos rutas de salida están en `.gitignore`: son artefactos de compilación. Lo que se
versiona es el esquema y el script.

### De dónde sale el esquema

De la variable de entorno `OPENAPI_SOURCE`, que acepta **una ruta local o una URL
`http(s)`**. Por defecto apunta al esquema de ejemplo del repositorio:

```bash
OPENAPI_SOURCE=./openapi/ejemplo.json     # por defecto
```

### Estado actual: esquema provisional

`openapi/ejemplo.json` es un esquema **escrito a mano y provisional**. No describe la API
real ni está completo: recoge unas pocas operaciones representativas para que el pipeline
se pueda montar y revisar antes de que el backend exponga su esquema. Está marcado con
`"x-neon-provisional": true`, y por eso cada página generada muestra un aviso.

### Cómo se conecta el esquema real

RedEDoc expondrá su esquema con [drf-spectacular](https://drf-spectacular.readthedocs.io).
Cuando exista, basta con apuntar `OPENAPI_SOURCE` a él:

```bash
# Desde un archivo, p. ej. generado con `manage.py spectacular --file openapi.json`
OPENAPI_SOURCE=../nobelio/openapi.json npm run build

# O directamente desde el servicio
OPENAPI_SOURCE=https://api.ejemplo.co/api/schema/?format=json npm run build
```

En el proveedor de hosting se define la misma variable en la configuración de compilación.
Copiar `.env.example` a `.env` sirve para el desarrollo local.

Cuando el esquema real llegue:

1. Apunta `OPENAPI_SOURCE` al esquema de RedEDoc.
2. Comprueba que el aviso de «esquema provisional» desaparece de las páginas generadas.
3. Borra `openapi/ejemplo.json` — o déjalo solo como referencia del formato.
4. Revisa las guías: los ejemplos de `curl` están escritos a mano y pueden haber quedado
   desfasados respecto al esquema.

### Detalles del generador

- Si `OPENAPI_SOURCE` es una URL, el esquema se descarga y se guarda en
  `openapi/.cache/openapi.json`. Si una compilación posterior no logra descargarlo, usa esa
  copia y lo avisa; si no hay copia, falla en vez de publicar una referencia vacía.
- Las operaciones se agrupan por su primera etiqueta (`tags`), respetando el orden en que
  el esquema declara las etiquetas.
- Cada operación es una página con su método y ruta, autenticación, parámetros, cuerpo,
  un ejemplo de `curl` y sus respuestas.
- `PUBLIC_API_BASE` permite fijar la URL base de los ejemplos; si no, se usa el primer
  `servers[]` del esquema.

## Estructura

```
neon/
├── astro.config.mjs        Configuración de Astro y Starlight
├── openapi/
│   ├── ejemplo.json        Esquema PROVISIONAL (se reemplaza por el real)
│   └── .cache/             Esquema descargado, si OPENAPI_SOURCE es una URL (ignorado)
├── scripts/
│   └── generar-referencia.mjs   Esquema OpenAPI → páginas Markdown
├── public/                 Archivos servidos tal cual
└── src/
    ├── content/docs/
    │   ├── index.mdx       Portada
    │   ├── servicio/       Información del servicio
    │   ├── guias/          Documentación en prosa
    │   └── api/            Referencia GENERADA (ignorada por git)
    ├── generated/          Barra lateral de la referencia (ignorada por git)
    └── styles/custom.css   Paleta y estilos propios
```

## Sobre el contenido

- Todo en español, para público colombiano.
- El material de origen es el README del proyecto RedEDoc. **No se inventan hechos**: no
  hay números de resolución, artículos, plazos ni afirmaciones sobre la DIAN que no vengan
  de ahí. Lo que falta queda como un `TODO` visible en la página, no relleno.
- El servicio es gratuito pero *best-effort*: el sitio no promete disponibilidad, soporte
  ni garantías, y eso no debería cambiar sin una decisión explícita.

### TODO pendientes en el contenido

- URL del servicio publicado (los ejemplos usan `http://localhost:8000`).
- Cómo se solicita una cuenta y una llave de API: hoy las crea el equipo por consola.
- Canal de contacto.
- Topes de peticiones efectivos de la instancia publicada.
- Documento equivalente P.O.S.: su XML está validado contra el XSD oficial, pero no forma
  parte del flujo de emisión de la API.
- Payload de nómina electrónica.
