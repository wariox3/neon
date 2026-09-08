---
title: Qué es RedEDoc
description: "Un servicio de facturación electrónica DIAN por API REST: emite el documento, genera el XML UBL, lo firma y lo envía."
sidebar:
  order: 1
---

RedEDoc es un **servicio de facturación electrónica para Colombia**: recibe un documento
por su API REST y se encarga de todo lo que la DIAN exige entre ese momento y el acuse.

```
Documento → XML UBL 2.1 → CUFE/CUDE → Firma XAdES-EPES → Envío WS DIAN → PDF+QR
```

Cada paso de esa cadena es trabajo que tu ERP no tiene que hacer: ni armar el XML UBL, ni
calcular el hash del identificador, ni manejar el certificado, ni hablar SOAP con la DIAN,
ni dibujar la representación gráfica.

## Qué documentos emite

| Documento | Identificador | Notas |
| --- | --- | --- |
| Factura de venta | CUFE | Requiere resolución de facturación vigente. |
| Nota crédito | CUDE | Corrige un documento anterior; hereda su numeración. |
| Nota débito | CUDE | Igual que la nota crédito. |
| Documento soporte | CUDS | Compras a no obligados a facturar. Lleva su propia resolución. |
| Nota de ajuste | CUDS | Corrige un documento soporte (tipo 95). |
| Nómina electrónica | CUNE | Aceptada por la DIAN en habilitación. |

:::note[Documento equivalente P.O.S.]
El XML del documento equivalente P.O.S. está validado contra el XSD oficial, pero todavía
no forma parte del flujo de emisión de la API. TODO: documentarlo cuando el endpoint exista.
:::

## Cómo lo hace

- **Catálogos DIAN oficiales.** Las listas de valores se cargan desde los archivos
  Genericode (`.gc`) que publica la DIAN: tipos de identificación, tributos, municipios,
  monedas, unidades de medida y demás. Se consultan por la API, de solo lectura.
- **XML UBL 2.1** generado y validado contra los **XSD oficiales** de la DIAN.
- **CUFE, CUDE y CUDS** (SHA-384) calculados según el Anexo Técnico y verificados contra
  los ejemplos oficiales del propio Anexo. El **CUNE** no tiene ejemplo oficial que cuadre
  —el del anexo no reproduce su propio hash—, así que lo que está fijado es su
  composición, anclada a la nómina que la DIAN aceptó.
- **Firma XAdES-EPES** con el certificado `.p12` del emisor, verificada
  criptográficamente y también fuera de su documento.
- **Cliente SOAP** de los Web Services de la DIAN con WS-Security, tanto contra el Set de
  Pruebas como contra producción.
- **Representación gráfica en PDF** con código QR.

## Normativa que implementa

| Documento | Anexo |
| --- | --- |
| Factura, notas y demás | Anexo Técnico v1.9 — Resolución DIAN 000165 de 2023 |
| Documento soporte | Anexo del documento soporte v1.1 — Resolución 000167 |
| Nómina electrónica | Anexo de nómina v1.0 — Resolución 000013 |

La referencia de fondo es la *Caja de Herramientas FE V19 (v2026)* de la DIAN: Anexo
Técnico, XSD, listas de valores y guía de Web Services.

## Qué no es

- **No es un software contable ni un portal de facturación.** No tiene sitio de
  administración: la API es *stateless*, sin sesiones ni cookies.
- **No guarda una cartera de clientes.** Los datos del adquiriente van dentro de cada
  documento, y cada documento conserva su copia: la que quedó firmada en el XML y entró
  en el CUFE.
- **No emite por ti.** Tu sistema decide qué se factura y cuándo; RedEDoc lo convierte en
  un documento electrónico válido.
