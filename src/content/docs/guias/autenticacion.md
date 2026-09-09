---
title: Autenticación
description: Llave de API para las integraciones de ERP, sesión en cookie para las aplicaciones con usuario, y cómo funciona el alcance.
sidebar:
  order: 2
---

Hay dos credenciales, y no son intercambiables porque los clientes no se parecen. Un ERP
es una máquina sin nadie delante: necesita una credencial larga que pueda guardar en su
servidor. Un navegador tiene una persona delante y un enemigo propio, el XSS: necesita una
sesión que su propio JavaScript no pueda leer.

| Cliente | Credencial | Dónde viaja |
| --- | --- | --- |
| ERP, integración servidor a servidor, tarea programada | Llave de API | Cabecera `Authorization` |
| Aplicación con inicio de sesión de una persona | Sesión JWT | Cookies `httpOnly` |

## Llave de API — para integraciones

```
Authorization: Api-Key <prefijo>.<secreto>
```

La llave tiene dos partes separadas por un punto: el **prefijo**, que identifica la llave,
y el **secreto**, que solo se muestra cuando la llave se crea. Si se pierde, no se
recupera: se crea otra.

```bash
export API_KEY='<prefijo>.<secreto>'

curl -H "Authorization: Api-Key $API_KEY" \
  https://api.rededoc.co/api/catalogos/tributo/
```

Esta vía es **stateless**: no usa cookies ni sesión, y cada petición se identifica sola.

### Crear una llave

Las llaves se gestionan con la sesión iniciada, en `/api/seguridad/llave-api/`. Cada
persona ve y administra las suyas — con formulario, en
[el panel](/app/llaves/); o por la API:

```bash
curl -X POST https://api.rededoc.co/api/seguridad/llave-api/ \
  -H "Content-Type: application/json" --cookie cookies.txt \
  -d '{"nombre": "ERP producción"}'
```

La respuesta del alta —y solo esa— trae el campo `clave` con la credencial completa. En
las lecturas posteriores viene `null`, porque el servidor guarda el hash del secreto y no
el secreto.

- La llave queda **a nombre de quien la pide**. No se puede crear a nombre de otro.
- Una persona puede tener **varias llaves vivas** a la vez: es lo que permite rotar sin
  dejar al ERP sin credencial. Se crea la nueva, se despliega y luego se desactiva la
  vieja (`activa: false`) o se borra.
- Se le puede poner fecha de caducidad con `expira_en`.

### La llave actúa en nombre de su dueño

Una llave de API no tiene permisos propios: alcanza **exactamente los mismos emisores que
la persona que la creó**, ni uno más. Es la misma regla para los dos tipos de credencial,
así que no hay dos definiciones de alcance que puedan separarse con el tiempo.

## Sesión en cookie — para aplicaciones con usuario

El servidor emite la sesión en cookies `httpOnly`, que el JavaScript del navegador no
puede leer: un XSS ya no se lleva la sesión. Es la razón de existir de todo este camino.

:::caution[No hay `Authorization: Bearer`]
El token de acceso se lee **solo** de la cookie. Mandarlo en la cabecera no autentica: si
el front pudiera mandarlo, tendría que guardarlo en algún sitio legible, y ahí se acabaría
la garantía. Un cliente que no sea navegador usa la llave de API, que es el otro camino.
:::

### 1. Registrarse y confirmar el correo

```bash
curl -X POST https://api.rededoc.co/api/seguridad/registro/ \
  -H "Content-Type: application/json" \
  -d '{"email": "persona@empresa.co", "password": "...", "nombre_corto": "Ana"}'
```

Responde `201` y manda un correo con el enlace de confirmación. Hasta confirmarlo no se
puede iniciar sesión (`403`). El enlace se confirma en `POST /api/seguridad/registro/verificar/`
y se puede pedir otro en `POST /api/seguridad/registro/reenviar/`.

### 2. Iniciar sesión

```bash
curl -X POST https://api.rededoc.co/api/seguridad/token/ \
  -H "Content-Type: application/json" --cookie-jar cookies.txt \
  -d '{"email": "persona@empresa.co", "password": "..."}'
```

