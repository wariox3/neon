---
title: Empezar
description: De la credencial al primer documento emitido, en el orden en que hay que hacerlo.
sidebar:
  order: 1
---

Esta guía recorre el camino completo la primera vez. Cada paso tiene su página con el
detalle; aquí está el orden y el porqué de cada uno.

:::note[URL base]
Los ejemplos apuntan a `https://api.rededoc.co`, que es la API en producción. Para
desarrollo local, cambia esa base por la de tu instancia.
:::

## 1. Conseguir una credencial

Primero una persona, y de ella cuelga todo lo demás.

:::tip[Con formulario, si lo prefieres]
Los pasos 1 y 3 —registrarte, crear la llave y dar de alta el emisor— se pueden hacer
desde el [panel](/app/), sin escribir una sola petición. Lo que sigue es el mismo camino
por la API, que es el que automatiza un ERP.
:::

El registro es público:

```bash
curl -X POST https://api.rededoc.co/api/seguridad/registro/ \
  -H "Content-Type: application/json" \
  -d '{"email": "tu@empresa.co", "password": "..."}'
```

Confirma el correo con el enlace que llega, inicia sesión en
`POST /api/seguridad/token/` —que deja la sesión en cookies— y con esa sesión crea la
llave de tu integración:

```bash
curl -X POST https://api.rededoc.co/api/seguridad/llave-api/ \
  -H "Content-Type: application/json" --cookie cookies.txt \
  -d '{"nombre": "ERP producción"}'
```

El campo `clave` de esa respuesta es la credencial completa y se muestra **una sola vez**:
guárdala donde guardes los secretos de tu ERP.

```bash
export API_KEY='<prefijo>.<secreto>'
```

Toda petición del ERP la lleva en la cabecera:

```
Authorization: Api-Key <prefijo>.<secreto>
```

Ver [Autenticación](/guias/autenticacion/) para el detalle de las dos vías —llave de API y
sesión en cookie— y para cómo funciona el alcance.

## 2. Mirar los catálogos

Varios campos del emisor y del documento se envían como **valor de un catálogo DIAN**
(tipo de identificación, tributo, unidad de medida, moneda…). Están todos en
[Catálogos DIAN](/catalogos/), con qué campos los usan y para descargar en JSON o CSV.

En la API son de solo lectura y públicos: no piden credencial.

```bash
curl "https://api.rededoc.co/api/catalogos/tipo-identificacion/"

curl "https://api.rededoc.co/api/catalogos/tributo/?search=IVA"

curl "https://api.rededoc.co/api/catalogos/municipio/?search=Medell"
```

:::tip[Los ids son fijos]
Cada código de un catálogo tiene un `id` fijo, **el mismo en todos los ambientes**: el que
uses en pruebas vale en producción. En el tipo de identificación el `id` es el propio
código (`13` cédula, `31` NIT).
:::

## 3. Crear el emisor

El emisor es el obligado a facturar (el OFE). Queda **a nombre de quien lo da de alta**:
el dueño no se envía en el cuerpo, sale de la credencial.

```bash
curl -X POST https://api.rededoc.co/api/emisores/emisor/ \
  -H "Content-Type: application/json" -H "Authorization: Api-Key $API_KEY" \
  -d '{
    "razon_social": "Empresa Demo SAS",
    "tipo_identificacion": 31,
    "numero_identificacion": "700085371",
    "digito_verificacion": "1",
    "tipo_organizacion": 1,
    "responsabilidades": [],
    "pais": "CO", "departamento": "05", "municipio": "05001",
    "direccion": "Calle 1 # 2-3",
    "correo": "facturacion@empresa.co"
  }'
```

`tipo_identificacion` y `tipo_organizacion` van por id (`31` NIT, `1` persona jurídica),
pero `pais`, `departamento`, `municipio` y `responsabilidades` van por **código** —ISO 3166,
DANE y el del RUT—. El servidor resuelve el código contra el catálogo; si no existe,
responde `400` en ese campo.

Lo que sí se rechaza es repetir una identificación ya dada de alta: el NIT es único en toda
la plataforma, esté a nombre de quien esté.

## 4. Habilitar al emisor ante la DIAN

Certificado, software y resolución, **en ese orden**. Es la parte con más piezas: tiene su
propia guía en [Habilitación ante la DIAN](/guias/habilitacion-dian/).

## 5. Emitir

Crear el documento, emitirlo, enviarlo y descargar el XML y el PDF. Está en
[Flujo de emisión](/guias/flujo-emision/).

## Resumen del camino

1. Registro, sesión y llave de API.
2. Catálogos, para resolver los ids.
3. Emisor.
4. Certificado → software DIAN → resolución.
5. Documento → emitir → enviar → XML y PDF.
