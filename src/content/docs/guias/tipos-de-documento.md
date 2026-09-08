---
title: Tipos de documento
description: En qué se diferencian factura, notas, documento soporte, nota de ajuste y nómina, y qué cambia en el payload de cada uno.
sidebar:
  order: 5
---

Todos los tipos usan el mismo endpoint y el mismo flujo
([Flujo de emisión](/guias/flujo-emision/)). Lo que cambia es el `documento_tipo` y unos
pocos campos. Esta página recoge esas diferencias.

## Factura de venta

El caso base: lleva `numero_resolucion`, `prefijo` y `consecutivo`, y su identificador es
el **CUFE**.

## Notas crédito y débito

`documento_tipo` = `nota_credito` o `nota_debito`, y además:

- **`documento_referencia`** — el id de la factura que corrigen.
- **`concepto_correccion`** — de la lista propia de su tipo.

Su identificador es el **CUDE**, y **no llevan resolución**: heredan la numeración del
documento que corrigen.

## Documento soporte

Para las **adquisiciones a sujetos no obligados a facturar**. Mismo endpoint, pero con
tres diferencias que no se ven mirando la forma del payload:

### 1. El bloque `adquiriente` es el vendedor

En el documento soporte quien emite es **el comprador**. Así que en `adquiriente` van los
datos del no obligado al que se le compró. En el XML ese bloque sale como
`AccountingSupplierParty`, y el `emisor` va como `AccountingCustomerParty`.

El campo se llama `adquiriente` porque la fila es la misma para todos los tipos de
documento; no porque ahí vaya un comprador.

### 2. Lleva resolución de numeración propia

Distinta de la de facturación: la DIAN autoriza el rango contra `InvoiceTypeCode=05`. Se
registra con su `tipo_factura` (el código `05` del catálogo) y se pasa su
`numero_resolucion` al crear el documento. No necesita clave técnica: el CUDS se calcula
con el PIN del software.

### 3. Las retenciones son un impuesto más de la línea

Con el tributo `05` (ReteIVA) o `06` (ReteFuente). Se reconocen por el código: **no suman
al `total_a_pagar`** y en el XML salen en su propio `cac:WithholdingTaxTotal`.

### Su identificador es el CUDS

El **CUDS** (`CUDS-SHA384`) no es el CUDE: su composición lleva un solo impuesto en vez de
tres, y el vendedor antes que el adquiriente. El `CustomizationID` —`10` residente, `11`
no residente— se deduce del país del vendedor.

:::note
El documento soporte **no tiene habilitación propia**: con el Set de Pruebas de la factura
aceptado, el emisor ya queda habilitado también para emitirlo.
:::

:::caution[Pendiente]
La representación gráfica del documento soporte todavía usa los rótulos de la factura.
:::

## Nota de ajuste (tipo 95)

Es al documento soporte lo que la nota crédito es a la factura.

- `documento_tipo` = `nota_ajuste`.
- `documento_referencia` — el documento soporte que ajusta.
- `concepto_correccion` — de su **propia** lista (`ConceptoNotaAjuste`): `1` devolución
  parcial, `2` anulación, `3` rebaja o descuento, `4` ajuste de precio, `5` otros.

Repite las partes del documento soporte —el `adquiriente` sigue siendo el vendedor— y con
ellas las retenciones y la fecha de compra de cada línea. Pero, como toda nota, hereda la
numeración del documento que corrige: **no lleva resolución** ni `InvoiceControl`.

Su raíz es `CreditNote` con `CreditNoteTypeCode=95`, su identificador es un **CUDS** y el
`BillingReference` apunta al CUDS del documento soporte ajustado.

## Nómina electrónica

Aceptada por la DIAN en habilitación. Su identificador es el **CUNE**, que es el único sin
un ejemplo oficial que cuadre —el del anexo no reproduce su propio hash—, así que lo que
está fijado es su composición, anclada a la nómina que la DIAN aceptó.

No es UBL: tiene sus propios XSD. Y hay un detalle que cuesta caro descubrir solo: el
**orden de las declaraciones de namespace de la raíz** debe copiar el de la ejemplificación
oficial, o la DIAN responde `ZE02`.

TODO: documentar el payload de nómina (empleado, conceptos, devengados y deducciones)
cuando el esquema OpenAPI real lo describa.

## Resumen

| Tipo | `documento_tipo` | Identificador | Resolución | Referencia |
| --- | --- | --- | --- | --- |
| Factura de venta | `factura_venta` | CUFE | Propia | — |
| Nota crédito | `nota_credito` | CUDE | Hereda | Obligatoria |
| Nota débito | `nota_debito` | CUDE | Hereda | Obligatoria |
| Documento soporte | `documento_soporte` | CUDS | Propia (tipo 05) | — |
| Nota de ajuste | `nota_ajuste` | CUDS | Hereda | Obligatoria |
| Nómina | `nomina` | CUNE | — | — |
