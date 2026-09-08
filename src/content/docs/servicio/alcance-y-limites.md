---
title: Alcance y límites
description: El servicio es gratuito y best-effort. Qué cubre, qué no promete y qué queda pendiente.
sidebar:
  order: 3
---

## Gratis y sin garantías

Nobelio se ofrece **sin costo**. A cambio, y esto conviene leerlo antes de integrarlo:

- **No hay acuerdo de nivel de servicio (SLA).** No se compromete disponibilidad,
  tiempo de respuesta ni ventana de mantenimiento.
- **No hay soporte garantizado.** No hay tiempos de atención comprometidos ni canal con
  respuesta asegurada.
- **No hay garantía de continuidad.** El servicio puede cambiar o dejar de estar
  disponible.
- **La responsabilidad tributaria sigue siendo del emisor.** Nobelio es una herramienta
  para emitir; no sustituye la obligación de facturar correctamente ni la asesoría
  contable.

Si tu operación no tolera esas condiciones, no la construyas sobre un servicio gratuito
sin SLA — el de nadie, tampoco este.

## Límites técnicos conocidos

- **Topes de peticiones.** La API limita el número de peticiones por credencial. Los
  valores por defecto del proyecto son `300/hora` con credencial y `30/hora` sin ella,
  pero la instancia publicada puede tener otros. TODO: confirmar los topes efectivos del
  servicio publicado.
- **Un software DIAN activo por emisor.** Registrar uno nuevo jubila el anterior.
- **Alcance por cuenta.** Cada credencial solo alcanza los emisores de su cuenta: lo ajeno
  no aparece en los listados y responde `404`.

## Pendientes reconocidos

Cosas que el proyecto declara abiertas, para que nadie se lleve una sorpresa:

- La **representación gráfica del documento soporte** todavía usa los rótulos de la
  factura.
- El **código QR** aún no se imprime en todas las páginas de la representación gráfica.
- Del sobre SOAP quedan por confirmar la **canonicalización exclusiva** y el
  `X509IssuerName`.

## Lo que no está resuelto aquí

- **Cómo se solicita una cuenta y una llave de API.** Hoy las crea el equipo del servicio
  por línea de comandos. TODO: documentar el canal de alta para el público.
- **La URL del servicio publicado.** TODO: fijarla y reemplazar `http://localhost:8000` en
  los ejemplos.
- **Canal de contacto.** TODO.
