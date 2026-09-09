/**
 * Alta y edición de un emisor.
 *
 * Lo que el formulario no manda nunca, aunque el emisor lo tenga:
 *
 * - `usuario`: el dueño lo pone el servidor con quien hace la petición. Es de
 *   solo lectura precisamente para que nadie dé de alta a nombre de otro.
 * - `digito_verificacion`: lo calcula el modelo al guardar (`dv_de_entidad`).
 *   Mandarlo solo serviría para que la respuesta contradijera a la petición.
 * - `activo` y los `habilitado_*`: los administra el backend. Aquí solo se
 *   miran, en la tabla de habilitación ante la DIAN.
 *
 * La ubicación y las responsabilidades fiscales viajan por **código** (ISO 3166,
 * DANE y el del RUT), no por id: los ids son seriales de cada base y cambian
 * entre ambientes.
 */
import { type SubmitEvent, useEffect, useState } from 'react';

import { ErrorApi, api } from '../../lib/api';
import {
  DEPARTAMENTO,
  type Item,
  MUNICIPIO,
  PAIS,
  RESPONSABILIDAD_FISCAL,
  TIPO_IDENTIFICACION,
  TIPO_ORGANIZACION,
  catalogo,
} from '../../lib/catalogos';
import { useSesion } from '../../lib/sesion';
import SelectorBuscado from './SelectorBuscado';
import { Campo, Cargando, ErrorGeneral, Marca, SesionNoLista, errorDe } from './piezas';

const AMBIENTES: Record<number, string> = { 1: 'Producción', 2: 'Habilitación' };

/**
 * Un emisor solo se da de alta con NIT o cédula de ciudadanía, así que el resto
 * del catálogo DIAN no se ofrece. Se filtra por **código**, no por id: los ids
 * son seriales de cada base y cambian entre ambientes.
 */
const IDENTIFICACIONES_EMISOR = ['31', '13'];

interface Emisor {
  id: number;
  razon_social: string;
  nombre_comercial: string;
  tipo_identificacion: number | null;
  numero_identificacion: string;
  digito_verificacion: string;
  tipo_organizacion: number | null;
  responsabilidades: string[];
  pais: string;
  departamento: string;
  municipio: string;
  direccion: string;
  codigo_postal: string;
  correo: string;
  correo_copia: string;
  telefono: string;
  activo: boolean;
  habilitado_facturacion: boolean;
  habilitado_nomina: boolean;
  habilitado_documento_equivalente: boolean;
  ambiente_facturacion: number;
  ambiente_nomina: number;
  ambiente_documento_equivalente: number;
}

const VACIO = {
  razon_social: '',
  nombre_comercial: '',
  tipo_identificacion: '',
  numero_identificacion: '',
  tipo_organizacion: '',
  responsabilidades: [] as string[],
  pais: 'CO',
  departamento: '',
  municipio: '',
  direccion: '',
  codigo_postal: '',
  correo: '',
  correo_copia: '',
  telefono: '',
};

type Formulario = typeof VACIO;

