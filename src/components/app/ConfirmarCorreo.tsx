/**
 * Aterrizaje del enlace del correo de confirmación.
 *
 * La ruta es `/verificar-correo`, en la raíz y no bajo `/app/`, porque es la que
 * `URL_VERIFICACION_CORREO` ya trae por defecto en el backend. El token viaja en
 * la query y se canjea en cuanto carga la página.
 */
import { useEffect, useRef, useState } from 'react';

import { api } from '../../lib/api';
import { Aviso, Cargando, ErrorGeneral } from './piezas';

type Estado =
  | { paso: 'comprobando' }
  | { paso: 'listo' }
  | { paso: 'fallo'; error: unknown }
  | { paso: 'sin-token' };

export default function ConfirmarCorreo() {
  const [estado, setEstado] = useState<Estado>({ paso: 'comprobando' });
  // En desarrollo React monta dos veces; sin esto el token se canjearía dos
  // veces y la segunda llamada respondería que ya no vale.
  const canjeado = useRef(false);

  useEffect(() => {
    if (canjeado.current) return;
    canjeado.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setEstado({ paso: 'sin-token' });
      return;
    }

    api('/api/seguridad/registro/verificar/', { metodo: 'POST', cuerpo: { token } })
      .then(() => setEstado({ paso: 'listo' }))
      .catch((error: unknown) => setEstado({ paso: 'fallo', error }));
  }, []);

  if (estado.paso === 'comprobando') {
    return <Cargando que="Confirmando tu correo…" />;
  }

  if (estado.paso === 'listo') {
    return (
      <>
        <h1>Correo confirmado</h1>
        <Aviso tipo="exito">Tu cuenta ya está lista.</Aviso>
        <div className="acciones">
          <a href="/app/ingresar/"><button type="button">Entrar</button></a>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>No pudimos confirmar el correo</h1>
      {estado.paso === 'sin-token' ? (
        <Aviso>El enlace está incompleto: le falta el token.</Aviso>
      ) : (
        <ErrorGeneral error={estado.error} />
      )}
      <p className="panel-guia">
        Los enlaces vencen a los tres días, y solo sirve el último que se pidió.
      </p>
      <div className="acciones">
        <a href="/app/registro/?reenviar=1"><button type="button">Pedir otro enlace</button></a>
      </div>
    </>
  );
}
