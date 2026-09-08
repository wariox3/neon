// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
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
// TODO: fijar `site` con el dominio definitivo (habilita sitemap y URLs canónicas).
export default defineConfig({
  build: { format: 'directory' },
  integrations: [
    react(),
    starlight({
      title: 'RedEDoc',
      description:
        'Servicio gratuito de facturación electrónica DIAN para Colombia: ' +
        'factura de venta, notas crédito y débito, documento soporte y nómina electrónica.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es-CO' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/wariox3/neon',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      // El panel vive fuera de la colección `docs`, así que no aparece solo en
      // la navegación: se enlaza a mano.
      components: {
        SocialIcons: './src/components/EnlacePanel.astro',
      },
      editLink: {
        baseUrl: 'https://github.com/wariox3/neon/edit/main/',
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
