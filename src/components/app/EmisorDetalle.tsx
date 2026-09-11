/**
 * Ficha de un emisor, de solo lectura.
 *
 * Muestra el emisor entero tal y como lo devuelve la API, incluido lo que el
 * formulario no puede tocar: el dígito de verificación y la habilitación ante
 * la DIAN.
 *
 * Lo que concede esa habilitación —certificado, software y resoluciones— va en
 * pestañas, porque son tres listas de otras tantas rutas de la API y enseñarlas
 * a la vez convertiría la ficha en un informe. Cada pestaña pide lo suyo cuando
 * se abre, no antes.
 *
 * La ubicación y las responsabilidades viajan por **código**, no por nombre, así
 * que aquí hay que resolverlas contra los catálogos. Mientras llegan —o si el
 * código ya no está en el catálogo— se enseña el código en crudo: un dato feo se
 * lee, uno ausente no.
 */
import { type ReactNode, type SubmitEvent, useEffect, useRef, useState } from 'react';

import { ErrorApi, type Pagina, api } from '../../lib/api';
import {
  DEPARTAMENTO,
  type Item,
  MUNICIPIO,
  PAIS,
  RESPONSABILIDAD_FISCAL,
  TIPO_FACTURA,
  TIPO_IDENTIFICACION,
  TIPO_ORGANIZACION,
  catalogo,
  porCodigo,
} from '../../lib/catalogos';
import { useSesion } from '../../lib/sesion';
import {
  Aviso,
  Campo,
  Cargando,
  ErrorGeneral,
  Marca,
  Pestanas,
  Secreto,
  SesionNoLista,
  errorDe,
} from './piezas';

const AMBIENTES: Record<number, string> = { 1: 'Producción', 2: 'Habilitación' };

interface Resolucion {
  id: number;
  tipo_factura: number;
  numero_resolucion: string;
  fecha_resolucion: string;
  prefijo: string;
  rango_desde: number;
  rango_hasta: number;
  vigente_desde: string;
  vigente_hasta: string;
  activa?: boolean;
}

interface Certificado {
  id: number;
  emisor: number;
  nombre_archivo: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
}

interface Software {
  id: number;
  emisor: number;
  tipo: string;
  identificador: string;
  pin: string;
  test_set_id: string;
  set_pruebas_aceptado?: boolean;
}

const TIPOS_SOFTWARE: Record<string, string> = {
  facturacion: 'Facturación electrónica',
  nomina: 'Nómina electrónica',
  documento_equivalente: 'Documento equivalente',
};

/**
 * Tope de páginas al recorrer una lista. Ver `delEmisor()`: esto es una ficha,
 * no un informe.
 */
const MAXIMO_PAGINAS = 5;

/**
 * Lo que hay de este emisor en una lista de la API.
 *
 * Ni `/certificado/` ni `/software/` admiten filtrar por emisor —solo `page` y
 * `search`—, así que se recorren sus páginas y se queda lo que apunta a este.
 * El servidor ya ha acotado la lista a lo que alcanza quien pregunta; esto solo
 * separa un emisor de los demás suyos.
 */
async function delEmisor<T extends { emisor: number }>(
  ruta: string,
  emisor: number,
): Promise<T[]> {
  const items: T[] = [];
  let siguiente: string | null = ruta;
  for (let pagina = 0; siguiente && pagina < MAXIMO_PAGINAS; pagina += 1) {
    const respuesta: Pagina<T> = await api<Pagina<T>>(siguiente);
    items.push(...respuesta.results.filter((item) => item.emisor === emisor));
    siguiente = respuesta.next;
  }
  return items;
}

/** Pide a la API lo de este emisor y deja el estado de la petición a la vista. */
function useDelEmisor<T extends { emisor: number }>(ruta: string, emisor: number) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    delEmisor<T>(ruta, emisor)
      .then((respuesta) => {
        if (vigente) setItems(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo);
      });
    return () => {
      vigente = false;
    };
  }, [ruta, emisor, vuelta]);

  return { items, error, recargar: () => setVuelta((n) => n + 1) };
}

interface Emisor {
  id: number;
  razon_social: string;
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
  resoluciones: Resolucion[];
}

/** Un par etiqueta/valor de la ficha. `ancho` ocupa la fila entera. */
function Dato({ etiqueta, ancho = false, children }: {
  etiqueta: string;
  ancho?: boolean;
  children?: ReactNode;
}) {
  // `false` también cuenta: es lo que deja un `{lista.length > 0 && …}` vacío.
  const vacio =
    children === null || children === undefined || children === '' || children === false;
  return (
    <div className={ancho ? 'ancho' : undefined}>
      <dt>{etiqueta}</dt>
      <dd>{vacio ? '—' : children}</dd>
    </div>
  );
}

