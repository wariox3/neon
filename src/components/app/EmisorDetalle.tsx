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
  EntradaContrasena,
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
  certificado_activo: boolean;
  certificado_vence: string | null;
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
        que el NIT sea el de este emisor. Cada emisor tiene un solo certificado, así que
        para cambiarlo hay que eliminar el que haya y cargar el nuevo.
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
          <EntradaContrasena
            id="clave"
            autoComplete="off"
            valor={clave}
            onCambio={setClave}
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

/**
 * Pestaña «Certificado»: el certificado de firma del emisor.
 *
 * El formulario de carga solo sale cuando no hay certificado. No es un adorno:
 * la API no tiene reemplazo —solo `cargar` y `destroy`—, así que dejar el
 * formulario a la vista con uno ya cargado invita a un intento que el servidor
 * rechaza. Para cambiarlo se elimina el actual desde la lista.
 */
function PestanaCertificado({ emisor }: { emisor: Emisor }) {
  const { items, error, recargar } = useDelEmisor<Certificado>(
    '/api/emisores/certificado/',
    emisor.id,
  );

  // La lista es la que manda, porque es la que se recarga al cargar y al
  // eliminar; la bandera del emisor solo cubre el rato en que aún no ha
  // llegado, para no enseñar el formulario un instante y esconderlo después.
  const tiene = items === null ? emisor.certificado_activo : items.length > 0;

  return (
    <>
      {tiene ? (
        <p className="panel-guia">
          Este emisor ya tiene certificado
          {emisor.certificado_vence ? `, vigente hasta el ${emisor.certificado_vence}` : ''}.
          Solo puede haber uno: para cambiarlo, elimina el actual en la lista de abajo y
          carga el nuevo.
        </p>
      ) : (
        <CargarCertificado emisor={emisor.id} alCargar={recargar} />
      )}
      <h3>Certificados del emisor</h3>
      <ListaCertificados items={items} error={error} alEliminar={recargar} />
    </>
  );
}

