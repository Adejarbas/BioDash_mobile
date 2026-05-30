import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

export type MarkerData = {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    description: string;
};

interface Props {
    markers?: MarkerData[];
    focusLocation?: { latitude: number; longitude: number };
    onMarkerDragEnd?: (id: string, coordinate: { latitude: number; longitude: number }) => void;
}

function buildLeafletHTML(
    markers: MarkerData[],
    center: { latitude: number; longitude: number },
    zoom: number
): string {
    const markersJson = JSON.stringify(
        markers.map((m) => ({
            id: m.id,
            lat: m.latitude,
            lng: m.longitude,
            title: m.title,
            description: m.description,
            draggable: true,
        }))
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .leaflet-popup-content { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; }
    .leaflet-popup-content strong { color: #16a34a; display: block; margin-bottom: 4px; font-size: 14px; }
    .leaflet-popup-content span { color: #64748b; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const markersData = ${markersJson};
    const center = [${center.latitude}, ${center.longitude}];
    const zoom = ${zoom};

    const map = L.map('map', {
      center: center,
      zoom: zoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Ícone verde personalizado
    const greenIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const yellowIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    markersData.forEach(function(m) {
      const icon = m.id.startsWith('temp') ? yellowIcon : greenIcon;
      const marker = L.marker([m.lat, m.lng], { draggable: true, icon: icon }).addTo(map);
      marker.bindPopup('<strong>' + m.title + '</strong><br><span>' + m.description + '</span>');

      marker.on('dragend', function(e) {
        const latlng = e.target.getLatLng();
        window.parent.postMessage(JSON.stringify({
          type: 'markerDragEnd',
          id: m.id,
          latitude: latlng.lat,
          longitude: latlng.lng,
        }), '*');
      });
    });

    // Recebe mensagens do React Native Web (pan/zoom para local específico)
    window.addEventListener('message', function(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'focusLocation') {
          map.setView([msg.latitude, msg.longitude], 15, { animate: true });
        }
      } catch (err) {}
    });

    // Informa que o mapa carregou
    window.parent.postMessage(JSON.stringify({ type: 'mapReady' }), '*');
  </script>
</body>
</html>`;
}

export default function MapComponent({ markers = [], focusLocation, onMarkerDragEnd }: Props) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [iframeKey, setIframeKey] = useState(0);

    const center =
        focusLocation ??
        (markers.length > 0
            ? { latitude: markers[0].latitude, longitude: markers[0].longitude }
            : { latitude: -15.7942, longitude: -47.8825 });

    const zoom = focusLocation ? 15 : markers.length > 0 ? 13 : 5;
    const html = buildLeafletHTML(markers, center, zoom);

    // Quando focusLocation muda e o iframe já está pronto, manda mensagem em vez de recarregar
    useEffect(() => {
        if (!focusLocation || !iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ type: 'focusLocation', ...focusLocation }),
            '*'
        );
    }, [focusLocation]);

    // Quando markers mudam (adição/remoção), reconstrói o iframe
    useEffect(() => {
        setIframeKey((k) => k + 1);
    }, [markers.length]);

    // Escuta eventos de drag do Leaflet
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'markerDragEnd' && onMarkerDragEnd) {
                    onMarkerDragEnd(msg.id, { latitude: msg.latitude, longitude: msg.longitude });
                }
            } catch {}
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [onMarkerDragEnd]);

    return (
        <View style={styles.container}>
            <iframe
                key={iframeKey}
                ref={iframeRef}
                srcDoc={html}
                style={styles.iframe}
                title="Mapa BioDash"
                sandbox="allow-scripts allow-same-origin"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden' as any,
    },
    iframe: {
        width: '100%',
        height: '100%',
        border: 'none' as any,
    } as any,
});
