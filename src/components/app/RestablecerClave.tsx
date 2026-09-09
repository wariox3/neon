/**
 * Aterrizaje del enlace de recuperación: fijar la contraseña nueva.
 *
 * La ruta es `/restablecer-clave`, en la raíz y no bajo `/app/`, porque es la
 * que `URL_RESTABLECER_CLAVE` trae en el backend. El token viaja en la query.
 *
 * A diferencia de `/verificar-correo`, aquí **no se canjea al cargar**: hace
 * falta que la persona escriba la contraseña. El token solo se gasta al enviar.
 *
 * Restablecer no abre sesión, así que la pantalla termina mandando al ingreso.
 */
import { type SubmitEvent, useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { AYUDA_CONTRASENA, problemaDeContrasena } from '../../lib/contrasena';
import { Aviso, AvisoEspera, Campo, ErrorGeneral, errorDe, useEspera } from './piezas';

export default function RestablecerClave() {
  // `undefined` mientras no se ha leído la query; `null` si no venía.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [errorPassword, setErrorPassword] = useState<string | undefined>();
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const espera = useEspera(error);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  async function restablecer(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (espera > 0 || !token) return;

    const problema = problemaDeContrasena(password);
    if (problema) {
      setErrorPassword(problema);
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      await api('/api/seguridad/token/restablecer/', {
        metodo: 'POST',
        cuerpo: { token, password },
      });
      setListo(true);
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <>
        <h1>Contraseña actualizada</h1>
        <Aviso tipo="exito">Ya puedes entrar con la nueva.</Aviso>
        <div className="acciones">
          <a href="/app/ingresar/"><button type="button">Entrar</button></a>
        </div>
      </>
    );
  }

  if (token === undefined) return null;
  if (!token) return <SinToken />;

  return (
    <form onSubmit={restablecer}>
      <h1>Elige una contraseña nueva</h1>

      {espera > 0 ? <AvisoEspera segundos={espera} /> : <ErrorGeneral error={error} />}

      <Campo
        id="password"
        etiqueta="Contraseña nueva"
        error={errorPassword ?? errorDe(error, 'password')}
        ayuda={AYUDA_CONTRASENA}
      >
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrorPassword(undefined);
          }}
        />
      </Campo>

      <div className="acciones">
        <button type="submit" disabled={enviando || espera > 0}>
          {espera > 0 ? `Espera ${espera} s` : enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <p className="panel-guia">
        Si el enlace ya caducó, <a href="/app/recuperar/">pide uno nuevo</a>.
      </p>
    </form>
  );
}

function SinToken() {
  return (
    <>
      <h1>El enlace está incompleto</h1>
      <Aviso>Le falta el token. Copia la dirección entera desde el correo.</Aviso>
      <div className="acciones">
        <a href="/app/recuperar/"><button type="button">Pedir otro enlace</button></a>
      </div>
    </>
  );
}
