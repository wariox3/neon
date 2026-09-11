/**
 * Listado de emisores.
 *
 * Lo que se ve aquí ya viene acotado por el servidor: `AlcanceEmisorMixin` filtra
 * el queryset a los emisores que alcanza quien pregunta, así que el panel no
 * tiene que (ni puede) decidir qué esconder.
 */
import { useEffect, useState } from 'react';

import { POR_PAGINA, type Pagina, api } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { Aviso, Cargando, ErrorGeneral, SesionNoLista, Marca } from './piezas';

interface EmisorEnLista {
  id: number;
  razon_social: string;
  numero_identificacion: string;
  digito_verificacion: string | null;
  activo: boolean;
  habilitado_facturacion: boolean;
  habilitado_nomina: boolean;
  habilitado_documento_equivalente: boolean;
}

export default function Emisores() {
  const sesion = useSesion();
  const [pagina, setPagina] = useState<Pagina<EmisorEnLista> | null>(null);
  const [numero, setNumero] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);

  // El formulario vuelve aquí con `?guardado=`. Se limpia de la URL para que
  // recargar o compartir el enlace no repita el aviso.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    if (!parametros.has('guardado')) return;
    setRecienGuardado(true);
    parametros.delete('guardado');
    const cadena = parametros.toString();
    window.history.replaceState({}, '', window.location.pathname + (cadena ? `?${cadena}` : ''));
  }, []);

  useEffect(() => {
    if (sesion.estado !== 'autenticado') return;
    let vigente = true;
    setError(null);

    const parametros = new URLSearchParams({ page: String(numero) });
    if (consulta) parametros.set('search', consulta);

    api<Pagina<EmisorEnLista>>(`/api/emisores/emisor/?${parametros}`)
      .then((respuesta) => {
        if (vigente) setPagina(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo);
      });

    return () => {
      vigente = false;
    };
  }, [sesion.estado, numero, consulta]);

  if (sesion.estado !== 'autenticado') return <SesionNoLista sesion={sesion} />;

  const total = pagina?.count ?? 0;
  const ultima = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Emisores</h1>
          <p className="panel-guia">
            El obligado a facturar. Cada emisor lleva sus propios datos, su certificado y
            sus resoluciones.
          </p>
        </div>
        <a href="/app/emisores/formulario/">
          <button type="button">Nuevo emisor</button>
        </a>
      </div>

      <form
        className="barra-busqueda"
        onSubmit={(e) => {
          e.preventDefault();
          setNumero(1);
          setConsulta(busqueda.trim());
        }}
      >
        <input
          aria-label="Buscar por razón social o NIT"
          placeholder="Buscar por razón social o NIT…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="secundario">Buscar</button>
        {consulta && (
          <button
            type="button"
            className="enlace"
            onClick={() => {
              setBusqueda('');
              setConsulta('');
              setNumero(1);
            }}
          >
            Limpiar
          </button>
        )}
      </form>

      {recienGuardado && <Aviso tipo="exito">Emisor guardado.</Aviso>}
      <ErrorGeneral error={error} />

      {pagina === null ? (
        <Cargando />
      ) : pagina.results.length === 0 ? (
        <p className="vacio">
          {consulta
            ? 'Ningún emisor coincide con la búsqueda.'
            : 'Todavía no has dado de alta ningún emisor.'}
        </p>
      ) : (
        <>
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Identificación</th>
                  <th>Razón social</th>
                  <th>Facturación</th>
                  <th>Nómina</th>
                  <th>Equivalente</th>
                  <th>Activo</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {pagina.results.map((emisor) => (
                  <tr key={emisor.id}>
                    <td className="monospacio">
                      {emisor.numero_identificacion}
                      {emisor.digito_verificacion ? `-${emisor.digito_verificacion}` : ''}
                    </td>
                    <td>{emisor.razon_social}</td>
                    <td><Marca valor={emisor.habilitado_facturacion} /></td>
                    <td><Marca valor={emisor.habilitado_nomina} /></td>
                    <td><Marca valor={emisor.habilitado_documento_equivalente} /></td>
                    <td><Marca valor={emisor.activo} /></td>
                    <td className="acciones-fila">
                      <a href={`/app/emisores/detalle/?id=${emisor.id}`}>Ver</a>
                      <a href={`/app/emisores/formulario/?id=${emisor.id}`}>Editar</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ultima > 1 && (
            <div className="paginacion">
              <button
                type="button"
                className="secundario"
                disabled={!pagina.previous}
                onClick={() => setNumero((n) => n - 1)}
              >
                Anterior
              </button>
              <span>Página {numero} de {ultima} · {total} emisores</span>
              <button
                type="button"
                className="secundario"
                disabled={!pagina.next}
                onClick={() => setNumero((n) => n + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
