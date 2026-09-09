/**
 * Alta de una persona.
 *
 * El registro crea la persona y manda un correo; no abre sesión. Hasta que el
 * correo se confirme, ingresar responde 403, así que la pantalla termina
 * diciendo que hay que ir a la bandeja de entrada — no redirigiendo al panel.
 */
import { type SubmitEvent, useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { AYUDA_CONTRASENA, problemaDeContrasena } from '../../lib/contrasena';
import {
  Aviso,
  AvisoEspera,
  Campo,
  EntradaContrasena,
  ErrorGeneral,
  errorDe,
  useEspera,
} from './piezas';

interface Alta {
  email: string;
  correo_enviado: boolean;
  detail: string;
}

export default function Registro() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alta, setAlta] = useState<Alta | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [errorPassword, setErrorPassword] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const espera = useEspera(error);

  // `?reenviar=1` llega desde el ingreso, cuando falta confirmar el correo.
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  useEffect(() => {
    setReenviando(new URLSearchParams(window.location.search).has('reenviar'));
  }, []);

  async function registrar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (espera > 0) return;

    const problema = problemaDeContrasena(password, email);
    if (problema) {
      setErrorPassword(problema);
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const respuesta = await api<Alta>('/api/seguridad/registro/', {
        metodo: 'POST',
        cuerpo: { email, password },
      });
      setAlta(respuesta);
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (espera > 0) return;
    setEnviando(true);
    setError(null);
    try {
      await api('/api/seguridad/registro/reenviar/', {
        metodo: 'POST',
        cuerpo: { email },
      });
      setReenviado(true);
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  if (alta) {
    return (
      <>
        <h1>Revisa tu correo</h1>
        <Aviso tipo={alta.correo_enviado ? 'exito' : 'error'}>
          <p>{alta.detail}</p>
        </Aviso>
        <p className="panel-guia">
          Mandamos un enlace de confirmación a <strong>{alta.email}</strong>. Vence en tres
          días. Hasta que lo abras no podrás entrar.
        </p>
        <p>
          <a href="/app/registro/?reenviar=1">Pedir otro enlace</a> ·{' '}
          <a href="/app/ingresar/">Ir a entrar</a>
        </p>
      </>
    );
  }

  if (reenviando) {
    return (
      <form onSubmit={reenviar}>
        <h1>Reenviar la confirmación</h1>
        <p className="panel-guia">
          Escribe el correo con el que te registraste y te mandamos otro enlace.
        </p>

        {espera > 0 ? <AvisoEspera segundos={espera} /> : <ErrorGeneral error={error} />}
        {reenviado && (
          <Aviso tipo="exito">
            Si esa dirección tiene una cuenta sin confirmar, el enlace va en camino.
          </Aviso>
        )}

        <Campo id="email" etiqueta="Correo" error={errorDe(error, 'email')}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>

        <div className="acciones">
          <button type="submit" disabled={enviando || espera > 0}>
            {espera > 0 ? `Espera ${espera} s` : enviando ? 'Enviando…' : 'Mandar el enlace'}
          </button>
          <a href="/app/ingresar/">Volver</a>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={registrar}>
      <h1>Crear una cuenta</h1>
      <p className="panel-guia">
        ¿Ya tienes una? <a href="/app/ingresar/">Entra</a>.
      </p>

      {espera > 0 ? <AvisoEspera segundos={espera} /> : <ErrorGeneral error={error} />}

      <Campo id="email" etiqueta="Correo" error={errorDe(error, 'email')}>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Campo>

      {/*
        El backend, cuando el correo ya está dado de alta, responde «Inicia sesión
        o recupera la contraseña». Aquí se le ponen los dos destinos: el mensaje
        los nombra pero no los enlaza. Se muestran ante cualquier error del campo
        para no depender de que el texto exacto del backend no cambie.
      */}
      {errorDe(error, 'email') && (
        <p className="panel-guia">
          <a href="/app/ingresar/">Entrar</a> ·{' '}
          <a href="/app/recuperar/">Recuperar la contraseña</a>
        </p>
      )}

      <Campo
        id="password"
        etiqueta="Contraseña"
        error={errorPassword ?? errorDe(error, 'password')}
        ayuda={AYUDA_CONTRASENA}
      >
        <EntradaContrasena
          id="password"
          autoComplete="new-password"
          valor={password}
          onCambio={(valor) => {
            setPassword(valor);
            setErrorPassword(undefined);
          }}
        />
      </Campo>

      <div className="acciones">
        <button type="submit" disabled={enviando || espera > 0}>
          {espera > 0 ? `Espera ${espera} s` : enviando ? 'Creando…' : 'Crear la cuenta'}
        </button>
      </div>
    </form>
  );
}