function ListaCertificados({ items, error, alEliminar }: {
  items: Certificado[] | null;
  error: unknown;
  alEliminar: () => void;
}) {
  // El fallo de la baja es aparte del de la carga de la lista: uno no invalida
  // al otro, y el de la baja tiene que salir junto a la tabla que la ofrece.
  const [errorBaja, setErrorBaja] = useState<unknown>(null);
  const [borrando, setBorrando] = useState<number | null>(null);

  if (error) return <ErrorGeneral error={error} />;
  if (items === null) return <Cargando />;
  if (items.length === 0) {
    return <p className="vacio">Este emisor no tiene ningún certificado cargado.</p>;
  }

  async function eliminar(certificado: Certificado) {
    const seguro = window.confirm(
      `Eliminar el certificado "${certificado.nombre_archivo}". El emisor se queda sin ` +
        'con qué firmar —no podrá emitir documentos— hasta que cargues otro, y el ' +
        'archivo no se puede recuperar. ¿Seguimos?',
    );
    if (!seguro) return;
    setErrorBaja(null);
    setBorrando(certificado.id);
    try {
      await api(`/api/emisores/certificado/${certificado.id}/`, { metodo: 'DELETE' });
      alEliminar();
    } catch (fallo) {
      setErrorBaja(fallo);
    } finally {
      setBorrando(null);
    }
  }

  return (
    <>
      <ErrorGeneral error={errorBaja} />
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Vigencia</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {items.map((certificado) => (
              <tr key={certificado.id}>
                <td className="monospacio">{certificado.nombre_archivo}</td>
                <td className="monospacio">
                  {certificado.vigente_desde ?? '—'} → {certificado.vigente_hasta ?? '—'}
                </td>
                <td>
                  <div className="acciones" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="peligro"
                      disabled={borrando !== null}
                      onClick={() => void eliminar(certificado)}
                    >
                      {borrando === certificado.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Lo que el formulario de software manda, y a lo que vuelve tras crear uno.
 *
 * `set_pruebas_aceptado` no está: lo mueve la DIAN al aceptar el Set de
 * Pruebas, no se toca desde la API. Se lee en la ficha y ya.
 */
const SOFTWARE_VACIO = {
  tipo: '',
  identificador: '',
  pin: '',
  test_set_id: '',
};

type CamposSoftware = typeof SOFTWARE_VACIO;

/**
 * Alta de un software DIAN.
 *
 * Va por `POST /api/emisores/software/` y no por `crear-habilitacion/`: ese
 * atajo, además del software, le siembra al emisor la resolución del Set de
 * Pruebas —numeración del sandbox, que no es suya—, así que solo vale para un
 * emisor en pruebas y no es lo que se pide aquí.
 *
 * Solo pide lo que la DIAN entrega. Los datos del fabricante y el código del
 * proveedor tecnológico no se preguntan: vacíos, el servicio usa los del
 * despliegue (`DIAN_FABRICANTE_*`), que es lo que corresponde con software
 * propio.
 */
function CrearSoftware({ emisor, yaRegistrados, alCrear }: {
  emisor: number;
  yaRegistrados: string[];
  alCrear: () => void;
}) {
  const [datos, setDatos] = useState(SOFTWARE_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [creado, setCreado] = useState(false);

  function poner<C extends keyof CamposSoftware>(campo: C, valor: CamposSoftware[C]) {
    setDatos((previos) => ({ ...previos, [campo]: valor }));
  }

  async function crear(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    setCreado(false);
    try {
      await api('/api/emisores/software/', {
        metodo: 'POST',
        cuerpo: { ...datos, emisor },
      });
      setDatos(SOFTWARE_VACIO);
      setCreado(true);
      alCrear();
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={crear}>
      <p className="panel-guia">
        Los datos que la DIAN entrega al registrar el software, uno por operación. El PIN
        entra en el cálculo del CUFE, así que un dígito de más deja todos los documentos
        rechazados. <a href="/guias/habilitacion-dian/">Cómo se obtienen</a>.
      </p>

      {creado && <Aviso tipo="exito">Software registrado.</Aviso>}
      <ErrorGeneral error={error} />

      <div className="rejilla">
        <Campo id="tipo" etiqueta="Tipo de software" error={errorDe(error, 'tipo')}>
          <select
            id="tipo"
            required
            value={datos.tipo}
            onChange={(e) => poner('tipo', e.target.value)}
          >
            <option value="">Elige…</option>
            {Object.entries(TIPOS_SOFTWARE).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
                {/* Aviso, no impedimento: que ya haya uno de ese tipo es cosa
                    del servidor, y el nuevo puede ser justo el relevo. */}
                {yaRegistrados.includes(valor) ? ' — ya tiene uno' : ''}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          id="identificador"
          etiqueta="ID del software"
          error={errorDe(error, 'identificador')}
          ayuda="El SoftwareID que asigna la DIAN."
        >
          <input
            id="identificador"
            required
            maxLength={100}
            className="monospacio"
            value={datos.identificador}
            onChange={(e) => poner('identificador', e.target.value)}
          />
        </Campo>

        <Campo
          id="pin"
          etiqueta="PIN del software"
          error={errorDe(error, 'pin')}
          ayuda="El del software ante la DIAN, no la clave del certificado. Lo habitual es 12345."
        >
          {/* A la vista y sin autocompletado: se copia del portal de la DIAN y
              hay que poder comprobarlo, y no es una contraseña que el navegador
              deba ofrecerse a guardar.

              El 12345 va de sugerencia y no de valor puesto: es el PIN que casi
              todo el mundo elige en el portal, pero entra en el cálculo del CUFE,
              así que hay que teclearlo mirando el del emisor. Traerlo escrito
              invita a guardar uno que no es y a que lo rechacen todos los
              documentos. */}
          <input
            id="pin"
            required
            maxLength={100}
            autoComplete="off"
            placeholder="12345"
            className="monospacio"
            value={datos.pin}
            onChange={(e) => poner('pin', e.target.value)}
          />
        </Campo>

        <Campo
          id="test_set_id"
          etiqueta="ID del set de pruebas"
          error={errorDe(error, 'test_set_id')}
          ayuda="El TestSetId de la habilitación. Se puede dejar vacío y ponerlo después."
        >
          <input
            id="test_set_id"
            maxLength={100}
            className="monospacio"
            value={datos.test_set_id}
            onChange={(e) => poner('test_set_id', e.target.value)}
          />
        </Campo>
      </div>

      <div className="acciones">
        <button type="submit" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar el software'}
        </button>
      </div>
    </form>
  );
}

/**
 * Pestaña «Software»: el software que la DIAN habilita, uno por operación.
 *
 * En ficha y no en tabla porque cada uno trae una docena de campos, y el PIN
 * arranca tapado: es una credencial, no un dato más.
 */
function PestanaSoftware({ emisor }: { emisor: Emisor }) {
  const { items, error, recargar } = useDelEmisor<Software>(
    '/api/emisores/software/',
    emisor.id,
  );

  return (
    <>
      {/* El orden de la habilitación no es una recomendación: el servidor exige
          certificado activo y vigente para registrar software, así que sin él el
          formulario solo daría un 400. */}
      {emisor.certificado_activo ? (
        <CrearSoftware
          emisor={emisor.id}
          yaRegistrados={items?.map((software) => software.tipo) ?? []}
          alCrear={recargar}
        />
      ) : (
        <p className="panel-guia">
          Para registrar software hace falta antes un certificado activo y vigente: es lo
          que firma la habilitación. Cárgalo en la pestaña «Certificado».
        </p>
      )}

      <h3>Software del emisor</h3>
      <ListaSoftware items={items} error={error} />
    </>
  );
}

function ListaSoftware({ items, error }: { items: Software[] | null; error: unknown }) {
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
        {/* La dirección va justo antes del código postal y en columna normal:
            los dos se leen juntos, y una fila entera para ella dejaba el
            código postal descolgado arriba. */}
        <Dato etiqueta="Dirección">{emisor.direccion}</Dato>
        <Dato etiqueta="Código postal">{emisor.codigo_postal}</Dato>
      </dl>

      <h2>Contacto</h2>
      <dl className="datos">
        <Dato etiqueta="Correo">{emisor.correo}</Dato>
        <Dato etiqueta="Correo en copia">{emisor.correo_copia}</Dato>
        <Dato etiqueta="Teléfono">{emisor.telefono}</Dato>
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
            render: () => <PestanaCertificado emisor={emisor} />,
          },
          {
            id: 'software',
            titulo: 'Software',
            render: () => <PestanaSoftware emisor={emisor} />,
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
