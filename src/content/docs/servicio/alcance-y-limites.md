---
title: Alcance y límites
description: El servicio es gratuito y best-effort. Qué cubre, qué no promete y qué queda pendiente.
sidebar:
  order: 3
---

## Gratis y sin garantías

RedEDoc se ofrece **sin costo**. A cambio, y esto conviene leerlo antes de integrarlo:

- **No hay acuerdo de nivel de servicio (SLA).** No se compromete disponibilidad,
  tiempo de respuesta ni ventana de mantenimiento.
- **No hay soporte garantizado.** No hay tiempos de atención comprometidos ni canal con
  respuesta asegurada.
- **No hay garantía de continuidad.** El servicio puede cambiar o dejar de estar
  disponible.
- **La responsabilidad tributaria sigue siendo del emisor.** RedEDoc es una herramienta
  para emitir; no sustituye la obligación de facturar correctamente ni la asesoría
  contable.

Si tu operación no tolera esas condiciones, no la construyas sobre un servicio gratuito
sin SLA — el de nadie, tampoco este.

## Límites técnicos conocidos

- **Topes de peticiones.** La API limita el número de peticiones por credencial. Los
  valores por defecto del proyecto son `300/hora` con credencial y `30/hora` sin ella, con
  topes más estrechos en registro, ingreso y segundo factor (ver
  [Autenticación](/guias/autenticacion/)). La instancia publicada puede tener otros. TODO:
  confirmar los topes efectivos del servicio publicado.
- **Un software DIAN activo por emisor.** Registrar uno nuevo jubila el anterior.
- **Un NIT, un emisor.** La identificación es única en toda la plataforma: el mismo NIT no
  puede estar dado de alta dos veces, ni siquiera a nombre de personas distintas.
- **Alcance por dueño.** Cada credencial alcanza los emisores que su dueño posee, más los
  que le hayan compartido: lo ajeno no aparece en los listados y responde `404`.
- **La aplicación web y la API comparten dominio.** La sesión del navegador viaja en
  cookies `SameSite=Lax`, así que un front alojado en otro dominio registrable no puede
  usarla. Las integraciones servidor a servidor no tienen esa restricción.

## Pendientes reconocidos

Cosas que el proyecto declara abiertas, para que nadie se lleve una sorpresa:

- La **representación gráfica del documento soporte** todavía usa los rótulos de la
  factura.
- El **código QR** aún no se imprime en todas las páginas de la representación gráfica.
- Del sobre SOAP quedan por confirmar la **canonicalización exclusiva** y el
  `X509IssuerName`.

## Lo que no está resuelto aquí

- **El esquema de la API es provisional.** La referencia de `/api/` se genera hoy desde un
  esquema de ejemplo escrito a mano; las rutas y los campos van a cambiar cuando el
  servicio exponga el suyo. Cada página generada lo avisa.
