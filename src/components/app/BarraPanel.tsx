/** Navegación del panel: dónde estoy, quién soy y cómo salgo. */
import { useEffect, useState } from 'react';

import { cerrarSesion, useSesion } from '../../lib/sesion';

const ENLACES = [
  { href: '/app/emisores/', texto: 'Emisores' },
  { href: '/app/llaves/', texto: 'Llaves de API' },
  { href: '/', texto: 'Documentación' },
];

export default function BarraPanel() {
  // La sesión no se exige aquí: de eso se encarga la isla de cada página. Si la
  // barra redirigiera también, dos redirecciones competirían por la misma pestaña.
  const sesion = useSesion(false);
  const [ruta, setRuta] = useState('');
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => setRuta(window.location.pathname), []);

  return (
    <header className="panel-barra">
      <a className="panel-barra__marca marca" href="/app/" translate="no">
        <span className="marca__red">Red</span>
        <span className="marca__e">E</span>
        <span className="marca__doc">Doc</span>
      </a>
      <nav className="panel-barra__enlaces">
        {ENLACES.map(({ href, texto }) => (
          <a
            key={href}
            href={href}
            aria-current={href !== '/' && ruta.startsWith(href) ? 'page' : undefined}
          >
            {texto}
          </a>
        ))}
      </nav>
      {sesion.estado === 'autenticado' && (
        <>
          <span className="panel-barra__persona">
            {sesion.usuario.nombre_corto || sesion.usuario.email}
          </span>
          <button
            type="button"
            className="secundario"
            disabled={saliendo}
            onClick={() => {
              setSaliendo(true);
              void cerrarSesion();
            }}
          >
            {saliendo ? 'Saliendo…' : 'Salir'}
          </button>
        </>
      )}
    </header>
  );
}
