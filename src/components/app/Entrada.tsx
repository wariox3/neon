/** Reparte a quien llega a `/app/`: a sus emisores, o al ingreso. */
import { useEffect } from 'react';

import { useSesion } from '../../lib/sesion';
import { SesionNoLista } from './piezas';

export default function Entrada() {
  // `exigir` va apagado: la redirección al ingreso la hace este mismo
  // componente, y hacerlo dos veces desde sitios distintos es cómo se acaba
  // pisando una navegación con otra.
  const sesion = useSesion(false);

  useEffect(() => {
    if (sesion.estado === 'autenticado') window.location.replace('/app/emisores/');
    if (sesion.estado === 'anonimo') window.location.replace('/app/ingresar/');
  }, [sesion.estado]);

  return <SesionNoLista sesion={sesion} />;
}