const nombrePorId = (items: Item[], id: number | null) =>
  id === null ? '' : items.find((item) => item.id === id)?.nombre ?? String(id);

const nombrePorCodigo = (items: Item[], codigo: string) =>
  codigo ? items.find((item) => item.codigo === codigo)?.nombre ?? codigo : '';

/**
 * Carga de un `.p12`.
 *
 * Va en multipart porque lleva el archivo, y con la clave del propio `.p12`: sin
 * ella el servidor no puede abrirlo ni validarlo. La clave no se guarda aquí ni
 * viaja a ningún otro sitio; se manda una vez y se borra del formulario en
 * cuanto la petición termina.
 */
function CargarCertificado({ emisor, alCargar }: {
  emisor: number;
  alCargar: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cargado, setCargado] = useState(false);

  async function cargar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const elegido = archivo.current?.files?.[0];
    if (!elegido) return;

    setEnviando(true);
    setError(null);
    setCargado(false);

    const cuerpo = new FormData();
    cuerpo.append('emisor', String(emisor));
    cuerpo.append('archivo', elegido);
    cuerpo.append('clave', clave);

    try {
      await api('/api/emisores/certificado/cargar/', { metodo: 'POST', cuerpo });
      if (archivo.current) archivo.current.value = '';
      setClave('');
      setCargado(true);
      alCargar();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={cargar}>
      <p className="panel-guia">
        El servidor valida el <code>.p12</code> antes de guardarlo: la clave, la vigencia y
        que el NIT sea el de este emisor. Cada emisor mantiene un solo certificado vigente,
        así que al cargar uno nuevo los anteriores quedan como histórico.
      </p>

      {cargado && <Aviso tipo="exito">Certificado cargado.</Aviso>}
      <ErrorGeneral error={error} />

      <div className="rejilla">
        <Campo
          id="archivo"
          etiqueta="Archivo del certificado"
          error={errorDe(error, 'archivo')}
          ayuda="Un .p12 o .pfx."
        >
          <input id="archivo" ref={archivo} type="file" required accept=".p12,.pfx" />
        </Campo>

        <Campo
          id="clave"
          etiqueta="Clave del certificado"
          error={errorDe(error, 'clave')}
          ayuda="La del archivo, no la de tu cuenta."
        >
          <input
            id="clave"
            type="password"
            required
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </Campo>
      </div>

      <div className="acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Cargando…' : 'Cargar certificado'}
        </button>
      </div>
    </form>
  );
}

/** Pestaña «Certificado»: los certificados de firma cargados para el emisor. */
function PestanaCertificado({ emisor }: { emisor: number }) {
  const { items, error, recargar } = useDelEmisor<Certificado>(
    '/api/emisores/certificado/',
    emisor,
  );

  return (
    <>
      <CargarCertificado emisor={emisor} alCargar={recargar} />
      <h3>Certificados del emisor</h3>
      <ListaCertificados items={items} error={error} />
    </>
  );
}

