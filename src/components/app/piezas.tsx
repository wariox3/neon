/** Piezas que se repiten en todas las pantallas del panel. */
import { type ReactNode, useEffect, useState } from 'react';

import { ErrorApi } from '../../lib/api';
import type { Sesion } from '../../lib/sesion';

/** Mensaje de error de una operación entera (no de un campo). */
export function Aviso({ children, tipo = 'error' }: {
  children: ReactNode;
  tipo?: 'error' | 'exito';
}) {
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/**
 * El error de una operación, en prosa.
 *
 * Los errores por campo los pinta cada campo; aquí queda el `detail`, que es lo
 * que explica un 401, un 403 o un fallo de red.
 */
export function ErrorGeneral({ error }: { error: unknown }) {
  if (!error) return null;
  const mensaje = error instanceof ErrorApi
    ? error.message
    : 'No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.';
  return <Aviso>{mensaje}</Aviso>;
}

interface CampoProps {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactNode;
}

/** Etiqueta + control + su error, con los `aria-*` ya puestos. */
export function Campo({ id, etiqueta, error, ayuda, children }: CampoProps) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda && <span className="campo__ayuda">{ayuda}</span>}
      {error && <span className="campo__error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

/** Marca de sí/no para las columnas booleanas de las tablas. */
export function Marca({ valor, si = 'Sí', no = 'No' }: {
  valor: boolean;
  si?: string;
  no?: string;
}) {
  return (
    <span className={`etiqueta etiqueta--${valor ? 'si' : 'no'}`}>
      {valor ? si : no}
    </span>
  );
}

export function Cargando({ que = 'Cargando…' }: { que?: string }) {
  return <p className="vacio">{que}</p>;
}

/**
 * Lo que se pinta mientras la sesión no está resuelta.
 *
 * El caso que importa es `error`: sin esto, una API caída —o una petición que el
 * navegador bloquea por CORS— deja la página en "Cargando…" para siempre, que es
 * la forma más rápida de perder una tarde buscando el fallo en el sitio
 * equivocado.
 */
export function SesionNoLista({ sesion }: { sesion: Sesion }) {
  if (sesion.estado === 'error') {
    return (
      <Aviso>
        <p>
          <strong>No se pudo hablar con la API de RedEDoc.</strong>{' '}
          {sesion.error instanceof ErrorApi
            ? sesion.error.message
            : 'La petición no llegó a completarse.'}
        </p>
        <p>
          Si el servicio está levantado, lo siguiente que hay que mirar es si permite el
          origen de este sitio: hace falta <code>CORS_ALLOWED_ORIGINS</code> con esta
          dirección y <code>CORS_ALLOW_CREDENTIALS=True</code>. La consola del navegador lo
          dice con todas las letras.
        </p>
      </Aviso>
    );
  }
  // 'anonimo' dura lo justo: `useSesion` ya está redirigiendo al ingreso.
  return <Cargando />;
}

/**
 * Campo de contraseña con «Ver» / «Ocultar».
 *
 * El interruptor solo cambia el `type` del input, así que el gestor de
 * contraseñas del navegador sigue reconociéndolo por su `autoComplete`.
 * Arranca oculto siempre: quien lo enseña lo decide, y no se recuerda entre
 * pantallas para no dejar la contraseña a la vista sin querer.
 */
export function EntradaContrasena({
  id,
  valor,
  onCambio,
  autoComplete,
  autoFocus = false,
  name,
}: {
  id: string;
  valor: string;
  onCambio: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="campo-clave">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
      <button
        type="button"
        className="campo-clave__ver"
        aria-pressed={visible}
        aria-controls={id}
        onClick={() => setVisible((previo) => !previo)}
      >
        {visible ? 'Ocultar' : 'Ver'}
      </button>
    </div>
  );
}

/**
 * Cuenta atrás de un 429.
 *
 * Mientras quede tiempo el formulario no deja reintentar: cada intento durante
 * la regulación no solo falla, sino que en algunos backends reinicia la espera.
 */
export function useEspera(error: unknown): number {
  const [restante, setRestante] = useState(0);

  useEffect(() => {
    if (error instanceof ErrorApi && error.segundosDeEspera) {
      setRestante(error.segundosDeEspera);
    }
  }, [error]);

  useEffect(() => {
    if (restante <= 0) return;
    const id = setTimeout(() => setRestante(restante - 1), 1000);
    return () => clearTimeout(id);
  }, [restante]);

  return restante;
}

/** El aviso que acompaña a `useEspera`. */
export function AvisoEspera({ segundos }: { segundos: number }) {
  return (
    <Aviso>
      Demasiados intentos seguidos. Puedes volver a probar en{' '}
      <strong>{segundos} s</strong>.
    </Aviso>
  );
}

/** Saca de `ErrorApi` los errores del campo pedido. */
export function errorDe(error: unknown, campo: string): string | undefined {
  return error instanceof ErrorApi ? error.de(campo) : undefined;
}