export default function EmisorFormulario() {
  const sesion = useSesion();
  const [id, setId] = useState<string | null>(null);
  const [datos, setDatos] = useState<Formulario>(VACIO);
  const [guardado, setGuardado] = useState<Emisor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const [tiposIdentificacion, setTiposIdentificacion] = useState<Item[]>([]);
  const [tiposOrganizacion, setTiposOrganizacion] = useState<Item[]>([]);
  const [responsabilidades, setResponsabilidades] = useState<Item[]>([]);
  const [departamentos, setDepartamentos] = useState<Item[]>([]);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  // Los catálogos no dependen de la sesión (son públicos), así que se piden en
  // paralelo con el emisor en vez de esperar a saber quién mira.
  useEffect(() => {
    void Promise.all([
      catalogo(TIPO_IDENTIFICACION).then((tipos) =>
        setTiposIdentificacion(
          IDENTIFICACIONES_EMISOR.flatMap(
            (codigo) => tipos.find((tipo) => tipo.codigo === codigo) ?? [],
          ),
        ),
      ),
      catalogo(TIPO_ORGANIZACION).then(setTiposOrganizacion),
      catalogo(RESPONSABILIDAD_FISCAL).then(setResponsabilidades),
      catalogo(DEPARTAMENTO).then(setDepartamentos),
    ]).catch(setError);
  }, []);

  useEffect(() => {
    if (sesion.estado !== 'autenticado') return;
    if (id === null) {
      setCargando(false);
      return;
    }
    api<Emisor>(`/api/emisores/emisor/${id}/`)
      .then((emisor) => {
        setGuardado(emisor);
        setDatos({
          razon_social: emisor.razon_social ?? '',
          nombre_comercial: emisor.nombre_comercial ?? '',
          tipo_identificacion: String(emisor.tipo_identificacion ?? ''),
          numero_identificacion: emisor.numero_identificacion ?? '',
          tipo_organizacion: String(emisor.tipo_organizacion ?? ''),
          responsabilidades: emisor.responsabilidades ?? [],
          pais: emisor.pais ?? 'CO',
          departamento: emisor.departamento ?? '',
          municipio: emisor.municipio ?? '',
          direccion: emisor.direccion ?? '',
          codigo_postal: emisor.codigo_postal ?? '',
          correo: emisor.correo ?? '',
          correo_copia: emisor.correo_copia ?? '',
          telefono: emisor.telefono ?? '',
        });
      })
      .catch(setError)
      .finally(() => setCargando(false));
  }, [sesion.estado, id]);

  function poner<C extends keyof Formulario>(campo: C, valor: Formulario[C]) {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  }

  async function guardar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    const cuerpo = {
      razon_social: datos.razon_social,
      nombre_comercial: datos.nombre_comercial,
      tipo_identificacion: Number(datos.tipo_identificacion),
      numero_identificacion: datos.numero_identificacion,
      tipo_organizacion: Number(datos.tipo_organizacion),
      responsabilidades: datos.responsabilidades,
      pais: datos.pais,
      departamento: datos.departamento,
      municipio: datos.municipio,
      direccion: datos.direccion,
      codigo_postal: datos.codigo_postal,
      correo: datos.correo,
      correo_copia: datos.correo_copia,
      telefono: datos.telefono,
    };

    try {
      const emisor = id
        ? await api<Emisor>(`/api/emisores/emisor/${id}/`, { metodo: 'PATCH', cuerpo })
        : await api<Emisor>('/api/emisores/emisor/', { metodo: 'POST', cuerpo });
      window.location.href = `/app/emisores/?guardado=${emisor.id}`;
    } catch (fallo) {
      setError(fallo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  }

  if (sesion.estado !== 'autenticado') return <SesionNoLista sesion={sesion} />;
  if (cargando) return <Cargando />;

  const noEncontrado = error instanceof ErrorApi && error.estado === 404;
  if (noEncontrado) {
    return (
      <>
        <h1>Ese emisor no existe</h1>
        <p className="panel-guia">
          O no es tuyo. Desde fuera de tu alcance, un emisor ajeno responde igual que uno
          que no existe.
        </p>
        <a href="/app/emisores/"><button type="button">Volver al listado</button></a>
      </>
    );
  }

  return (
    <form onSubmit={guardar}>
      <div className="panel-cabecera">
        <h1>{id ? 'Editar emisor' : 'Nuevo emisor'}</h1>
      </div>

      <ErrorGeneral error={error} />

      <h2>Identificación</h2>

      <div className="rejilla">
        <Campo
          id="tipo_identificacion"
          etiqueta="Tipo de identificación"
          error={errorDe(error, 'tipo_identificacion')}
        >
          <select
            id="tipo_identificacion"
            required
            value={datos.tipo_identificacion}
            onChange={(e) => poner('tipo_identificacion', e.target.value)}
          >
            <option value="">Elige…</option>
            {tiposIdentificacion.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
            ))}
          </select>
        </Campo>

        <Campo
          id="numero_identificacion"
          etiqueta="Número"
          error={errorDe(error, 'numero_identificacion')}
          ayuda="Sin puntos, sin guiones y sin dígito de verificación."
        >
          <input
            id="numero_identificacion"
            required
            inputMode="numeric"
            value={datos.numero_identificacion}
            onChange={(e) => poner('numero_identificacion', e.target.value)}
          />
        </Campo>
      </div>

      <div className="rejilla">
        <Campo
          id="razon_social"
          etiqueta="Razón social"
          error={errorDe(error, 'razon_social')}
        >
          <input
            id="razon_social"
            required
            value={datos.razon_social}
            onChange={(e) => poner('razon_social', e.target.value)}
          />
        </Campo>

        <Campo
          id="nombre_comercial"
          etiqueta="Nombre comercial"
          error={errorDe(error, 'nombre_comercial')}
          ayuda="Opcional."
        >
          <input
            id="nombre_comercial"
            value={datos.nombre_comercial}
            onChange={(e) => poner('nombre_comercial', e.target.value)}
          />
        </Campo>

        <Campo
          id="tipo_organizacion"
          etiqueta="Tipo de organización"
          error={errorDe(error, 'tipo_organizacion')}
        >
          <select
            id="tipo_organizacion"
            required
            value={datos.tipo_organizacion}
            onChange={(e) => poner('tipo_organizacion', e.target.value)}
          >
            <option value="">Elige…</option>
            {tiposOrganizacion.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
            ))}
          </select>
        </Campo>

        {guardado && (
          <Campo id="dv" etiqueta="Dígito de verificación" ayuda="Lo calcula el servidor.">
            <input id="dv" value={guardado.digito_verificacion || '—'} readOnly disabled />
          </Campo>
        )}
      </div>

      <Campo
        id="responsabilidades"
        etiqueta="Responsabilidades fiscales"
        error={errorDe(error, 'responsabilidades')}
        ayuda="Las del RUT. Se pueden elegir varias."
      >
        <div className="casillas">
          {responsabilidades.map((responsabilidad) => (
            <label key={responsabilidad.id} className="casilla">
              <input
                type="checkbox"
                checked={datos.responsabilidades.includes(responsabilidad.codigo)}
                onChange={(e) =>
                  poner(
                    'responsabilidades',
                    e.target.checked
                      ? [...datos.responsabilidades, responsabilidad.codigo]
                      : datos.responsabilidades.filter(
                          (r) => r !== responsabilidad.codigo,
                        ),
                  )
                }
              />
              <span>
                {responsabilidad.nombre}{' '}
                <span className="monospacio">{responsabilidad.codigo}</span>
              </span>
            </label>
          ))}
        </div>
      </Campo>

      <h2>Ubicación</h2>

      <div className="rejilla">
        <Campo id="pais" etiqueta="País" error={errorDe(error, 'pais')}>
          <SelectorBuscado
            id="pais"
            catalogo={PAIS}
            valor={datos.pais}
            onCambio={(codigo) => poner('pais', codigo)}
            placeholder="Colombia…"
          />
        </Campo>

        <Campo
          id="departamento"
          etiqueta="Departamento"
          error={errorDe(error, 'departamento')}
        >
          <select
            id="departamento"
            required
            value={datos.departamento}
            onChange={(e) => {
              poner('departamento', e.target.value);
              // El municipio guardado ya no tiene por qué pertenecer al nuevo
              // departamento: se limpia para que se elija de nuevo.
              poner('municipio', '');
            }}
          >
            <option value="">Elige…</option>
            {departamentos.map((departamento) => (
              <option key={departamento.id} value={departamento.codigo}>
                {departamento.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          id="municipio"
          etiqueta="Municipio"
          error={errorDe(error, 'municipio')}
          ayuda="Escribe su nombre o su código DANE."
        >
          <SelectorBuscado
            id="municipio"
            catalogo={MUNICIPIO}
            valor={datos.municipio}
            onCambio={(codigo) => poner('municipio', codigo)}
            reiniciarCon={datos.departamento}
            placeholder="Medellín…"
          />
        </Campo>

        <Campo
          id="codigo_postal"
          etiqueta="Código postal"
          error={errorDe(error, 'codigo_postal')}
          ayuda="Opcional."
        >
          <input
            id="codigo_postal"
            value={datos.codigo_postal}
            onChange={(e) => poner('codigo_postal', e.target.value)}
          />
        </Campo>
      </div>

      <Campo id="direccion" etiqueta="Dirección" error={errorDe(error, 'direccion')}>
        <input
          id="direccion"
          required
          value={datos.direccion}
          onChange={(e) => poner('direccion', e.target.value)}
        />
      </Campo>

      <h2>Contacto</h2>

      <div className="rejilla">
        <Campo id="correo" etiqueta="Correo" error={errorDe(error, 'correo')}>
          <input
            id="correo"
            type="email"
            required
            value={datos.correo}
            onChange={(e) => poner('correo', e.target.value)}
          />
        </Campo>

        <Campo id="telefono" etiqueta="Teléfono" error={errorDe(error, 'telefono')}>
          <input
            id="telefono"
            value={datos.telefono}
            onChange={(e) => poner('telefono', e.target.value)}
          />
        </Campo>
      </div>

      <Campo
        id="correo_copia"
        etiqueta="Correo en copia"
        error={errorDe(error, 'correo_copia')}
        ayuda="Copia de las notificaciones al adquiriente. Varios, separados por punto y coma."
      >
        <input
          id="correo_copia"
          value={datos.correo_copia}
          onChange={(e) => poner('correo_copia', e.target.value)}
        />
      </Campo>

      {guardado && (
        <>
          <h2>Habilitación ante la DIAN</h2>
          <p className="panel-guia">
            De solo lectura: se gestiona con el certificado, el software y las
            resoluciones, que todavía no están en el panel.
          </p>
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr><th>Operación</th><th>Ambiente</th><th>Habilitado</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Facturación</td>
                  <td>{AMBIENTES[guardado.ambiente_facturacion] ?? '—'}</td>
                  <td><Marca valor={guardado.habilitado_facturacion} /></td>
                </tr>
                <tr>
                  <td>Nómina</td>
                  <td>{AMBIENTES[guardado.ambiente_nomina] ?? '—'}</td>
                  <td><Marca valor={guardado.habilitado_nomina} /></td>
                </tr>
                <tr>
                  <td>Documento equivalente</td>
                  <td>{AMBIENTES[guardado.ambiente_documento_equivalente] ?? '—'}</td>
                  <td><Marca valor={guardado.habilitado_documento_equivalente} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : id ? 'Guardar los cambios' : 'Crear el emisor'}
        </button>
        <a href="/app/emisores/">Cancelar</a>
      </div>
    </form>
  );
}
