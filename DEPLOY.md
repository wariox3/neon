# Despliegue en producción

`neon` compila a un sitio **100 % estático**: no hay servidor propio, ni SSR, ni adaptador
de Astro. Desplegar es compilar y dejar que nginx sirva la carpeta resultante. Son unos
3 MB de archivos.

| | |
| --- | --- |
| Sitio | `https://rededoc.co` |
| API (nobelio) | `https://api.rededoc.co` |
| Servidor de origen | Ubuntu Server + nginx |
| DNS y CDN | Cloudflare, con el proxy activado |

Los dos comparten el dominio registrable `rededoc.co`, que es justo lo que la sesión
necesita: ver [Requisitos del dominio](#requisitos-del-dominio).

## Resumen

| | |
| --- | --- |
| Node | 20.12+ (o 22+) |
| Instalación | `npm ci` |
| Compilación | `npm run build` |
| Salida | `dist/` (archivos estáticos) |
| Se sirve con | nginx, como carpeta; sin Node en ejecución |

**No hay proceso que mantener vivo**: nada de `pm2`, ni `systemd`, ni un puerto escuchando.
Node solo hace falta para compilar. Lo que queda corriendo es nginx.

`prebuild` corre `npm run referencia`, así que la referencia de la API se genera sola en
cada compilación. No hay paso manual.

## Paso a paso en Ubuntu Server

Todo lo que sigue es una sola vez, salvo el último apartado.

### 1. DNS en Cloudflare

El dominio usa los nameservers de Cloudflare (`vera` y `mustafa.ns.cloudflare.com`). En
**DNS → Records**, apuntando a la IP pública del servidor de origen:

| Tipo | Nombre | Valor | Proxy |
| --- | --- | --- | --- |
| A | `rededoc.co` | `<IP del origen>` | Proxied |
| A | `www` | `<IP del origen>` | Proxied |
| A | `api` | `<IP de nobelio>` | Proxied |

Con el proxy activado (nube naranja) el mundo ve IPs de Cloudflare, no la del servidor;
Cloudflare reenvía al origen por detrás.

Espera a que resuelva antes de seguir:

```bash
dig +short rededoc.co @1.1.1.1
dig +short www.rededoc.co @1.1.1.1
```

**Si acabas de crear un registro y sigue diciendo que no existe**, es caché negativa: la
zona declara un TTL de 1800 s, así que un resolver que preguntó antes de que existiera
puede tardar hasta 30 minutos en olvidarlo. Pregunta al autoritativo para salir de dudas:

```bash
dig +short @vera.ns.cloudflare.com www.rededoc.co A
```

### 2. Node y nginx

```bash
sudo apt update
sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # v20.x
```

Los repos de Ubuntu traen un Node demasiado viejo para Astro; por eso NodeSource.

### 3. Código y carpetas

```bash
sudo mkdir -p /opt/neon
sudo chown "$USER":"$USER" /opt/neon
git clone https://github.com/wariox3/neon.git /opt/neon

sudo mkdir -p /var/www/neon       # lo que nginx sirve
sudo chown "$USER":www-data /var/www/neon
```

Se compila en `/opt/neon/dist` y se **copia** a `/var/www/neon`. Es a propósito:
`astro build` borra `dist/` antes de escribirlo, y si nginx apuntara ahí el sitio quedaría
en blanco durante la compilación.

### 4. Compilar

```bash
cd /opt/neon
npm ci
export PUBLIC_API_BASE=https://api.rededoc.co
npm run build
rsync -a --delete dist/ /var/www/neon/
```

`PUBLIC_API_BASE` se **exporta en el shell**, no en un `.env`: los dos lados leerían el
`.env` sin problema, pero tenerla junto al resto del despliegue evita compilar sin ella por
descuido. La referencia de la API no necesita variable propia: el esquema sale de esta
misma (`$PUBLIC_API_BASE/api/schema/?format=json`), así que sitio, panel y referencia
apuntan al mismo servicio por construcción.

> Si el servidor tiene 1 GB de RAM o menos, `astro build` puede quedarse sin memoria.
> Alternativa: compilar en tu máquina o en CI y subir solo el resultado —
> `rsync -a --delete dist/ usuario@servidor:/var/www/neon/`. El servidor entonces ni
> siquiera necesita Node.

### 5. nginx

`/etc/nginx/sites-available/neon`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name rededoc.co www.rededoc.co;

    root /var/www/neon;
    index index.html;

    # URLs de directorio: /guias/empezar/ → /guias/empezar/index.html
    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;

    # Los assets llevan hash en el nombre: nunca cambian de contenido.
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # El HTML sí cambia en cada despliegue.
    location ~* \.html$ {
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

Activar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/neon /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

No hace falta ninguna regla de reescritura ni *fallback* de SPA: todas las rutas del panel
están precompiladas y su estado viaja en la query (`/app/emisores/formulario/?id=7`).

### 6. HTTPS

Hay dos capas de TLS: la de Cloudflare hacia el visitante, y la del origen hacia
Cloudflare. Las dos hacen falta.

**HTTPS no es opcional**: las cookies de sesión de nobelio son `Secure`, así que en
`http://` el panel no puede iniciar sesión.

#### Certificado en el origen

Let's Encrypt valida por HTTP contra el nombre, y con el proxy encendido esa petición la
atiende Cloudflare, no tu nginx. Lo más simple es apagarlo un momento:

1. En Cloudflare → DNS, pon `rededoc.co` y `www` en **DNS only** (nube gris).
2. Comprueba que ya devuelven la IP del origen:

   ```bash
   dig +short rededoc.co @1.1.1.1
   ```

3. Emite el certificado:

   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d rededoc.co -d www.rededoc.co
   ```

4. Vuelve a poner los dos registros en **Proxied**.

Certbot edita el `server` de arriba, añade el bloque `443` y deja la renovación automática
en un *timer* de systemd.

Pide los dos nombres en el **mismo** certificado. Si `www` todavía no resolvía cuando lo
emitiste, amplíalo después sin reemitir el otro:

```bash
sudo certbot --nginx -d rededoc.co -d www.rededoc.co --expand
```

> Let's Encrypt limita a 5 validaciones fallidas por hora. Si certbot falla por DNS, arregla
> el DNS y comprueba con `dig` antes de reintentar; no lo repitas en bucle.

#### Modo de cifrado en Cloudflare

En **SSL/TLS → Overview**, deja **Full (strict)**.

Esto no es una recomendación de buenas prácticas: certbot añade a tu nginx un redirect de
`http://` a `https://`. Con el modo **Flexible**, Cloudflare habla con el origen por HTTP,
tu nginx lo redirige a HTTPS, Cloudflare vuelve a pedirlo por HTTP… y el sitio entra en
**bucle de redirecciones**. Con Full (strict) y el certificado ya instalado, funciona.

#### Comprobar las dos capas

```bash
# La capa pública, a través de Cloudflare
curl -sI https://rededoc.co | head -1

# La capa del origen, saltándose el DNS
curl -s -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' \
  --resolve rededoc.co:443:<IP del origen> https://rededoc.co/
```

El segundo tiene que dar `200 0`. Un `0` en `ssl_verify_result` es lo que Full (strict)
exige del origen.

> **Alternativa sin Let's Encrypt.** Si el proxy va a quedarse encendido siempre, puedes
> instalar en el origen un **Origin Certificate** de Cloudflare (SSL/TLS → Origin Server):
> vale 15 años y no hay renovación que vigilar. Solo lo acepta Cloudflare, que es justo el
> único que debería llegar al origen.

### 7. nobelio (`api.rededoc.co`)

El sitio es estático, pero la API es una aplicación Django que sí necesita un proceso.
Puede vivir en este mismo servidor o en otro: lo único que importa es que `api` esté en la
misma zona de Cloudflare, para que comparta el dominio registrable `rededoc.co`.

Si va en esta máquina, su propio `server` en `/etc/nginx/sites-available/nobelio`:

```nginx
server {
    listen 80;
    server_name api.rededoc.co;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # sin esto Django no sabe que es https
    }
}
```

Luego `sudo certbot --nginx -d api.rededoc.co`, con el mismo baile de apagar y encender el
proxy del paso 6.

**Con Cloudflare delante, Django deja de ver al cliente real.** Todas las peticiones llegan
con IP de Cloudflare, así que en nobelio hay que:

- confiar en la cabecera de protocolo, o se creerá que todo es HTTP:
  `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`;
- leer `CF-Connecting-IP` para la IP real, o los límites de peticiones y los registros
  saldrán todos con la misma IP.

El resto del despliegue de nobelio (gunicorn, systemd, base de datos, migraciones) es su
propio tema y no se documenta aquí.

## Actualizar el sitio

Lo único que se repite. En `/usr/local/bin/desplegar-neon` (fuera del repo, para que
`git pull` no lo pise):

```bash
#!/usr/bin/env bash
set -euo pipefail

export PUBLIC_API_BASE=https://api.rededoc.co

cd /opt/neon
git pull --ff-only
npm ci
npm run build
rsync -a --delete dist/ /var/www/neon/
echo "Listo: https://rededoc.co"
```

`chmod +x` y ya. No hay que reiniciar nginx: sirve archivos, y los archivos cambiaron.

**Rollback**: `git checkout <commit-anterior>` y volver a correrlo. No hay estado ni
migraciones de este lado.

## Variables de entorno

Las dos se leen **en tiempo de compilación**, no en ejecución. Cambiarlas no afecta a lo ya
publicado: hay que volver a compilar y copiar. Pueden ir exportadas —lo que gana— o en un
`.env`; no en `.env.production`, que lo carga Vite y no lo ve `npm run referencia`.

| Variable | Para qué | En producción |
| --- | --- | --- |
| `PUBLIC_API_BASE` | URL base de la API, y la única que apunta al servicio: la usa el panel de `/app/` en cada petición del navegador, los ejemplos de la referencia, y el generador para descargar el esquema de `$PUBLIC_API_BASE/api/schema/?format=json`. | `https://api.rededoc.co` |
| `OPENAPI_SOURCE` | Esquema del que se genera `/api/`. Ruta local o URL `http(s)`. | **No hace falta definirla**: el esquema ya sale de `PUBLIC_API_BASE`. Solo para leerlo de otro sitio, normalmente un archivo. |

`PUBLIC_API_BASE` queda **incrustada en el JavaScript** que se manda al navegador
(`import.meta.env`). Si no se define, el panel apunta a `http://localhost:8000` y en
producción no funciona nada.

## Requisitos del dominio

La sesión son cookies `httpOnly` con `SameSite=Lax`, que no cruzan de un dominio a otro.
De ahí dos condiciones que **no son opcionales**:

1. El sitio y la API comparten el dominio registrable `rededoc.co`: el panel en
   `rededoc.co`, nobelio en `api.rededoc.co`. Probar el panel desde la IP del servidor o
   desde otro dominio lo deja sin sesión.
2. nobelio permite el origen del sitio:

   ```
   CORS_ALLOWED_ORIGINS=https://rededoc.co
   CORS_ALLOW_CREDENTIALS=True
   ```

   Si se publica también `www.rededoc.co`, o va en la lista, o redirige a la raíz.

Además, `URL_VERIFICACION_CORREO` en nobelio tiene que apuntar a
`https://rededoc.co/verificar-correo/` —con barra final—: es el aterrizaje del enlace de
confirmación del registro. La página lee el `?token=` de la query y lo canjea sola contra
`POST /api/seguridad/registro/verificar/`.

Sin la barra también funciona (nginx redirige y conserva la query), pero te ahorras un salto
y el riesgo de que un cliente de correo que reescribe enlaces se coma el token por el camino.

## Antes del primer despliegue

- [ ] Comprobar que la compilación dejó `dist/sitemap-index.xml` y `dist/robots.txt`.
      El dominio sale de `site` en `astro.config.mjs` (`https://rededoc.co`); para
      compilar contra otro, exporta `SITE_URL`.
- [ ] DNS de `rededoc.co`, `www` y `api` en Cloudflare, apuntando al origen.
- [ ] Compilar con `PUBLIC_API_BASE=https://api.rededoc.co`.
- [ ] Certificado en el origen para `rededoc.co` **y** `www`, más otro para
      `api.rededoc.co`.
- [ ] Cloudflare en **Full (strict)**. En Flexible el sitio entra en bucle de redirecciones.
- [ ] En nobelio: `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS`,
      `URL_VERIFICACION_CORREO`, `SECURE_PROXY_SSL_HEADER`, y que la cookie de sesión valga
      para `rededoc.co`.
- [ ] Cortafuegos: `sudo ufw allow 'Nginx Full'` y `sudo ufw allow OpenSSH`.

## Notas de operación

- **La compilación descarga el esquema de la API.** Por defecto lo lee de
  `https://api.rededoc.co/api/schema/?format=json`, así que la referencia de `/api/` se
  regenera sola en cada despliegue y nunca se desfasa. Se cachea en `openapi/.cache/`: si
  una descarga posterior falla, se usa esa copia y se avisa. Pero esa carpeta está en
  `.gitignore`, así que en un **clon nuevo** sin caché previa un fallo de descarga **rompe
  el build** en vez de publicar una referencia vacía. Es deliberado. En el servidor no
  suele morder, porque `/opt/neon` es un clon persistente y la caché sobrevive entre
  despliegues; en un CI que parte de cero, sí. Para desacoplarlo, versiona el esquema
  (`manage.py spectacular --file`) y apunta `OPENAPI_SOURCE` a esa ruta.
- **No hay nada protegido en lo que se sirve.** Todo lo que se ve en el panel llega de la
  API con la sesión de quien mira; no hay secretos que filtrar salvo lo que se ponga en una
  variable `PUBLIC_*`, que es pública por definición.
- **Cloudflare cachea, y eso sobrevive al `rsync`.** Medido el 2026-09-10, el HTML sale
  con `cf-cache-status: DYNAMIC`: Cloudflare no lo cachea de serie, así que un despliegue
  se ve al momento. Lo que sí se cachea son los estáticos (`_astro/`, `favicon.svg`,
  `robots.txt`, `sitemap-*.xml`) con `max-age=14400`, cuatro horas. Los de `_astro/` llevan
  hash en el nombre y no dan problema; `robots.txt` y los sitemaps **no**, y son justo los
  que cambian ahora. Tras publicar, purga al menos esos: Cloudflare → Caching →
  **Purge Everything**. Y si algún día se añade una Cache Rule para HTML, esta nota deja
  de valer: vuelve a mirar `cf-cache-status`.
- **El `robots.txt` de Cloudflare pisa al nuestro.** La zona tiene activado *Manage
  robots.txt* (Content Signals): hoy `https://rededoc.co/robots.txt` devuelve un bloque
  gestionado por Cloudflare —`search=yes`, y `Disallow` para GPTBot, ClaudeBot,
  Google-Extended y demás— aunque el origen todavía no sirve ninguno. Googlebot **no**
  está bloqueado y `Google-Extended` solo afecta al entrenamiento de Gemini, no a la
  búsqueda; para indexar no estorba. Pero hay que comprobar tras el despliegue que el
  nuestro (con la línea `Sitemap:`) aparece de verdad: Cloudflare debería añadir su bloque
  al del origen, no sustituirlo. Si lo sustituye, o se desactiva la función en
  Cloudflare → Bots, o el sitemap se envía solo por Search Console.
- **`/opt/neon` no debe ser accesible por web.** nginx sirve `/var/www/neon`, no
  el repo: ahí están `.git`, `node_modules` y `.env`.

## Comprobación

En local, antes de subir:

```bash
npm run build && npm run preview   # sirve dist/ como quedaría publicado
```

Ya en `https://rededoc.co`:

1. Carga la portada y una guía con barra final (`/guias/empezar/`).
2. Una URL inventada devuelve la página 404 del sitio, no la de nginx.
3. Entrar a `/app/ingresar/`, iniciar sesión y ver que el listado de emisores carga.
4. `curl -s https://rededoc.co/sitemap-index.xml` y `curl -s https://rededoc.co/robots.txt`
   devuelven XML y texto, no la página 404.

## Que Google lo encuentre

El sitio ya se compila indexable: cada página lleva su URL canónica y la compilación
genera `sitemap-index.xml` (que apunta a `sitemap-0.xml`, con las 10 páginas que sí
queremos en el buscador: la portada, las cinco guías y las cuatro de «El servicio») más el
`robots.txt` que lo anuncia.

Fuera del sitemap y con `noindex` quedan dos grupos. `/app/`, `/verificar-correo/` y
`/restablecer-clave/`, que son cascarones que sin sesión o sin token no muestran nada. Y
las 91 páginas de `/api/`: la referencia es material de consulta para quien ya está
integrando, no una puerta de entrada desde Google, y se llega a ella por el menú del sitio.
Ninguno de los dos grupos se bloquea en `robots.txt` **a propósito**: si Google no puede
rastrear la página, tampoco llega a leer el `noindex`, y una URL ya conocida seguiría
saliendo en los resultados sin descripción.

Publicar no basta para salir en Google; falta darse de alta una vez:

1. En [Google Search Console](https://search.google.com/search-console) → **Añadir
   propiedad** → **Dominio**, escribe `rededoc.co`.
2. Google pide un registro `TXT` de verificación. Ponlo en Cloudflare → DNS (nombre `@`,
   el valor que dé Google) y dale a **Verificar**. Con la propiedad de tipo dominio
   quedan cubiertos `www` y `api` sin trámite aparte.
3. Ya dentro, **Sitemaps** → envía `sitemap-index.xml`. Debe quedar en «Correcto» con las
   10 URL leídas; si dice «No se ha podido obtener», casi siempre es que el despliegue
   no copió el archivo o que Cloudflare sirve una copia vieja (purga la caché).
4. **Inspección de URLs** con `https://rededoc.co/` → **Solicitar indexación**, para no
   esperar al rastreo natural. Es un empujón para la portada, no para las diez.

La indexación tarda: de unos días a un par de semanas para las primeras páginas. Se
sigue en **Páginas** (cuántas indexadas y por qué se descartan las demás) y en
**Rendimiento** (cuándo empieza a haber impresiones). Que una página aparezca como
«Rastreada, no indexada» al principio es normal y no requiere tocar nada.

Un aviso sobre Cloudflare: si algún día se activa **Bot Fight Mode** o un rate limit
agresivo, el rastreador de Google se lleva retos y deja de indexar. Los buscadores
verificados están exentos por defecto, pero conviene revisarlo si las páginas indexadas
caen de golpe.

Si el punto 3 responde 401 en bucle, el problema es de cookies o de CORS en nobelio, no del
sitio. Si lo que ves es una redirección infinita, es el modo de cifrado de Cloudflare: pásalo
a Full (strict).
