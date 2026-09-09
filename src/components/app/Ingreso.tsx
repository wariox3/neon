/**
 * Ingreso al panel.
 *
 * Dos pasos, porque la API los tiene: `token/` valida correo y contraseña, y si
 * la cuenta lleva segundo factor **no** emite sesión —responde un desafío— y la
 * sesión la emite `token/mfa/` al resolverlo. Por eso el estado del componente
 * distingue "credenciales" de "desafío": tratarlos como uno solo es como se
 * acaba dando por iniciada una sesión que el servidor no ha emitido.
 */
import { type SubmitEvent, useState } from 'react';

import { ErrorApi, api } from '../../lib/api';
import { Aviso, Campo, ErrorGeneral, errorDe } from './piezas';

/**
 * Métodos que mandan el código a algún sitio y por tanto admiten reenvío,
 * frente a `totp`, que lo recalcula la aplicación del teléfono. Es el mismo
 * conjunto que `METODOS_ENVIADOS` en `apps/seguridad/models/mfa.py`.
 */
const METODOS_ENVIADOS = ['correo'];

interface Desafio {
  mfa_requerido: true;
  mfa_token: string;
  metodo: string;
}

function esDesafio(respuesta: unknown): respuesta is Desafio {
  return Boolean((respuesta as Desafio)?.mfa_requerido);
}

/** A dónde ir tras entrar: lo que pidió `?volver=`, o los emisores. */
function destino(): string {
  const volver = new URLSearchParams(window.location.search).get('volver');
  // Solo rutas internas del panel: un `volver` absoluto sería un redirector
  // abierto de manual, y esta pantalla es justo la que se enlaza en los correos.
  return volver && volver.startsWith('/app/') && !volver.startsWith('//')
    ? volver
    : '/app/emisores/';
}

export default function Ingreso() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [desafio, setDesafio] = useState<Desafio | null>(null);
  const [codigo, setCodigo] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    setNota(null);
    try {
      const respuesta = await api<unknown>('/api/seguridad/token/', {
        metodo: 'POST',
        cuerpo: { email, password },
      });
      if (esDesafio(respuesta)) {
        setDesafio(respuesta);
        return;
      }
      // Sesión emitida: las cookies ya vienen en la respuesta.
      window.location.href = destino();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  async function resolverDesafio(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!desafio) return;
    setEnviando(true);
    setError(null);
    try {
      await api('/api/seguridad/token/mfa/', {
        metodo: 'POST',
        cuerpo: {
          mfa_token: desafio.mfa_token,
          codigo,
          recordar_dispositivo: recordar,
        },
      });
      window.location.href = destino();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    if (!desafio) return;
    setError(null);
    setNota(null);
    try {
      await api('/api/seguridad/token/mfa/reenviar/', {
        metodo: 'POST',
        cuerpo: { mfa_token: desafio.mfa_token },
      });
      setNota('Te mandamos otro código.');
    } catch (fallo) {
      setError(fallo);
    }
  }

  if (desafio) {
    return (
      <form onSubmit={resolverDesafio}>
        <h1>Confirma que eres tú</h1>
        <p className="panel-guia">
          {METODOS_ENVIADOS.includes(desafio.metodo)
            ? 'Te mandamos un código de un solo uso. Escríbelo aquí.'
            : 'Escribe el código que muestra tu aplicación de autenticación.'}
        </p>

        <ErrorGeneral error={error} />
        {nota && <Aviso tipo="exito">{nota}</Aviso>}

        <Campo
          id="codigo"
          etiqueta="Código"
          error={errorDe(error, 'codigo')}
          ayuda="También sirve uno de tus códigos de respaldo."
        >
          <input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </Campo>

        <div className="campo campo--casilla">
          <input
            id="recordar"
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
          />
          <label htmlFor="recordar">No volver a pedirlo en este navegador</label>
        </div>

        <div className="acciones">
          <button type="submit" disabled={enviando || !codigo}>
            {enviando ? 'Comprobando…' : 'Entrar'}
          </button>
          {METODOS_ENVIADOS.includes(desafio.metodo) && (
            <button type="button" className="enlace" onClick={() => void reenviar()}>
              Mandar otro código
            </button>
          )}
        </div>
      </form>
    );
  }

  const sinConfirmar = error instanceof ErrorApi && error.estado === 403;

  return (
    <form onSubmit={ingresar}>
      <h1>Entrar</h1>
      <p className="panel-guia">
        ¿Todavía no tienes cuenta? <a href="/app/registro/">Regístrate</a>.
      </p>

      <ErrorGeneral error={error} />
      {sinConfirmar && (
        <Aviso>
          <p>
            Si no te llegó el correo de confirmación,{' '}
            <a href="/app/registro/?reenviar=1">pide otro</a>.
          </p>
        </Aviso>
      )}

      <Campo id="email" etiqueta="Correo" error={errorDe(error, 'email')}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Campo>

      <Campo
        id="password"
        etiqueta="Contraseña"
        error={errorDe(error, 'password')}
        ayuda={<a href="/app/recuperar/">¿Olvidaste la contraseña?</a>}
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Campo>

      <div className="acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
