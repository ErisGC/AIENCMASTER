'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { nombreLugar, type StatsLugar } from '@/app/lib/admin-stats';

import styles from './stats.module.css';

export type VistaMapa = 'colombia' | 'todo';

const COLOMBIA: L.LatLngBoundsExpression = [
  [-4.3, -79.1],
  [12.6, -66.8],
];
const MUNDO: L.LatLngBoundsExpression = [
  [-45, -130],
  [62, 150],
];

function Encuadre({ vista, lugares }: { vista: VistaMapa; lugares: StatsLugar[] }) {
  const map = useMap();
  useEffect(() => {
    if (vista === 'colombia') {
      map.fitBounds(COLOMBIA);
    } else if (lugares.length === 0) {
      map.fitBounds(MUNDO);
    } else {
      // "Todo": se encuadran todas las zonas con datos, sin acercarse de más.
      const caja = L.latLngBounds(lugares.map((l) => [l.lat, l.lon] as [number, number]));
      map.fitBounds(caja.pad(0.35), { maxZoom: 7 });
    }
  }, [map, vista, lugares]);
  return null;
}

const num = (n: number) => n.toLocaleString('es-CO');

/** Mapa de las zonas desde donde visitan: un círculo por zona, más grande cuanta más gente. */
export function MapaZonas({ lugares, vista }: { lugares: StatsLugar[]; vista: VistaMapa }) {
  const max = Math.max(1, ...lugares.map((l) => l.personas));
  return (
    <MapContainer
      bounds={COLOMBIA}
      className={styles.mapa}
      scrollWheelZoom={false}
      worldCopyJump
      zoomSnap={0.25}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Encuadre vista={vista} lugares={lugares} />
      {lugares.map((l) => (
        <CircleMarker
          key={`${l.lat},${l.lon}`}
          center={[l.lat, l.lon]}
          radius={7 + 17 * Math.sqrt(l.personas / max)}
          pathOptions={{ color: '#1D4F8C', weight: 1.5, fillColor: '#2A6BB5', fillOpacity: 0.45 }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <strong>{nombreLugar(l)}</strong>
            <br />
            {num(l.personas)} {l.personas === 1 ? 'persona' : 'personas'}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
