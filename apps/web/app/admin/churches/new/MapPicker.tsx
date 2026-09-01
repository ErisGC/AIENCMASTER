'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
// El CSS del mapa se carga AQUÍ, no en el layout raíz: éste es el único sitio
// que usa Leaflet (la ficha pública de iglesia muestra un mapa incrustado de
// OpenStreetMap, sin la librería). Cargarlo globalmente lo enviaba a cada
// visitante del portal, que nunca lo necesita.
import 'leaflet/dist/leaflet.css';
// Las imágenes del marcador vienen del propio paquete. Antes se pedían a un CDN
// externo en cada uso: si estaba caído o bloqueado, el marcador desaparecía y
// no había forma de ver el punto elegido.
import iconoUrl from 'leaflet/dist/images/marker-icon.png';
import iconoRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import sombraUrl from 'leaflet/dist/images/marker-shadow.png';
import styles from './page.module.css';

type Point = { lat: number; lng: number };

const markerIcon = new L.Icon({
  iconUrl: iconoUrl.src,
  iconRetinaUrl: iconoRetinaUrl.src,
  shadowUrl: sombraUrl.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      const lat = Number(e.latlng.lat.toFixed(7));
      const lng = Number(e.latlng.lng.toFixed(7));
      onPick({ lat, lng });
    },
  });
  return null;
}

export function MapPicker({
  value,
  onChange,
  center = { lat: 8.106, lng: -73.366 }, // Ocaña aprox (ajústalo)
  zoom = 13,
}: {
  value: Point | null;
  onChange: (p: Point) => void;
  center?: Point;
  zoom?: number;
}) {
  return (
    <div className={styles.mapWrap}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className={styles.map}
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onChange} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={markerIcon}
          />
        )}
      </MapContainer>
      <p className={styles.mapHint}>
        Haz click en el mapa para fijar la ubicación.
      </p>
    </div>
  );
}
