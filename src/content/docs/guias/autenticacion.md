---
title: Autenticación
description: Llave de API para las integraciones de ERP, JWT para las aplicaciones con usuario, y cómo funciona el alcance por cuenta.
sidebar:
  order: 2
---

La API es **stateless**: no hay sesiones ni cookies. Cada petición se identifica sola, con
una de dos credenciales.

## Llave de API — para integraciones

Es la vía de un ERP o de cualquier sistema que hable con la API sin usuario delante.

```
Authorization: Api-Key <prefijo>.<secreto>
```

La llave tiene dos partes separadas por un punto: el **prefijo**, que identifica la llave,
y el **secreto**, que solo se muestra cuando la llave se crea. Si se pierde, no se
recupera: se crea otra.

```bash
export API_KEY='<prefijo>.<secreto>'

curl -H "Authorization: Api-Key $API_KEY" \
  http://localhost:8000/api/catalogos/tributo/
```

## JWT — para aplicaciones con usuario

Una aplicación con usuario delante canjea sus credenciales por un par de tokens:

```bash
curl -X POST http://localhost:8000/api/seguridad/token/ \
  -H "Content-Type: application/json" \
  -d '{"correo": "persona@empresa.co", "clave": "..."}'
```

y usa el token de acceso en cada petición:

```
Authorization: Bearer <access>
```

Ver [Obtener un token JWT](/api/seguridad/seguridad-token-crear/) en la referencia.

## Cuál usar

| Caso | Credencial |
| --- | --- |
| ERP, integración servidor a servidor, tarea programada | Llave de API |
| Aplicación con inicio de sesión de una persona | JWT |

## Alcance por cuenta

La **cuenta** es el inquilino: agrupa emisores y llaves. Una credencial solo alcanza los
emisores de su propia cuenta.

- Lo que es de otra cuenta **no aparece en los listados**.
- Pedirlo directamente por su id responde **`404`**, no `403`: desde fuera de la cuenta,
  ese recurso no existe.

Los catálogos son la excepción en el otro sentido: son comunes y de **solo lectura**.

## Topes de peticiones

La API limita cuántas peticiones acepta por credencial y por hora. Los valores por defecto
del proyecto son `300/hora` con credencial y `30/hora` sin ella; la instancia publicada
puede tener otros. TODO: confirmar los topes efectivos y qué responde la API al superarlos.

## Cuidados

- El secreto de la llave va donde van los secretos de tu sistema: variable de entorno o
  gestor de secretos, **nunca** en el repositorio ni en el front.
- Una llave por integración y con nombre reconocible: si hay que revocar una, no se cae
  todo lo demás.
- La API no debe llamarse desde el navegador del cliente: la credencial quedaría expuesta.
