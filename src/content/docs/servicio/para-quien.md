---
title: Para quién es
description: Empresas que ya tienen un ERP o un sistema propio y necesitan emitir ante la DIAN sin construir el pipeline.
sidebar:
  order: 2
---

Nobelio está pensado para **quien ya tiene un sistema donde ocurre la venta** y solo
necesita que esa venta llegue a la DIAN como documento electrónico válido.

## Encaja bien si…

- Tienes un **ERP, un POS o un software propio** y quieres emitir desde ahí, sin cambiar
  de sistema ni copiar datos a un portal.
- Tu equipo puede **consumir una API REST**: enviar JSON, leer respuestas, guardar el
  identificador que devuelve.
- Emites alguno de los documentos que el servicio cubre: factura de venta, notas crédito
  o débito, documento soporte con su nota de ajuste, o nómina electrónica.
- Puedes conseguir lo que la DIAN pide del lado del emisor: un **certificado digital
  `.p12`** emitido por una entidad autorizada y una **resolución de facturación**.

## Probablemente no encaja si…

- Buscas una **aplicación para facturar a mano**, con formularios y listados. Nobelio es
  una API: no trae interfaz.
- Necesitas **garantías de disponibilidad o soporte contractual**. El servicio es gratuito
  y *best-effort*; ver [Alcance y límites](/servicio/alcance-y-limites/).
- Emites tipos de documento que el servicio todavía no cubre en su flujo de emisión.

## Qué tienes que poner tú

| Requisito | De dónde sale |
| --- | --- |
| Certificado digital `.p12` | Una entidad de certificación autorizada. |
| Resolución de facturación | La DIAN, a nombre del emisor. |
| Datos de habilitación del software | La DIAN: `identificador`, `pin` y `test_set_id`. |
| Un sistema que llame a la API | Tu ERP, tu POS o el desarrollo que lo integre. |

El resto —XML, identificadores, firma, envío, PDF— lo pone Nobelio.
