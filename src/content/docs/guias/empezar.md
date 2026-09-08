---
title: Empezar
description: De la credencial al primer documento emitido, en el orden en que hay que hacerlo.
sidebar:
  order: 1
---

Esta guía recorre el camino completo la primera vez. Cada paso tiene su página con el
detalle; aquí está el orden y el porqué de cada uno.

:::note[URL base]
Los ejemplos usan `http://localhost:8000`. TODO: reemplazar por la URL del servicio
publicado cuando esté definida.
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
curl -X POST http://localhost:8000/api/seguridad/registro/ \
  -H "Content-Type: application/json" \
  -d '{"email": "tu@empresa.co", "password": "..."}'
```

Confirma el correo con el enlace que llega, inicia sesión en
`POST /api/seguridad/token/` —que deja la sesión en cookies— y con esa sesión crea la
llave de tu integración:

```bash
curl -X POST http://localhost:8000/api/seguridad/llave-api/ \
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

Varios campos del emisor y del documento se envían como **id de una fila de catálogo**
(tipo de identificación, tributo, unidad de medida, moneda…). Los catálogos son de solo
lectura y se consultan con la misma credencial:

```bash
curl -H "Authorization: Api-Key $API_KEY" \
  "http://localhost:8000/api/catalogos/tipo-identificacion/"

curl -H "Authorization: Api-Key $API_KEY" \
  "http://localhost:8000/api/catalogos/tributo/?search=IVA"

curl -H "Authorization: Api-Key $API_KEY" \
  "http://localhost:8000/api/catalogos/municipio/?search=Medell"
```

:::caution[Los ids no son portables]
El `id` de un catálogo es un serial de cada base de datos y **cambia entre ambientes**. No
lo quemes en tu código: resuélvelo por `codigo` o por búsqueda, y guárdalo por ambiente.
:::

## 3. Crear el emisor

El emisor es el obligado a facturar (el OFE). Queda **a nombre de quien lo da de alta**:
el dueño no se envía en el cuerpo, sale de la credencial.

```bash
curl -X POST http://localhost:8000/api/emisores/emisor/ \
  -H "Content-Type: application/json" -H "Authorization: Api-Key $API_KEY" \
  -d '{
    "razon_social": "Empresa Demo SAS",
    "tipo_identificacion": 1,
    "numero_identificacion": "700085371",
    "digito_verificacion": "1",
    "tipo_organizacion": 1,
    "responsabilidades": [],
    "pais": "CO", "departamento": "05", "municipio": "05001",
    "direccion": "Calle 1 # 2-3",
    "correo": "facturacion@empresa.co"
  }'
```

`pais`, `departamento` y `municipio` van por **código** —ISO 3166 y DANE—, no por id,
justamente porque el id cambia entre ambientes. El servidor resuelve el código contra el
catálogo; si no existe, responde `400` en ese campo.

El alta no consulta el RUES. Lo que sí se rechaza es repetir una identificación ya dada de
alta: el NIT es único en toda la plataforma, esté a nombre de quien esté. Para comprobar un
NIT y autocompletar el formulario:

```bash
curl -H "Authorization: Api-Key $API_KEY" \
  "http://localhost:8000/api/emisores/emisor/validar-nit/?nit=<NIT>"
```

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