function ListaCertificados({ items, error }: { items: Certificado[] | null; error: unknown }) {
  if (error) return <ErrorGeneral error={error} />;
  if (items === null) return <Cargando />;
  if (items.length === 0) {
    return <p className="vacio">Este emisor no tiene ningún certificado cargado.</p>;
  }

  return (
    <div className="tabla-contenedor">
      <table>
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Vigencia</th>
          </tr>
        </thead>
        <tbody>
          {items.map((certificado) => (
            <tr key={certificado.id}>
              <td className="monospacio">{certificado.nombre_archivo}</td>
              <td className="monospacio">
                {certificado.vigente_desde ?? '—'} → {certificado.vigente_hasta ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pestaña «Software»: el software que la DIAN habilita, uno por operación.
 *
 * En ficha y no en tabla porque cada uno trae una docena de campos, y el PIN
 * arranca tapado: es una credencial, no un dato más.
 */
function PestanaSoftware({ emisor }: { emisor: number }) {
  const { items, error } = useDelEmisor<Software>('/api/emisores/software/', emisor);

  if (error) return <ErrorGeneral error={error} />;
  if (items === null) return <Cargando />;
  if (items.length === 0) {
    return <p className="vacio">Este emisor no tiene software registrado ante la DIAN.</p>;
  }

  return (
    <>
      {items.map((software) => (
        <article key={software.id} className="ficha">
          <h3>{TIPOS_SOFTWARE[software.tipo] ?? software.tipo}</h3>
          {/* Los identificadores ocupan fila entera: un UUID no cabe en una
              columna de la rejilla. */}
          <dl className="datos">
            <Dato etiqueta="ID del software" ancho>
              <span className="monospacio">{software.identificador}</span>
            </Dato>
            <Dato etiqueta="ID del set de pruebas" ancho>
              {software.test_set_id && (
                <span className="monospacio">{software.test_set_id}</span>
              )}
            </Dato>
            <Dato etiqueta="PIN"><Secreto valor={software.pin} /></Dato>
            <Dato etiqueta="Set de pruebas aceptado">
              <Marca valor={software.set_pruebas_aceptado ?? false} />
            </Dato>
          </dl>
        </article>
      ))}
    </>
  );
}

/**
 * Pestaña «Resoluciones»: las de numeración.
 *
 * Estas no se piden aparte: el emisor ya las trae dentro.
 */
function PestanaResoluciones({ resoluciones, tiposFactura }: {
  resoluciones: Resolucion[];
  tiposFactura: Item[];
}) {
  if (resoluciones.length === 0) {
    return <p className="vacio">Este emisor no tiene resoluciones de numeración.</p>;
  }

  return (
    <div className="tabla-contenedor">
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Prefijo</th>
            <th>Número</th>
            <th>Fecha</th>
            <th>Rango</th>
            <th>Vigencia</th>
            <th>Activa</th>
          </tr>
        </thead>
        <tbody>
          {resoluciones.map((resolucion) => (
            <tr key={resolucion.id}>
              <td>{nombrePorId(tiposFactura, resolucion.tipo_factura)}</td>
              <td className="monospacio">{resolucion.prefijo || '—'}</td>
              <td className="monospacio">{resolucion.numero_resolucion}</td>
              <td className="monospacio">{resolucion.fecha_resolucion}</td>
              <td className="monospacio">
                {resolucion.rango_desde}–{resolucion.rango_hasta}
              </td>
              <td className="monospacio">
                {resolucion.vigente_desde} → {resolucion.vigente_hasta}
              </td>
              <td><Marca valor={resolucion.activa ?? false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EmisorDetalle() {
  const sesion = useSesion();
  const [id, setId] = useState<string | null>(null);
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [tiposIdentificacion, setTiposIdentificacion] = useState<Item[]>([]);
  const [tiposOrganizacion, setTiposOrganizacion] = useState<Item[]>([]);
  const [responsabilidades, setResponsabilidades] = useState<Item[]>([]);
  const [departamentos, setDepartamentos] = useState<Item[]>([]);
  const [tiposFactura, setTiposFactura] = useState<Item[]>([]);
  const [pais, setPais] = useState('');
  const [municipio, setMunicipio] = useState('');

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  // Los catálogos cortos son públicos y no dependen del emisor: se piden ya.
  // Un fallo aquí no vacía la ficha, solo deja los códigos sin traducir, así que
  // no toca `error`.
  useEffect(() => {
    void catalogo(TIPO_IDENTIFICACION).then(setTiposIdentificacion).catch(() => {});
    void catalogo(TIPO_ORGANIZACION).then(setTiposOrganizacion).catch(() => {});
    void catalogo(RESPONSABILIDAD_FISCAL).then(setResponsabilidades).catch(() => {});
    void catalogo(DEPARTAMENTO).then(setDepartamentos).catch(() => {});
    void catalogo(TIPO_FACTURA).then(setTiposFactura).catch(() => {});
  }, []);

  useEffect(() => {
    if (sesion.estado !== 'autenticado') return;
    if (id === null) {
      setCargando(false);
      return;
    }
    let vigente = true;
    api<Emisor>(`/api/emisores/emisor/${id}/`)
      .then((respuesta) => {
        if (vigente) setEmisor(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [sesion.estado, id]);

  // País y municipio salen de catálogos grandes, que se buscan por código: hasta
  // que no hay emisor no se sabe qué buscar.
  useEffect(() => {
    if (!emisor) return;
    let vigente = true;
    void porCodigo(PAIS, emisor.pais)
      .then((item) => {
        if (vigente && item) setPais(item.nombre);
      })
      .catch(() => {});
    void porCodigo(MUNICIPIO, emisor.municipio)
      .then((item) => {
        if (vigente && item) setMunicipio(item.nombre);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [emisor]);

  if (sesion.estado !== 'autenticado') return <SesionNoLista sesion={sesion} />;
  if (cargando) return <Cargando />;

  if (id === null) {
    return (
      <>
        <h1>Falta el emisor</h1>
        <p className="panel-guia">La dirección tiene que traer el <code>?id=</code> del emisor.</p>
        <a href="/app/emisores/"><button type="button">Volver al listado</button></a>
      </>
    );
  }

  if (error instanceof ErrorApi && error.estado === 404) {
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

  if (!emisor) return <ErrorGeneral error={error} />;

  const identificacion =
    emisor.numero_identificacion +
    (emisor.digito_verificacion ? `-${emisor.digito_verificacion}` : '');

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>{emisor.razon_social}</h1>
          <p className="panel-guia">
            <span className="monospacio">{identificacion}</span>
          </p>
        </div>
        <div className="acciones">
          <a href={`/app/emisores/formulario/?id=${emisor.id}`}>
            <button type="button">Editar</button>
          </a>
          <a href="/app/emisores/">Volver al listado</a>
        </div>
      </div>

      <ErrorGeneral error={error} />

      <h2>Identificación</h2>
      <dl className="datos">
        <Dato etiqueta="Tipo de identificación">
          {nombrePorId(tiposIdentificacion, emisor.tipo_identificacion)}
        </Dato>
        <Dato etiqueta="Número">
          <span className="monospacio">{emisor.numero_identificacion}</span>
        </Dato>
        <Dato etiqueta="Dígito de verificación">
          {emisor.digito_verificacion && (
            <span className="monospacio">{emisor.digito_verificacion}</span>
          )}
        </Dato>
        <Dato etiqueta="Razón social">{emisor.razon_social}</Dato>
        <Dato etiqueta="Tipo de organización">
          {nombrePorId(tiposOrganizacion, emisor.tipo_organizacion)}
        </Dato>
        <Dato etiqueta="Activo"><Marca valor={emisor.activo} /></Dato>
        <Dato etiqueta="Responsabilidades fiscales" ancho>
          {emisor.responsabilidades.length > 0 && (
            <div className="fichas">
              {emisor.responsabilidades.map((codigo) => (
                <span key={codigo} className="etiqueta">
                  {nombrePorCodigo(responsabilidades, codigo)}{' '}
                  <span className="monospacio">{codigo}</span>
                </span>
              ))}
            </div>
          )}
        </Dato>
      </dl>

      <h2>Ubicación</h2>
      <dl className="datos">
        <Dato etiqueta="País">{pais || emisor.pais}</Dato>
        <Dato etiqueta="Departamento">
          {nombrePorCodigo(departamentos, emisor.departamento)}
        </Dato>
        <Dato etiqueta="Municipio">{municipio || emisor.municipio}</Dato>
        <Dato etiqueta="Código postal">{emisor.codigo_postal}</Dato>
        <Dato etiqueta="Dirección" ancho>{emisor.direccion}</Dato>
      </dl>

      <h2>Contacto</h2>
      <dl className="datos">
        <Dato etiqueta="Correo">{emisor.correo}</Dato>
        <Dato etiqueta="Teléfono">{emisor.telefono}</Dato>
        <Dato etiqueta="Correo en copia" ancho>{emisor.correo_copia}</Dato>
      </dl>

      <h2>Habilitación ante la DIAN</h2>
      <p className="panel-guia">
        De solo lectura: la habilitación la conceden el certificado, el software y las
        resoluciones, que se ven abajo pero todavía no se gestionan desde el panel.
      </p>
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr><th>Operación</th><th>Ambiente</th><th>Habilitado</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Facturación</td>
              <td>{AMBIENTES[emisor.ambiente_facturacion] ?? '—'}</td>
              <td><Marca valor={emisor.habilitado_facturacion} /></td>
            </tr>
            <tr>
              <td>Nómina</td>
              <td>{AMBIENTES[emisor.ambiente_nomina] ?? '—'}</td>
              <td><Marca valor={emisor.habilitado_nomina} /></td>
            </tr>
            <tr>
              <td>Documento equivalente</td>
              <td>{AMBIENTES[emisor.ambiente_documento_equivalente] ?? '—'}</td>
              <td><Marca valor={emisor.habilitado_documento_equivalente} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pestanas
        nombre="emisor"
        etiqueta="Certificado, software y resoluciones"
        pestanas={[
          {
            id: 'certificado',
            titulo: 'Certificado',
            render: () => <PestanaCertificado emisor={emisor.id} />,
          },
          {
            id: 'software',
            titulo: 'Software',
            render: () => <PestanaSoftware emisor={emisor.id} />,
          },
          {
            id: 'resoluciones',
            titulo: `Resoluciones (${emisor.resoluciones.length})`,
            render: () => (
              <PestanaResoluciones
                resoluciones={emisor.resoluciones}
                tiposFactura={tiposFactura}
              />
            ),
          },
        ]}
      />
    </>
  );
}
