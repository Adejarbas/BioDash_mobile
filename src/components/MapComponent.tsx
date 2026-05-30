import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

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
        }))
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

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
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerDragEnd',
          id: m.id,
          latitude: latlng.lat,
          longitude: latlng.lng,
        }));
      });
    });

    // Recebe mensagens do React Native
    document.addEventListener('message', function(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'focusLocation') {
          map.setView([msg.latitude, msg.longitude], 15, { animate: true });
        }
      } catch(err) {}
    });

    window.addEventListener('message', function(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'focusLocation') {
          map.setView([msg.latitude, msg.longitude], 15, { animate: true });
        }
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export default function MapComponent({ markers = [], focusLocation, onMarkerDragEnd }: Props) {
    const webViewRef = useRef<WebView>(null);
    const [mapKey, setMapKey] = useState(0);

    const center =
        focusLocation ??
        (markers.length > 0
            ? { latitude: markers[0].latitude, longitude: markers[0].longitude }
            : { latitude: -15.7942, longitude: -47.8825 });

    const zoom = focusLocation ? 15 : markers.length > 0 ? 13 : 5;
    const html = buildLeafletHTML(markers, center, zoom);

    // Envia mensagem de foco sem recarregar o mapa
    useEffect(() => {
        if (!focusLocation || !webViewRef.current) return;
        webViewRef.current.injectJavaScript(`
            (function() {
                try {
                    map.setView([${focusLocation.latitude}, ${focusLocation.longitude}], 15, { animate: true });
                } catch(e) {}
            })();
            true;
        `);
    }, [focusLocation]);

    // Reconstrói o mapa quando o número de marcadores muda
    useEffect(() => {
        setMapKey((k) => k + 1);
    }, [markers.length]);

    const handleMessage = (event: any) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'markerDragEnd' && onMarkerDragEnd) {
                onMarkerDragEnd(msg.id, { latitude: msg.latitude, longitude: msg.longitude });
            }
        } catch {}
    };

    return (
        <View style={styles.container}>
            <WebView
                key={mapKey}
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html }}
                style={styles.webview}
                javaScriptEnabled
                domStorageEnabled
                onMessage={handleMessage}
                scrollEnabled={false}
                bounces={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