Si la cuenta no tiene segundo factor, la respuesta **no trae tokens**: trae los datos de la
persona, y la sesión viaja en las cookies que el servidor acaba de poner.

| Cookie | Qué es |
| --- | --- |
| `access_token` | Token de acceso. Vida corta (15 min por defecto). |
| `refresh_token` | Token de refresco. Renueva el acceso sin volver a pedir la clave. |
| `mfa_dispositivo` | Marca este navegador como de confianza. Solo si se pidió recordarlo. |

Las tres son `httpOnly`, `Secure` fuera de desarrollo y `SameSite=Lax`.

### 3. Segundo factor, si la cuenta lo tiene

Cuando la cuenta tiene segundo factor, el paso anterior **no emite sesión ninguna**.
Responde el desafío:

```json
{ "mfa_requerido": true, "mfa_token": "...", "metodo": "totp" }
```

y la sesión se emite al resolverlo:

```bash
curl -X POST https://api.rededoc.co/api/seguridad/token/mfa/ \
  -H "Content-Type: application/json" --cookie-jar cookies.txt \
  -d '{"mfa_token": "...", "codigo": "123456", "recordar_dispositivo": true}'
```

Con `recordar_dispositivo` el servidor añade la cookie `mfa_dispositivo`, y en los
siguientes ingresos desde ese navegador no vuelve a pedir el código. Esa cookie
**sobrevive al cierre de sesión** a propósito: dice "este navegador es de confianza", no
"esta sesión está abierta". Si el método manda el código por correo,
`POST /api/seguridad/token/mfa/reenviar/` manda otro.

El segundo factor se administra desde la propia cuenta, ya con la sesión iniciada, bajo
`/api/seguridad/mfa/`: `metodos/`, estado, `enrolar/`, `confirmar/`, `desactivar/` y
`codigos-respaldo/`. Los códigos de respaldo se muestran una sola vez, al confirmar.

### 4. Recuperar la contraseña

Si se pierde, se pide un enlace y se fija una nueva. Son dos llamadas:

```bash
# 1. Pedir el enlace
curl -X POST https://api.rededoc.co/api/seguridad/token/recuperar/ \
  -H "Content-Type: application/json" \
  -d '{"email": "persona@empresa.co"}'

# 2. Fijar la contraseña nueva, con el token que llegó por correo
curl -X POST https://api.rededoc.co/api/seguridad/token/restablecer/ \
  -H "Content-Type: application/json" \
  -d '{"token": "<el de la query string>", "password": "<la nueva>"}'
```

`recuperar/` responde **siempre `200` con el mismo texto**, exista o no la cuenta. Es
deliberado: si la respuesta cambiara, el endpoint sería un comprobador de quién está
registrado en la plataforma. No deduzcas nada de ella ni digas al usuario «ese correo no
existe». El correo solo sale hacia cuentas activas.

El enlace apunta a `/restablecer-clave?token=…` del sitio, la página que pide la
contraseña nueva. `restablecer/` responde `400` con `detail` si el token no vale o ya
caducó, y con el error colgando de `errores.password` si la contraseña no pasa los
validadores — el mínimo son **diez caracteres**, no los ocho de fábrica de Django.

Restablecer **no abre sesión**: después hay que iniciarla como siempre.

### 5. Renovar y cerrar

```bash
curl -X POST https://api.rededoc.co/api/seguridad/token/refresh/ --cookie cookies.txt --cookie-jar cookies.txt
curl -X POST https://api.rededoc.co/api/seguridad/token/cerrar/  --cookie cookies.txt
```

`refresh/` no lleva cuerpo: usa la cookie. Cada refresco entrega un token nuevo y **anula
el anterior**, así que un refresh robado deja de servir en cuanto el dueño legítimo
refresca. `cerrar/` invalida el refresco y borra las cookies de sesión.

`GET /api/seguridad/me/` responde quién es quien pregunta; es la forma de saber, al cargar
la aplicación, si la cookie que trae el navegador sigue viva.

