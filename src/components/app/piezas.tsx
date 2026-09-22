/** Piezas que se repiten en todas las pantallas del panel. */
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

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
 * Siempre va el `detail`, que es lo que explica un 401, un 403 o un fallo de
 * red. En un 400 va además la lista de `errores` de la API: los de campo los
 * pinta también cada campo, pero no todos los campos tienen control en el
 * formulario, y un error que no se ve no se puede corregir. Se salta el que
 * repite el `detail`, que es lo que pasa cuando el error es uno solo.
 */
export function ErrorGeneral({ error }: { error: unknown }) {
  if (!error) return null;
  if (!(error instanceof ErrorApi)) {
    return (
      <Aviso>No se pudo conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.</Aviso>
    );
  }
  const lista = error.estado === 400
    ? error.lista.filter((item) => item.mensaje !== error.message)
    : [];
  if (lista.length === 0) return <Aviso>{error.message}</Aviso>;
  return (
    <Aviso>
      <p>{error.message}</p>
      <ul className="aviso__lista">
        {lista.map((item, indice) => <li key={indice}>{item.mensaje}</li>)}
      </ul>
    </Aviso>
  );
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

interface Pestana {
  id: string;
  titulo: string;
  /** Función, no nodo: lo que la pestaña pinta —y lo que pide a la API— espera
   *  a que alguien la abra. */
  render: () => ReactNode;
}

/**
 * Pestañas, con el teclado que espera un lector de pantalla: flechas para
 * moverse entre ellas, `aria-selected` para decir cuál manda y un solo botón en
 * el orden de tabulación.
 */
export function Pestanas({ nombre, etiqueta, pestanas }: {
  nombre: string;
  etiqueta: string;
  pestanas: Pestana[];
}) {
  const [activa, setActiva] = useState(pestanas[0]?.id ?? '');
  const indice = Math.max(0, pestanas.findIndex((pestana) => pestana.id === activa));
  const abierta = pestanas[indice];

  function mover(paso: number) {
    const siguiente = pestanas[(indice + paso + pestanas.length) % pestanas.length];
    setActiva(siguiente.id);
    document.getElementById(`${nombre}-${siguiente.id}`)?.focus();
  }

  if (!abierta) return null;

  return (
    <>
      <div className="pestanas" role="tablist" aria-label={etiqueta}>
        {pestanas.map((pestana) => (
          <button
            key={pestana.id}
            id={`${nombre}-${pestana.id}`}
            type="button"
            role="tab"
            aria-selected={pestana.id === abierta.id}
            aria-controls={`${nombre}-panel`}
            tabIndex={pestana.id === abierta.id ? 0 : -1}
            onClick={() => setActiva(pestana.id)}
            onKeyDown={(evento) => {
              if (evento.key === 'ArrowRight') mover(1);
              else if (evento.key === 'ArrowLeft') mover(-1);
              else return;
              evento.preventDefault();
            }}
          >
            {pestana.titulo}
          </button>
        ))}
      </div>
      <div
        id={`${nombre}-panel`}
        role="tabpanel"
        aria-labelledby={`${nombre}-${abierta.id}`}
        tabIndex={0}
      >
        {abierta.render()}
      </div>
    </>
  );
}

/**
 * Un valor que es una credencial: se enseña solo si se pide.
 *
 * No es un secreto para quien mira —la API se lo acaba de dar—, pero sí para
 * quien pase por detrás o mire la pantalla compartida.
 */
export function Secreto({ valor }: { valor: string }) {
  const [visible, setVisible] = useState(false);
  if (!valor) return <>—</>;
  return (
    <span className="secreto">
      <span className="monospacio">
        {visible ? valor : '•'.repeat(Math.min(valor.length, 12))}
      </span>
      <button type="button" className="enlace" onClick={() => setVisible(!visible)}>
        {visible ? 'Ocultar' : 'Ver'}
      </button>
    </span>
  );
}

/**
 * Ventana modal, sobre el `<dialog>` del navegador.
 *
 * `showModal()` trae de serie lo que a mano cuesta: el foco atrapado dentro,
 * Escape para cerrar y el resto de la página inerte. Quien la usa decide si está
 * abierta; el cierre que hace el navegador por su cuenta (Escape) llega por
 * `alCerrar`.
 *
 * El contenido solo se monta mientras está abierta, para que cada vez arranque
 * de cero y no con lo que se dejó a medias la anterior. Por lo mismo, un clic
 * fuera no la cierra: se perdería lo tecleado por un descuido.
 */
export function Modal({ abierta, titulo, alCerrar, children }: {
  abierta: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const actual = dialogo.current;
    if (!actual) return;
    if (abierta && !actual.open) actual.showModal();
    else if (!abierta && actual.open) actual.close();
  }, [abierta]);

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby={idTitulo} onClose={alCerrar}>
      {abierta && (
        <>
          <div className="modal__cabecera">
            <h2 id={idTitulo}>{titulo}</h2>
            <button type="button" className="secundario" aria-label="Cerrar" onClick={alCerrar}>
              ×
            </button>
          </div>
          <div className="modal__cuerpo">{children}</div>
        </>
      )}
    </dialog>
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
 *
 * `autoComplete="off"` es para las claves que no son de la cuenta —la del
 * `.p12`, por ejemplo—: se teclean una vez, no se vuelven a usar, y no tiene
 * sentido que el gestor se ofrezca a guardarlas.
 */
export function EntradaContrasena({
  id,
  valor,
  onCambio,
  autoComplete,
  autoFocus = false,
  requerido = true,
  maxLength,
  name,
}: {
  id: string;
  valor: string;
  onCambio: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password' | 'off';
  autoFocus?: boolean;
  requerido?: boolean;
  maxLength?: number;
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
        required={requerido}
        maxLength={maxLength}
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
