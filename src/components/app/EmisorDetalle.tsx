/**
 * Ficha de un emisor, de solo lectura.
 *
 * Muestra el emisor entero tal y como lo devuelve la API, incluido lo que el
 * formulario no puede tocar: el dígito de verificación y la habilitación ante
 * la DIAN.
 *
 * Lo que concede esa habilitación —certificado, software y resoluciones— va en
 * pestañas, junto con los webhooks, porque son listas de otras tantas rutas de
 * la API y enseñarlas a la vez convertiría la ficha en un informe. Cada pestaña
 * pide lo suyo cuando se abre, no antes.
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
  Modal,
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

interface Webhook {
  id: number;
  emisor: number;
  nombre: string;
  url: string;
  estado_validado: boolean;
  estado_notificado: boolean;
  creado_en: string;
}

/** Lo que devuelve `/webhook/{id}/probar/`: 200 aunque el receptor falle. */
interface PruebaWebhook {
  entregado: boolean;
  codigo_http: number | null;
  detalle: string;
  duracion_ms: number;
}

/**
 * La causa habitual de cada fallo de la prueba, según la API. Lo que no está
 * aquí se queda con el `detalle` que devuelve el receptor.
 */
const PISTAS_PRUEBA: Record<number, string> = {
  401: 'El receptor rechazó la firma: el secreto no coincide o su reloj está desfasado.',
  404: 'El receptor no conoce la referencia externa de este emisor.',
};

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
 * cuanto la petición termina. Vive dentro de la ventana modal, que lo monta de
 * cero cada vez que se abre: la clave tampoco sobrevive a un «Cancelar».
 */
