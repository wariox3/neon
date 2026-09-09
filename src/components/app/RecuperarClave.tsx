/**
 * Pedir el enlace para restablecer la contraseña.
 *
 * La API responde **siempre** 200 con el mismo texto, exista o no la cuenta, a
 * propósito: si la respuesta cambiara, el endpoint sería un comprobador de quién
 * está registrado en la plataforma. Por eso esta pantalla no deduce nada de la
 * respuesta y nunca dice «ese correo no existe»: enseña el mensaje tal cual.
 */
import { type SubmitEvent, useState } from 'react';

import { api } from '../../lib/api';
import { Aviso, AvisoEspera, Campo, ErrorGeneral, errorDe, useEspera } from './piezas';

interface Pedido {
  detail: string;
}

export default function RecuperarClave() {
  const [email, setEmail] = useState('');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const espera = useEspera(error);

  async function pedir(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (espera > 0) return;
    setEnviando(true);
    setError(null);
    try {
      setPedido(
        await api<Pedido>('/api/seguridad/token/recuperar/', {
          metodo: 'POST',
          cuerpo: { email },
        }),
      );
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <>
        <h1>Revisa tu correo</h1>
        <Aviso tipo="exito">
          <p>{pedido.detail}</p>
        </Aviso>
        <p className="panel-guia">
          El enlace lleva a una página donde eliges la contraseña nueva. Si no llega,
          revisa la carpeta de correo no deseado antes de pedir otro.
        </p>
        <p>
          <a href="/app/ingresar/">Volver a entrar</a>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={pedir}>
      <h1>Recuperar la contraseña</h1>
      <p className="panel-guia">
        Escribe tu correo y te mandamos un enlace para elegir una nueva.
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

      <div className="acciones">
        <button type="submit" disabled={enviando || espera > 0}>
          {espera > 0 ? `Espera ${espera} s` : enviando ? 'Enviando…' : 'Mandar el enlace'}
        </button>
        <a href="/app/ingresar/">Volver</a>
      </div>
    </form>
  );
}
