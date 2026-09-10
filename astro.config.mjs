// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';

/**
 * Barra lateral de la referencia de la API. La escribe
 * `scripts/generar-referencia.mjs` (npm la corre en `predev` y `prebuild`) para
 * que las etiquetas conserven las tildes y el orden del esquema OpenAPI.
 */
const RUTA_SIDEBAR_API = new URL('./src/generated/sidebar-api.json', import.meta.url);
const sidebarApi = existsSync(RUTA_SIDEBAR_API)
  ? JSON.parse(readFileSync(RUTA_SIDEBAR_API, 'utf8'))
  : [];

// Sitio 100% estático: sin adaptador y sin SSR. La documentación se compila
// entera; el panel de `/app/` son cascarones que piden sus datos a la API desde
// el navegador, con la sesión en cookies que el navegador manda solo. Nada de
// esto necesita un servidor propio.
//
// `site` es el dominio publicado. De él salen las URLs canónicas de cada página
// y las del sitemap, que son absolutas por especificación. Se puede sobrescribir
// con `SITE_URL` para compilar una copia en otro dominio (un preproducción, por
// ejemplo) sin que el sitemap apunte al de producción.
const site = process.env.SITE_URL ?? 'https://rededoc.co';

// Rutas que no se indexan; esto las saca del sitemap, para no ofrecerle a
// Google lo que luego le negamos. El `noindex` de cada una va aparte:
//
//   /app/, /verificar-correo/, /restablecer-clave/  →  src/layouts/Panel.astro
//   /api/                                           →  scripts/generar-referencia.mjs
//
// La referencia de la API queda fuera del buscador a propósito: es material de
// consulta para quien ya está integrando. Se llega a ella por el menú del sitio.
const SIN_INDEXAR = ['/app/', '/verificar-correo/', '/restablecer-clave/', '/api/'];

export default defineConfig({
  site,
  build: { format: 'directory' },
  integrations: [
    react(),
    // Starlight trae esta misma integración y la añade sola, pero sin opciones.
    // Declararla aquí hace que Starlight respete la nuestra (comprueba si ya
    // está en la lista) y nos deja filtrar lo que no debe indexarse.
    sitemap({
      filter: (url) => {
        const { pathname } = new URL(url);
        return !SIN_INDEXAR.some((ruta) => pathname.startsWith(ruta));
      },
    }),
    starlight({
      title: 'RedEDoc',
      description:
        'Servicio gratuito de facturación electrónica DIAN para Colombia: ' +
        'factura de venta, notas crédito y débito, documento soporte y nómina electrónica.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es-CO' },
      },
      // Sin buscador: se quita la barra de la cabecera y deja de generarse el
      // índice de Pagefind en cada compilación.
      pagefind: false,
      // Roboto, la tipografía del manual de marca. Los pesos son los que el
      // manual nombra: Light 300 para textos secundarios, Regular 400 para
      // cuerpo, Medium 500 y Bold 700 para destacados, Black 900 para titulares.
      head: [
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap',
          },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      // El panel vive fuera de la colección `docs`, así que no aparece solo en
      // la navegación: se enlaza a mano.
      components: {
        SocialIcons: './src/components/EnlacePanel.astro',
        Footer: './src/components/PieDePagina.astro',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'El servicio',
          autogenerate: { directory: 'servicio' },
        },
        {
          label: 'Guías',
          autogenerate: { directory: 'guias' },
        },
        {
          label: 'Referencia de la API',
          items: sidebarApi,
        },
      ],
      pagination: true,
      credits: false,
    }),
  ],
});