function CargarCertificado({ emisor, alCargar, alCancelar }: {
  emisor: number;
  alCargar: () => void;
  alCancelar: () => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function cargar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const elegido = archivo.current?.files?.[0];
    if (!elegido) return;

    setEnviando(true);
    setError(null);

    const cuerpo = new FormData();
    cuerpo.append('emisor', String(emisor));
    cuerpo.append('archivo', elegido);
    cuerpo.append('clave', clave);

    try {
      await api('/api/emisores/certificado/cargar/', { metodo: 'POST', cuerpo });
      alCargar();
    } catch (fallo) {
      setError(fallo);
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

      <ErrorGeneral error={error} />

      <div className="rejilla">
        <Campo
          id="archivo"
          etiqueta="Archivo del certificado"
          error={errorDe(error, 'archivo')}
          ayuda="Un .p12 o .pfx."
        >
          <input
            id="archivo"
            ref={archivo}
            type="file"
            required
            autoFocus
            accept=".p12,.pfx"
          />
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
        <button type="button" className="secundario" onClick={alCancelar}>
          Cancelar
        </button>
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
 * La carga va en una ventana modal, y el botón que la abre solo sale cuando no
 * hay certificado. No es un adorno: la API no tiene reemplazo —solo `cargar` y
 * `destroy`—, así que ofrecer la carga con uno ya puesto invita a un intento que
 * el servidor rechaza. Para cambiarlo se elimina el actual desde la lista.
 */
function PestanaCertificado({ emisor }: { emisor: Emisor }) {
  const { items, error, recargar } = useDelEmisor<Certificado>(
    '/api/emisores/certificado/',
    emisor.id,
  );
  const [abierta, setAbierta] = useState(false);
  const [cargado, setCargado] = useState(false);

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
        <>
          <p className="panel-guia">
            Este emisor no tiene certificado: sin él no puede firmar, y tampoco registrar
            software ante la DIAN.
          </p>
          <div className="acciones" style={{ marginTop: 0, marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => {
                setCargado(false);
                setAbierta(true);
              }}
            >
              Cargar certificado
            </button>
          </div>
        </>
      )}

      {cargado && <Aviso tipo="exito">Certificado cargado.</Aviso>}

      <Modal titulo="Cargar certificado" abierta={abierta} alCerrar={() => setAbierta(false)}>
        <CargarCertificado
          emisor={emisor.id}
          alCancelar={() => setAbierta(false)}
          alCargar={() => {
            setAbierta(false);
            setCargado(true);
            recargar();
          }}
        />
      </Modal>

      <h3>Certificados del emisor</h3>
      <ListaCertificados
        items={items}
        error={error}
        alEliminar={() => {
          setCargado(false);
          recargar();
        }}
      />
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
 *
 * Vive dentro de la ventana modal, que lo monta de cero cada vez que se abre.
 */
function CrearSoftware({ emisor, yaRegistrados, alCrear, alCancelar }: {
  emisor: number;
  yaRegistrados: string[];
  alCrear: () => void;
  alCancelar: () => void;
}) {
  const [datos, setDatos] = useState(SOFTWARE_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function poner<C extends keyof CamposSoftware>(campo: C, valor: CamposSoftware[C]) {
    setDatos((previos) => ({ ...previos, [campo]: valor }));
  }

  async function crear(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api('/api/emisores/software/', {
        metodo: 'POST',
        cuerpo: { ...datos, emisor },
      });
      alCrear();
    } catch (fallo) {
      setError(fallo);
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

      <ErrorGeneral error={error} />

      <div className="rejilla">
        <Campo id="tipo" etiqueta="Tipo de software" error={errorDe(error, 'tipo')}>
          <select
            id="tipo"
            required
            autoFocus
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
        <button type="button" className="secundario" onClick={alCancelar}>
          Cancelar
        </button>
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
 * arranca tapado: es una credencial, no un dato más. El alta va en una ventana
 * modal, como las demás pestañas.
 */
function PestanaSoftware({ emisor }: { emisor: Emisor }) {
  const { items, error, recargar } = useDelEmisor<Software>(
    '/api/emisores/software/',
    emisor.id,
  );
  const [abierta, setAbierta] = useState(false);
  const [creado, setCreado] = useState(false);

  return (
    <>
      {/* El orden de la habilitación no es una recomendación: el servidor exige
          certificado activo y vigente para registrar software, así que sin él el
          formulario solo daría un 400. */}
      {emisor.certificado_activo ? (
        <div className="acciones" style={{ marginTop: 0, marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => {
              setCreado(false);
              setAbierta(true);
            }}
          >
            Registrar software
          </button>
        </div>
      ) : (
        <p className="panel-guia">
          Para registrar software hace falta antes un certificado activo y vigente: es lo
          que firma la habilitación. Cárgalo en la pestaña «Certificado».
        </p>
      )}

      {creado && <Aviso tipo="exito">Software registrado.</Aviso>}

      <Modal titulo="Registrar software" abierta={abierta} alCerrar={() => setAbierta(false)}>
        <CrearSoftware
          emisor={emisor.id}
          yaRegistrados={items?.map((software) => software.tipo) ?? []}
          alCancelar={() => setAbierta(false)}
          alCrear={() => {
            setAbierta(false);
            setCreado(true);
            recargar();
          }}
        />
      </Modal>

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
 * Lo que el formulario de webhook manda.
 *
 * Los dos avisos arrancan marcados: un webhook sin ninguno no recibiría nada, y
 * lo normal al darlo de alta es querer enterarse de todo. El `secreto` es
 * opcional y de solo escritura: la API no lo devuelve nunca.
 */
const WEBHOOK_VACIO = {
  nombre: '',
  url: '',
  estado_validado: true,
  estado_notificado: true,
  secreto: '',
};

type CamposWebhook = typeof WEBHOOK_VACIO;

/**
 * Alta o edición de un webhook, según llegue o no `webhook`. Vive dentro de la
 * ventana modal, que lo monta de cero cada vez que se abre.
 *
 * El secreto no viene en la respuesta, así que al editar el campo arranca vacío
 * y vacío significa «dejarlo como está». Para quitarlo hay una casilla aparte:
 * mandar `secreto: ''` es lo que la API entiende como borrarlo, y no puede ser
 * lo que pase por no tocar el campo.
 */
function FormularioWebhook({ emisor, webhook, alGuardar, alCancelar }: {
  emisor: number;
  webhook: Webhook | null;
  alGuardar: () => void;
  alCancelar: () => void;
}) {
  const [datos, setDatos] = useState<CamposWebhook>(
    webhook
      ? {
          nombre: webhook.nombre,
          url: webhook.url,
          estado_validado: webhook.estado_validado,
          estado_notificado: webhook.estado_notificado,
          secreto: '',
        }
      : WEBHOOK_VACIO,
  );
  const [quitarSecreto, setQuitarSecreto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function poner<C extends keyof CamposWebhook>(campo: C, valor: CamposWebhook[C]) {
    setDatos((previos) => ({ ...previos, [campo]: valor }));
  }

  async function guardar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    // Un secreto vacío no se manda: vacío, la API lo entiende como «quitarlo».
    const { secreto, ...resto } = datos;
    const cuerpo = quitarSecreto
      ? { ...resto, secreto: '' }
      : { ...resto, ...(secreto ? { secreto } : {}) };
    try {
      if (webhook) {
        await api(`/api/emisores/webhook/${webhook.id}/`, { metodo: 'PATCH', cuerpo });
      } else {
        await api('/api/emisores/webhook/', {
          metodo: 'POST',
          cuerpo: { ...cuerpo, emisor },
        });
      }
      alGuardar();
    } catch (fallo) {
      setError(fallo);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <p className="panel-guia">
        Una URL de tu sistema a la que avisar de lo que pasa con los documentos de este
        emisor. Solo HTTPS: el aviso lleva datos fiscales.
      </p>

      <ErrorGeneral error={error} />

      <Campo
        id="webhook-nombre"
        etiqueta="Nombre"
        error={errorDe(error, 'nombre')}
        ayuda="Que se reconozca de un vistazo: “ERP producción”, “ERP pruebas”."
      >
        <input
          id="webhook-nombre"
          required
          autoFocus
          maxLength={150}
          value={datos.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
        />
      </Campo>

      <Campo id="webhook-url" etiqueta="URL" error={errorDe(error, 'url')}>
        <input
          id="webhook-url"
          type="url"
          required
          maxLength={500}
          placeholder="https://"
          className="monospacio"
          value={datos.url}
          onChange={(e) => poner('url', e.target.value)}
        />
      </Campo>

      {!quitarSecreto && (
        <Campo
          id="webhook-secreto"
          etiqueta={webhook ? 'Secreto nuevo (opcional)' : 'Secreto (opcional)'}
          error={errorDe(error, 'secreto')}
          ayuda={
            webhook
              ? 'Vacío deja el que haya. El actual no se puede ver: solo reemplazar o quitar.'
              : 'Con él se firman los avisos, para que tu sistema compruebe que salen de aquí. No se vuelve a mostrar.'
          }
        >
          <EntradaContrasena
            id="webhook-secreto"
            autoComplete="off"
            requerido={false}
            maxLength={255}
            valor={datos.secreto}
            onCambio={(valor) => poner('secreto', valor)}
          />
        </Campo>
      )}

      {webhook && (
        <label className="casilla" style={{ marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={quitarSecreto}
            onChange={(e) => setQuitarSecreto(e.target.checked)}
          />
          Quitar el secreto: los avisos saldrán sin firmar
        </label>
      )}

      <fieldset className="casillas-avisos">
        <legend>Avisar de</legend>
        <label className="casilla">
          <input
            type="checkbox"
            checked={datos.estado_validado}
            onChange={(e) => poner('estado_validado', e.target.checked)}
          />
          La validación de la DIAN
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={datos.estado_notificado}
            onChange={(e) => poner('estado_notificado', e.target.checked)}
          />
          La notificación al adquiriente
        </label>
      </fieldset>

      <div className="acciones">
        <button type="button" className="secundario" onClick={alCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando}>
          {enviando
            ? 'Guardando…'
            : webhook ? 'Guardar los cambios' : 'Crear el webhook'}
        </button>
      </div>
    </form>
  );
}

/**
 * Pestaña «Webhooks»: las URL a las que se avisa de lo que pasa con los
 * documentos. El alta y la edición van en una ventana modal para no empujar la
 * lista hacia abajo con un formulario que se usa pocas veces.
 */
function PestanaWebhooks({ emisor }: { emisor: Emisor }) {
  // Esta ruta sí filtra por emisor, así que no hace falta recorrer las páginas
  // de los demás; el filtro de `delEmisor` queda de más, pero no estorba.
  const { items, error, recargar } = useDelEmisor<Webhook>(
    `/api/emisores/webhook/?emisor=${emisor.id}`,
    emisor.id,
  );
  // `null`: cerrada. `'nuevo'`: alta. Un webhook: su edición.
  const [editando, setEditando] = useState<Webhook | 'nuevo' | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  function abrir(cual: Webhook | 'nuevo') {
    setHecho(null);
    setEditando(cual);
  }

  const webhook = editando === 'nuevo' ? null : editando;

  return (
    <>
      <div className="acciones" style={{ marginTop: 0, marginBottom: '1rem' }}>
        <button type="button" onClick={() => abrir('nuevo')}>
          Nuevo webhook
        </button>
      </div>

      {hecho && <Aviso tipo="exito">{hecho}</Aviso>}

      <Modal
        titulo={webhook ? `Editar «${webhook.nombre}»` : 'Nuevo webhook'}
        abierta={editando !== null}
        alCerrar={() => setEditando(null)}
      >
        <FormularioWebhook
          emisor={emisor.id}
          webhook={webhook}
          alCancelar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            setHecho(webhook ? 'Webhook actualizado.' : 'Webhook creado.');
            recargar();
          }}
        />
      </Modal>

      <ListaWebhooks
        items={items}
        error={error}
        alEditar={abrir}
        alEliminar={() => {
          setHecho('Webhook eliminado.');
          recargar();
        }}
      />
    </>
  );
}

function ListaWebhooks({ items, error, alEditar, alEliminar }: {
  items: Webhook[] | null;
  error: unknown;
  alEditar: (webhook: Webhook) => void;
  alEliminar: () => void;
}) {
  // Como en los certificados: el fallo de una acción va aparte del de la lista.
  const [errorAccion, setErrorAccion] = useState<unknown>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [probando, setProbando] = useState<number | null>(null);
  const [prueba, setPrueba] = useState<{ webhook: Webhook; resultado: PruebaWebhook } | null>(
    null,
  );
  const ocupado = borrando !== null || probando !== null;

  if (error) return <ErrorGeneral error={error} />;
  if (items === null) return <Cargando />;
  if (items.length === 0) {
    return <p className="vacio">Este emisor no tiene ningún webhook.</p>;
  }

  async function eliminar(webhook: Webhook) {
    const seguro = window.confirm(
      `Eliminar el webhook "${webhook.nombre}". ${webhook.url} dejará de recibir ` +
        'avisos, y no se puede recuperar. ¿Seguimos?',
    );
    if (!seguro) return;
    setErrorAccion(null);
    setPrueba(null);
    setBorrando(webhook.id);
    try {
      await api(`/api/emisores/webhook/${webhook.id}/`, { metodo: 'DELETE' });
      alEliminar();
    } catch (fallo) {
      setErrorAccion(fallo);
    } finally {
      setBorrando(null);
    }
  }

  // Un 400 (sin secreto, o emisor sin referencia externa) no llega a mandar
  // nada y sale como error; lo que respondió el receptor, en `prueba`.
  async function probar(webhook: Webhook) {
    setErrorAccion(null);
    setPrueba(null);
    setProbando(webhook.id);
    try {
      const resultado = await api<PruebaWebhook>(
        `/api/emisores/webhook/${webhook.id}/probar/`,
        { metodo: 'POST' },
      );
      setPrueba({ webhook, resultado });
    } catch (fallo) {
      setErrorAccion(fallo);
    } finally {
      setProbando(null);
    }
  }

  return (
    <>
      <ErrorGeneral error={errorAccion} />
      {prueba && <ResultadoPrueba {...prueba} />}
      <div className="tabla-contenedor">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>URL</th>
              <th>Validación</th>
              <th>Notificación</th>
              <th>Creado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {items.map((webhook) => (
              <tr key={webhook.id}>
                <td>{webhook.nombre}</td>
                <td className="monospacio">{webhook.url}</td>
                <td><Marca valor={webhook.estado_validado} /></td>
                <td><Marca valor={webhook.estado_notificado} /></td>
                <td>
                  {new Date(webhook.creado_en).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td>
                  <div className="acciones" style={{ margin: 0, flexWrap: 'nowrap' }}>
                    <button
                      type="button"
                      className="secundario"
                      disabled={ocupado}
                      onClick={() => void probar(webhook)}
                    >
                      {probando === webhook.id ? 'Probando…' : 'Probar'}
                    </button>
                    <button
                      type="button"
                      className="secundario"
                      disabled={ocupado}
                      onClick={() => alEditar(webhook)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="peligro"
                      disabled={ocupado}
                      onClick={() => void eliminar(webhook)}
                    >
                      {borrando === webhook.id ? 'Eliminando…' : 'Eliminar'}
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

function ResultadoPrueba({ webhook, resultado }: {
  webhook: Webhook;
  resultado: PruebaWebhook;
}) {
  const { entregado, codigo_http, detalle, duracion_ms } = resultado;
  if (entregado) {
    return (
      <Aviso tipo="exito">
        «{webhook.nombre}» recibió el aviso de prueba ({codigo_http}, {duracion_ms} ms).
      </Aviso>
    );
  }
  const pista =
    codigo_http === null
      ? 'La URL no respondió.'
      : PISTAS_PRUEBA[codigo_http] ?? `El receptor respondió ${codigo_http}.`;
  return (
    <Aviso>
      <p>
        «{webhook.nombre}» no aceptó el aviso de prueba. {pista}
      </p>
      {detalle && <p className="monospacio">{detalle}</p>}
    </Aviso>
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
        etiqueta="Certificado, software, resoluciones y webhooks"
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
          {
            id: 'webhooks',
            titulo: 'Webhooks',
            render: () => <PestanaWebhooks emisor={emisor} />,
          },
        ]}
      />
    </>
  );
}
