/**
 * Selector de un catálogo grande: se escribe y se elige de los resultados.
 *
 * Municipios (más de mil) y países no caben en un `<select>`: la API pagina de
 * diez en diez y no admite `page_size`, así que traerlos enteros costaría cien
 * peticiones. Se busca contra `?search=`, que es justo para lo que está.
 *
 * El valor que sale es el **código** (DANE o ISO 3166), no el id: el id es un
 * serial de cada base y cambia entre ambientes. Junto al código va el elemento
 * entero, para quien necesite algo más de lo elegido —el formulario de emisor
 * saca de ahí el código postal del municipio—.
 */
import { useEffect, useRef, useState } from 'react';

import { type Item, buscar, porCodigo } from '../../lib/catalogos';

interface Props<T extends Item> {
  id: string;
  catalogo: string;
  valor: string;
  onCambio: (codigo: string, item?: T) => void;
  placeholder?: string;
  /** Se vuelve a resolver la etiqueta cuando cambia (p. ej. otro departamento). */
  reiniciarCon?: string;
}

const ESPERA_MS = 250;

export default function SelectorBuscado<T extends Item = Item>({
  id,
  catalogo,
  valor,
  onCambio,
  placeholder,
  reiniciarCon,
}: Props<T>) {
  const [texto, setTexto] = useState('');
  const [opciones, setOpciones] = useState<T[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Al editar, el formulario llega con un código guardado: hay que traducirlo a
  // su nombre para que el campo no muestre un código a secas.
  useEffect(() => {
    let vigente = true;
    if (!valor) {
      setTexto('');
      return;
    }
    // Si el campo ya muestra ese mismo código, no hay nada que resolver: es lo
    // que acaba de elegirse en la lista, y preguntarlo otra vez sería una
    // petición por cada selección.
    if (texto.endsWith(`(${valor})`)) return;

    void porCodigo<T>(catalogo, valor).then((item) => {
      if (vigente && item) setTexto(`${item.nombre} (${item.codigo})`);
    });
    return () => {
      vigente = false;
    };
    // `texto` se consulta pero no dispara: solo interesa su valor del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo, valor, reiniciarCon]);

  // Cerrar al pinchar fuera; si no, la lista se queda flotando sobre el resto
  // del formulario.
  useEffect(() => {
    function fuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  function escribir(nuevo: string) {
    setTexto(nuevo);
    // Lo tecleado deja de corresponder a lo elegido: se limpia el valor para no
    // guardar un código que ya no es el que se ve.
    if (valor) onCambio('');
    setAbierto(true);
  }

  // Se espera a que la persona deje de teclear: una petición por pulsación
  // gasta el tope de la API sin dar mejores resultados.
  useEffect(() => {
    if (!abierto || texto.trim().length < 2) {
      setOpciones([]);
      return;
    }
    setBuscando(true);
    const temporizador = setTimeout(() => {
      buscar<T>(catalogo, texto)
        .then(setOpciones)
        .catch(() => setOpciones([]))
        .finally(() => setBuscando(false));
    }, ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [texto, abierto, catalogo]);

  return (
    <div ref={contenedor} style={{ position: 'relative' }}>
      <input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
      />
      {abierto && texto.trim().length >= 2 && (
        <ul className="sugerencias" role="listbox">
          {buscando && <li className="sugerencias__nota">Buscando…</li>}
          {!buscando && opciones.length === 0 && (
            <li className="sugerencias__nota">Sin resultados.</li>
          )}
          {opciones.map((opcion) => (
            <li key={opcion.id}>
              <button
                type="button"
                onClick={() => {
                  onCambio(opcion.codigo, opcion);
                  setTexto(`${opcion.nombre} (${opcion.codigo})`);
                  setAbierto(false);
                }}
              >
                {opcion.nombre} <span className="monospacio">{opcion.codigo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
