---
title: Habilitación ante la DIAN
description: "Certificado, software y resolución: las tres piezas que un emisor necesita antes de poder emitir, en orden."
sidebar:
  order: 3
---

Antes de emitir nada, el emisor necesita tres cosas registradas. **El orden importa**: el
certificado es lo que firma todo lo demás.

## 1. Certificado digital

Un `.p12` emitido por una entidad de certificación autorizada. Se sube junto con su clave
y se valida en el momento:

```bash
curl -X POST https://api.rededoc.co/api/emisores/certificado/cargar/ \
  -H "Authorization: Api-Key $API_KEY" \
  -F "emisor=<id-emisor>" \
  -F "archivo=@certificado.p12" \
  -F "clave=<clave-del-p12>"
```

Va primero porque **sin certificado activo y vigente no se puede registrar el software**.

## 2. Software DIAN

Los datos que entrega la DIAN al registrar el software de facturación:

```bash
curl -X POST https://api.rededoc.co/api/emisores/emisor/crear-habilitacion/ \
  -H "Content-Type: application/json" -H "Authorization: Api-Key $API_KEY" \
  -d '{
    "emisor": "<id-emisor>",
    "identificador": "<identificador-del-software>",
    "pin": "<pin>",
    "test_set_id": "<id-del-set-de-pruebas>"
  }'
```

- Comprueba que el emisor tenga certificado activo y vigente.
- Registra el software y **jubila el anterior**: hay un solo software activo por emisor.
- El `ProviderID` del XML no se guarda: en software propio es el NIT del emisor.

## 3. Resolución de facturación

Se puede traer de la DIAN con su clave técnica:

```bash
curl -X POST https://api.rededoc.co/api/emisores/resolucion/importar-dian/ \
  -H "Content-Type: application/json" -H "Authorization: Api-Key $API_KEY" \
  -d '{"emisor": "<id-emisor>", "clave_tecnica": "<clave-tecnica>"}'
```

o cargarla a mano con `POST /api/emisores/resolucion/`.

El documento no se refiere a ella por id, sino por **`numero_resolucion`**: el número que
la DIAN le dio al emisor, que es el que este conoce. Se busca entre las resoluciones
**activas** de ese emisor, y el `prefijo` y el `consecutivo` tienen que caber en lo que esa
resolución autorizó, o la petición responde `400`.

:::note[El documento soporte lleva la suya]
El documento soporte tiene **resolución propia**, distinta de la de facturación: la DIAN
autoriza el rango contra `InvoiceTypeCode=05`. Hay que registrarla con su `tipo_factura`
(el código `05` del catálogo). No necesita clave técnica: el CUDS se calcula con el PIN del
software.
:::

## El Set de Pruebas

El Set de Pruebas **no se corre desde un endpoint aparte**: los documentos de habilitación
se emiten y se envían con los mismos endpoints de documentos que en producción. Lo que
cambia es a qué operación del Web Service van:

| Situación | Operación DIAN |
| --- | --- |
| En habilitación y con el Set de Pruebas sin aceptar | `SendTestSetAsync` (asíncrona) |
| Set de Pruebas aceptado, o producción | `SendBillSync` (síncrona) |

Cuando la DIAN acepta el Set de Pruebas hay que **marcarlo en el software** para que el
servicio cambie de operación.

El **documento soporte no tiene habilitación propia**: con el Set de Pruebas de la factura
aceptado, el emisor queda habilitado también para emitirlo. El `test_set_id` único del
software basta.

## Antes de producción

Puntos que solo se confirman contra el ambiente real de la DIAN:

- El hash de la política de firma configurado con el valor real.
- El `.p12`, el `test_set_id` y las claves técnicas del emisor cargados.
- El Set de Pruebas validado. El de nómina ya pasa: el rechazo `ZE02` que lo bloqueaba
  está resuelto, y su causa no era la firma sino el **orden de las declaraciones de
  namespace de la raíz**, que debe copiar el de la ejemplificación oficial.