### Cuánto dura una sesión

| Plazo | Valor por defecto | Qué significa |
| --- | --- | --- |
| Acceso | 15 minutos | Lo que vale el `access_token` antes de tener que renovarlo. |
| Refresco | 1 día | Vencimiento por **inactividad**: cada renovación lo corre hacia adelante. |
| Sesión | 30 días | Tope **absoluto**: pasado ese plazo hay que iniciar sesión otra vez, se haya usado o no. |

Sin el tope absoluto, renovar a diario haría que una sesión no caducara nunca. Son los
valores por defecto del proyecto; la instancia publicada puede tener otros.

### Lo que tiene que hacer el front

- **Mandar las cookies**: `fetch(url, { credentials: "include" })`. Sin eso el navegador
  no las envía y todo responde `401`.
- **Compartir dominio registrable** con la API (`app.ejemplo.co` y `api.ejemplo.co`).
  `SameSite=Lax` es lo que frena el CSRF, y por eso no hay token CSRF que manejar; a
  cambio, la aplicación no puede vivir en un dominio distinto del de la API.
- **HTTPS en producción**: las cookies van marcadas `Secure`.
- **Renovar y reintentar**: ante un `401` por acceso vencido, llamar a `token/refresh/` y
  repetir la petición. Si el refresco también falla, la sesión terminó.

:::note[En desarrollo]
Con el servidor en modo depuración, el ingreso devuelve además el token de acceso en el
cuerpo, porque curl y Postman no guardan cookies. En producción el token no sale del
navegador.
:::

## Alcance: qué emisores ve cada quien

Todos los datos de la plataforma cuelgan de un **emisor**, así que el aislamiento se
reduce a una sola pregunta: *¿qué emisores alcanza quien pregunta?* Y hay una sola regla:

- Los emisores que **posee** —los que dio de alta—, más
- los que le hayan **compartido** uno a uno.

Sin ninguna de las dos cosas no ve ningún dato: falla cerrado. Una llave de API alcanza lo
que alcanza su dueño, ni más ni menos.

- Lo que es de otro **no aparece en los listados**.
- Pedirlo directamente por su id responde **`404`**, no `403`: desde fuera, ese recurso no
  existe. Distinguirlos convertiría al endpoint en un oráculo para averiguar qué ids hay.

Los catálogos son la excepción en el otro sentido: son comunes y de **solo lectura**.

:::note[Ya no hay "cuenta"]
El servicio tuvo un inquilino intermedio llamado *cuenta*, que agrupaba emisores y daba
alcance a las llaves. Desapareció: el dueño de un emisor es directamente una persona. Si
tu integración enviaba el campo `cuenta` al dar de alta un emisor, ya no existe.
:::

## Topes de peticiones

La API limita cuántas peticiones acepta. Los valores por defecto del proyecto:

| Ruta | Tope |
| --- | --- |
| General, con credencial | 300/hora |
| General, sin credencial | 30/hora |
| Ingreso (`token/`) | 20/hora y 5/min por IP, más 10/hora por correo |
| Segundo factor (`token/mfa/`) | 20/hora y 10/min |
| Reenvío de código o de correo | 5/hora y 2/min |
| Registro | 3/hora y 1/min |
| Renovación (`token/refresh/`) | 120/hora |

El tope por correo en el ingreso es el que protege una cuenta concreta: sin él, repartir
un ataque entre muchas IP la dejaría sin defensa. La instancia publicada puede tener otros
valores. TODO: confirmar los topes efectivos del servicio publicado y qué responde la API
al superarlos.

## Cuidados

- El secreto de la llave va donde van los secretos de tu sistema: variable de entorno o
  gestor de secretos, **nunca** en el repositorio ni en el front.
- Una llave por integración y con nombre reconocible: si hay que revocar una, no se cae
  todo lo demás.
- **La llave de API no se usa desde el navegador.** Quedaría expuesta a cualquiera que
  abra las herramientas de desarrollo. Para eso está la sesión en cookie.
