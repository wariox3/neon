---
title: Flujo de emisión
description: Crear el documento, emitirlo, enviarlo a la DIAN, consultar el estado y descargar el XML y el PDF.
sidebar:
  order: 4
---

Con el emisor habilitado, emitir es una secuencia de llamadas siempre igual, cambie el
tipo de documento que cambie.

```
crear → emitir → enviar → (consultar) → XML y PDF
```

## 1. Crear el documento

El documento se registra con su receptor, sus líneas y sus impuestos. **Los totales se
calculan a partir de los detalles**: no se envían.

```bash
curl -X POST http://localhost:8000/api/documentos/documento/ \
  -H "Content-Type: application/json" -H "Authorization: Api-Key $API_KEY" \
  -d '{
    "documento_tipo": "<id-tipo>",
    "emisor": "<id-emisor>",
    "numero_resolucion": "18760000001",
    "adquiriente": {
      "razon_social": "Cliente Demo",
      "tipo_identificacion": 1,
      "numero_identificacion": "800199436",
      "digito_verificacion": "6",
      "tipo_organizacion": 1, "pais": 1
    },
    "prefijo": "SETP", "consecutivo": 990000001, "numero": "SETP990000001",
    "fecha_emision": "2026-06-21", "hora_emision": "10:00:00",
    "moneda": 1,
    "detalles": [
      {
        "numero_linea": 1, "descripcion": "Producto demo",
        "cantidad": "1", "unidad_medida": 1,
        "valor_unitario": "1000000", "valor_total": "1000000.00",
        "impuestos": [
          {"tributo": 1, "base_gravable": "1000000.00", "tarifa": "19.00", "valor": "190000.00"}
        ]
      }
    ]
  }'
```

Tres cosas que conviene tener claras:

- **`documento_tipo`** es el *id* de la fila cuyo código es `factura_venta`,
  `nota_credito`, `nota_debito`, `documento_soporte`, `nota_ajuste` o `nomina`.
- **La numeración se valida contra la resolución.** El `prefijo` y el `consecutivo` tienen
  que caber en el rango autorizado, o la respuesta es `400`.
- **El adquiriente va dentro del documento.** No hay cartera de clientes ni endpoint
  propio: cada documento guarda su copia del receptor, que es la que queda firmada en el
  XML y entra en el CUFE. Corregir un cliente después no reescribe lo ya emitido, y así
  debe ser.

## 2. Emitir

Genera el XML UBL, calcula el identificador y lo firma.

```bash
curl -X POST http://localhost:8000/api/documentos/documento/<id>/emitir/ \
  -H "Authorization: Api-Key $API_KEY"
# → { "estado": "firmado", "cufe_cude": "8bb918b1...f5bd9b4" }
```

Hasta aquí no ha salido nada hacia la DIAN: el documento está firmado y listo.

## 3. Enviar a la DIAN

```bash
curl -X POST http://localhost:8000/api/documentos/documento/<id>/enviar/ \
  -H "Authorization: Api-Key $API_KEY"
# → { "estado": "...", "track_id": "...", "es_valido": true/false, "errores": [...] }
```

El documento queda en uno de tres estados:

| Estado | Significa |
| --- | --- |
| `aceptado` | La DIAN lo validó. |
| `rechazado` | La DIAN lo rechazó; `errores` dice por qué. |
| `enviado` | La DIAN todavía no ha resuelto. |

## 4. Consultar, si quedó en `enviado`

Dos llamadas distintas, y la diferencia importa:

```bash
# Consulta sin efectos: devuelve lo que dice la DIAN, no toca el documento.
curl -H "Authorization: Api-Key $API_KEY" \
  http://localhost:8000/api/documentos/documento/<id>/consultar/

# Aplica el resultado al documento (solo si está enviado o rechazado).
curl -X POST -H "Authorization: Api-Key $API_KEY" \
  http://localhost:8000/api/documentos/documento/<id>/actualizar-estado/
```

Para un panel o un monitoreo, `consultar`. Para cerrar el ciclo y dejar el documento en su
estado definitivo, `actualizar-estado`.

## 5. Descargar los artefactos

```bash
curl -H "Authorization: Api-Key $API_KEY" \
  http://localhost:8000/api/documentos/documento/<id>/xml/ -o factura.xml

curl -H "Authorization: Api-Key $API_KEY" \
  http://localhost:8000/api/documentos/documento/<id>/pdf/ -o factura.pdf
```

El XML firmado es el documento con valor legal. El PDF es la representación gráfica, con
su código QR.

:::caution[Pendiente]
El QR todavía no se imprime en todas las páginas de la representación gráfica.
:::
