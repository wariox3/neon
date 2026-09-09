# neon

Sitio público de **RedEDoc**, el servicio gratuito de facturación electrónica DIAN para
Colombia: la cara con la que la gente lo descubre y aprende a usarlo.

Son cuatro cosas:

1. **Información del servicio** — qué es, para quién y qué resuelve.
2. **Documentación en prosa** — guías: empezar, autenticación, habilitación ante la DIAN,
   flujo de emisión y tipos de documento.
3. **Referencia de la API** — generada desde un `openapi.json`, nunca escrita a mano.
4. **El panel** (`/app/`) — registrarse, gestionar las llaves de API y dar de alta y
   mantener los emisores, contra la API de nobelio.

## Cómo funciona el panel sin dejar de ser estático

El sitio **no tiene servidor propio**: `npm run build` sigue produciendo archivos que se
sirven desde cualquier CDN o Pages. Las páginas de `/app/` son cascarones vacíos que montan
una isla de React y piden sus datos a la API desde el navegador.

La sesión son cookies `httpOnly` que emite nobelio y que el navegador manda solo, así que
no hay ningún token que guardar aquí ni nada que validar en el servidor. Dos consecuencias
que conviene tener presentes:

- **El panel y la API tienen que compartir dominio registrable** (`rededoc.co` y
  `api.rededoc.co`): las cookies son `SameSite=Lax`. Y nobelio tiene que permitir el origen
  del sitio con `CORS_ALLOWED_ORIGINS` y `CORS_ALLOW_CREDENTIALS=True`.
- **Aquí no hay contenido protegido**, ni puede haberlo: todo lo que se ve en el panel llega
  de la API con la sesión de quien mira. Lo que no se puede ver, la API no lo entrega.

`/verificar-correo` es el aterrizaje del enlace de confirmación del registro, y vive en la
raíz porque es la ruta que nobelio trae en `URL_VERIFICACION_CORREO`.

## Qué no es

No es un software contable ni sustituye al ERP: el panel da de alta y mantiene emisores,
pero la habilitación ante la DIAN (certificado, software, resoluciones) y la emisión de
documentos siguen haciéndose por la API.

## Stack

- [Astro](https://astro.build) con TypeScript, salida 100 % estática.
- [Starlight](https://starlight.astro.build) para la navegación y el tema. Sin buscador:
  se desactiva con `pagefind: false`.
- Sin framework de aplicaciones. El único JavaScript que llega al navegador es el que
  Starlight necesita (tabla de contenidos, cambio de tema) y las islas de React del panel.

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

En producción el sitio va en `rededoc.co` y la API en `api.rededoc.co`, servidos con nginx
desde un Ubuntu Server. El paso a paso —Node, nginx, HTTPS, variables de entorno y el
script de actualización— está en [DEPLOY.md](DEPLOY.md).

> **TODO:** fijar `site` en `astro.config.mjs` con el dominio definitivo. Sin eso Astro no
> genera el sitemap y las URLs canónicas quedan relativas.

## La referencia de la API

Las páginas de `/api/` **se generan en tiempo de compilación** con
`scripts/generar-referencia.mjs`, que lee un esquema OpenAPI y escribe Markdown en
`src/content/docs/api/`, más el fragmento de barra lateral `src/generated/sidebar-api.json`
que consume `astro.config.mjs`.

Las dos rutas de salida están en `.gitignore`: son artefactos de compilación, igual que el
esquema descargado. Lo que se versiona es el script.

### De dónde sale el esquema

Del **esquema publicado del servicio**, que el generador lee por defecto:

```
https://api.rededoc.co/api/schema/?format=json
```

Lo expone el backend con [drf-spectacular](https://drf-spectacular.readthedocs.io). No hay
que configurar nada: `npm run build` lo descarga y regenera las páginas de `/api/`, así que
la referencia nunca se desfasa respecto a la API.

Para trabajar contra otro esquema está `OPENAPI_SOURCE`, que acepta **una ruta local o una
URL `http(s)`**:

```bash
OPENAPI_SOURCE=http://localhost:8000/api/schema/?format=json npm run build
OPENAPI_SOURCE=../nobelio/openapi.json npm run build
```

### La compilación depende de que la API responda

Es la contrapartida de leer el esquema por URL. El esquema descargado se cachea en
`openapi/.cache/`; si una compilación posterior no logra descargarlo, usa esa copia y lo
avisa. Pero esa carpeta está en `.gitignore`, así que **en un clon nuevo, sin caché previa,
un fallo de descarga rompe el build** en vez de publicar una referencia vacía. Es
deliberado.

En el servidor no suele morder, porque `/opt/neon` es un clon persistente y la caché
sobrevive entre despliegues. En un CI que parte de cero, sí. Para desacoplarlo: genera el
archivo con `manage.py spectacular --file openapi.json`, versiónalo y apunta
`OPENAPI_SOURCE` a esa ruta.

### Cuando la API cambie

Las páginas de `/api/` se regeneran solas, pero **las guías no**: los ejemplos de `curl` de
`empezar`, `autenticacion`, `flujo-emision` y `habilitacion-dian` están escritos a mano. Si
una ruta o un campo cambia, ahí no avisa nadie.

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
│   └── .cache/             Esquema descargado del servicio (ignorado por git)
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
  ni garantías, y eso no debería cambiar sin una decisión explícita. El descargo vive en
  [Alcance y límites](src/content/docs/servicio/alcance-y-limites.md), no en la portada:
  ahí está enlazado desde la barra lateral y desde «Para quién es». Si alguna vez se
  reescribe esa página, el descargo tiene que seguir en algún sitio visible.

### TODO pendientes en el contenido

- URL del servicio publicado (los ejemplos usan `http://localhost:8000`).
- Cómo se solicita una cuenta y una llave de API: hoy las crea el equipo por consola.
- Topes de peticiones efectivos de la instancia publicada.
- Documento equivalente P.O.S.: su XML está validado contra el XSD oficial, pero no forma
  parte del flujo de emisión de la API.
- Payload de nómina electrónica.
