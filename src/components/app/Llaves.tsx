/**
 * Llaves de API: las credenciales de las integraciones.
 *
 * El detalle que manda en esta pantalla: el secreto completo (`clave`) solo
 * viene en la respuesta del alta. Después el servidor guarda su hash y ya no
 * puede devolverlo. Por eso la llave recién creada se queda fija arriba hasta
 * que la persona la descarta, en vez de desaparecer al refrescar la tabla.
 */
import { type SubmitEvent, useEffect, useState } from 'react';

import { type Pagina, api } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { Aviso, Campo, Cargando, ErrorGeneral, SesionNoLista, Marca, errorDe } from './piezas';

interface Llave {
  id: number;
  nombre: string;
  prefijo: string;
  clave: string | null;
  activa: boolean;
  expira_en: string | null;
  ultimo_uso_en: string | null;
}

const RUTA = '/api/seguridad/llave-api/';

function fecha(valor: string | null): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Llaves() {
  const sesion = useSesion();
  const [llaves, setLlaves] = useState<Llave[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [nombre, setNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<unknown>(null);
  const [reciente, setReciente] = useState<Llave | null>(null);
  const [copiado, setCopiado] = useState(false);

  /**
   * Trae todas las llaves, no la primera página.
   *
   * La API pagina de diez en diez, y con la rotación (crear la nueva antes de
   * retirar la vieja) es fácil pasar de diez sin darse cuenta. Quedarse en la
   * primera página escondería justo las más antiguas, que son las que hay que
   * revocar.
   */
  async function cargar() {
    setError(null);
    try {
      const todas: Llave[] = [];
      let siguiente: string | null = RUTA;
      while (siguiente) {
        const pagina: Pagina<Llave> = await api<Pagina<Llave>>(siguiente);
        todas.push(...pagina.results);
        siguiente = pagina.next;
      }
      setLlaves(todas);
    } catch (fallo) {
      setError(fallo);
      setLlaves([]);
    }
  }

  useEffect(() => {
    if (sesion.estado === 'autenticado') void cargar();
  }, [sesion.estado]);

  async function crear(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCreando(true);
    setErrorAlta(null);
    setCopiado(false);
    try {
      const llave = await api<Llave>(RUTA, { metodo: 'POST', cuerpo: { nombre } });
      setReciente(llave);
      setNombre('');
      await cargar();
    } catch (fallo) {
      setErrorAlta(fallo);
    } finally {
      setCreando(false);
    }
  }

  async function alternar(llave: Llave) {
    setError(null);
    try {
      await api(`${RUTA}${llave.id}/`, {
        metodo: 'PATCH',
        cuerpo: { activa: !llave.activa },
      });
      await cargar();
    } catch (fallo) {
      setError(fallo);
    }
  }

  async function borrar(llave: Llave) {
    const seguro = window.confirm(
      `Borrar la llave "${llave.nombre}". Cualquier integración que la use dejará de ` +
        'funcionar de inmediato, y no se puede recuperar. ¿Seguimos?',
    );
    if (!seguro) return;
    setError(null);
    try {
      await api(`${RUTA}${llave.id}/`, { metodo: 'DELETE' });
      if (reciente?.id === llave.id) setReciente(null);
      await cargar();
    } catch (fallo) {
      setError(fallo);
    }
  }

  if (sesion.estado !== 'autenticado') return <SesionNoLista sesion={sesion} />;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Llaves de API</h1>
          <p className="panel-guia">
            La credencial de un ERP o de cualquier sistema que hable con la API sin nadie
            delante. Cada llave alcanza exactamente tus mismos emisores.{' '}
            <a href="/guias/autenticacion/">Cómo se usan</a>.
          </p>
        </div>
      </div>

      {reciente?.clave && (
        <Aviso tipo="exito">
          <p>
            <strong>Copia la credencial ahora.</strong> Es la única vez que se muestra:
            después solo queda su hash en el servidor.
          </p>
          <p className="monospacio">{reciente.clave}</p>
          <div className="acciones">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(reciente.clave ?? '');
                setCopiado(true);
              }}
            >
              {copiado ? 'Copiada' : 'Copiar'}
            </button>
            <button type="button" className="secundario" onClick={() => setReciente(null)}>
              Ya la guardé
            </button>
          </div>
        </Aviso>
      )}

      <h2>Crear una llave</h2>
      <form onSubmit={crear}>
        <ErrorGeneral error={errorAlta} />
        <Campo
          id="nombre"
          etiqueta="Nombre"
          error={errorDe(errorAlta, 'nombre')}
          ayuda="Que se reconozca de un vistazo: “ERP producción”, “ERP pruebas”."
        >
          <input
            id="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Campo>
        <div className="acciones">
          <button type="submit" disabled={creando || !nombre.trim()}>
            {creando ? 'Creando…' : 'Crear la llave'}
          </button>
        </div>
      </form>

      <h2>Tus llaves</h2>
      <ErrorGeneral error={error} />

      {llaves === null ? (
        <Cargando />
      ) : llaves.length === 0 ? (
        <p className="vacio">Todavía no tienes ninguna llave.</p>
      ) : (
        <div className="tabla-contenedor">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Prefijo</th>
                <th>Activa</th>
                <th>Último uso</th>
                <th>Expira</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {llaves.map((llave) => (
                <tr key={llave.id}>
                  <td>{llave.nombre}</td>
                  <td className="monospacio">{llave.prefijo}</td>
                  <td><Marca valor={llave.activa} /></td>
                  <td>{fecha(llave.ultimo_uso_en)}</td>
                  <td>{fecha(llave.expira_en)}</td>
                  <td>
                    <div className="acciones" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="secundario"
                        onClick={() => void alternar(llave)}
                      >
                        {llave.activa ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="peligro"
                        onClick={() => void borrar(llave)}
                      >
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="panel-guia" style={{ marginTop: '1.5rem' }}>
        Para rotar una llave sin cortar el servicio: crea la nueva, despliégala en tu
        sistema y solo entonces desactiva la vieja.
      </p>
    </>
  );
}
