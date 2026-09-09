/**
 * Lo que el servidor rechazaría **con seguridad**, comprobado antes de pedirlo.
 *
 * No es una copia de las reglas del backend: es el subconjunto del que no hay
 * duda. Django además rechaza cualquiera de sus 20 000 contraseñas comunes, y
 * esa lista no cabe en el navegador; ese caso lo sigue respondiendo la API.
 *
 * El motivo de tenerlo aquí es el límite de peticiones: cada intento fallido
 * gasta cuota, y quedarse regulado varios minutos por haber probado «12345678»
 * es una forma tonta de perder el registro.
 *
 * Lo usan el alta y el restablecimiento, que comparten validadores.
 */

/** Mínimo de la plataforma. No son los ocho de fábrica de Django. */
export const MINIMO = 10;

export const AYUDA_CONTRASENA =
  `Al menos ${MINIMO} caracteres, y que no sea una contraseña común.`;

/**
 * Las contraseñas más usadas, de la lista con la que Django rechaza («common
 * password»). Aquí solo caben las que la gente teclea de verdad.
 */
const COMUNES = new Set([
  'password', 'password1', 'password123', 'contrasena', 'contraseña', 'qwerty123',
  'qwertyuiop', 'abc12345', 'iloveyou', 'princess', 'football', 'baseball',
  'sunshine', 'welcome1', 'admin123', 'letmein1', 'monkey123', 'trustno1',
]);

/**
 * El problema de la contraseña, o `undefined` si hay que dejar decidir a la API.
 *
 * `email` es opcional: al restablecer no se sabe de quién es el enlace.
 */
export function problemaDeContrasena(password: string, email?: string): string | undefined {
  if (password.length < MINIMO) {
    return `Tiene que tener al menos ${MINIMO} caracteres.`;
  }
  if (/^\d+$/.test(password)) return 'No puede ser solo números.';

  const minuscula = password.toLowerCase();
  if (COMUNES.has(minuscula)) return 'Es una de las contraseñas más usadas. Elige otra.';

  const correo = email?.trim().toLowerCase();
  if (correo && (minuscula === correo || minuscula === correo.split('@')[0])) {
    return 'No puede ser tu correo.';
  }
  return undefined;
}
