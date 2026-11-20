import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

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

function serializeMarkers(markers: MarkerData[]) {
    return markers.map((m) => ({
        id: m.id,
        lat: m.latitude,
        lng: m.longitude,
        title: m.title,
        description: m.description,
    }));
}

function buildLeafletHTML(
    markers: MarkerData[],
    center: { latitude: number; longitude: number },
    zoom: number
): string {
    const markersJson = JSON.stringify(serializeMarkers(markers));

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .leaflet-popup-content { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; }
    .leaflet-popup-content strong { color: #15803d; display: block; margin-bottom: 4px; font-size: 14px; }
    .leaflet-popup-content span { color: #475569; }
    .leaflet-control-zoom a {
      width: 44px !important;
      height: 44px !important;
      line-height: 44px !important;
      font-size: 20px !important;
    }
    .leaflet-marker-icon:focus-visible,
    .leaflet-control-zoom a:focus-visible {
      outline: 3px solid #15803d !important;
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <div id="map" role="region" aria-label="Mapa interativo de biodigestores"></div>
  <script>
    (function() {
      function postToParent(payload) {
        if (window.parent && window.parent.postMessage) {
          window.parent.postMessage(JSON.stringify(payload), '*');
        }
      }

      if (typeof L === 'undefined') {
        postToParent({ type: 'mapError' });
        return;
      }

      try {
        const initialMarkers = ${markersJson};
        const center = [${center.latitude}, ${center.longitude}];
        const zoom = ${zoom};

        const map = L.map('map', {
          center: center,
          zoom: zoom,
          zoomControl: false,
          attributionControl: true,
        });

        L.control.zoom({
          zoomInTitle: 'Aproximar',
          zoomOutTitle: 'Afastar',
        }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
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

        const markersLayer = L.layerGroup().addTo(map);

        function buildPopupNode(m) {
          const wrapper = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = m.title || '';
          const desc = document.createElement('span');
          desc.textContent = m.description || '';
          wrapper.appendChild(strong);
          wrapper.appendChild(desc);
          return wrapper;
        }

        function renderMarkers(list) {
          markersLayer.clearLayers();
          (list || []).forEach(function(m) {
            const isTemp = typeof m.id === 'string' && m.id.startsWith('temp');
            const icon = isTemp ? yellowIcon : greenIcon;
            const altText = (m.title || 'Biodigestor') + (isTemp ? ' (temporário)' : '');
            const marker = L.marker([m.lat, m.lng], {
              draggable: true,
              icon: icon,
              alt: altText,
              title: m.title || 'Biodigestor',
            }).addTo(markersLayer);

            marker.bindPopup(buildPopupNode(m));

            marker.on('dragend', function(e) {
              const latlng = e.target.getLatLng();
              postToParent({
                type: 'markerDragEnd',
                id: m.id,
                latitude: latlng.lat,
                longitude: latlng.lng,
              });
            });
          });
        }

        renderMarkers(initialMarkers);

        window.addEventListener('message', function(e) {
          try {
            const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (msg && msg.type === 'focusLocation') {
              map.setView([msg.latitude, msg.longitude], 15, { animate: true });
            } else if (msg && msg.type === 'updateMarkers') {
              renderMarkers(msg.markers);
            }
          } catch (err) {}
        });

        postToParent({ type: 'mapReady' });
      } catch (err) {
        postToParent({ type: 'mapError' });
      }
    })();
  </script>
</body>
</html>`;
}

export default function MapComponent({ markers = [], focusLocation, onMarkerDragEnd }: Props) {
    const { colors } = useTheme();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const initialConfigRef = useRef<{
        markers: MarkerData[];
        center: { latitude: number; longitude: number };
        zoom: number;
    } | null>(null);

    if (!initialConfigRef.current) {
        const center =
            focusLocation ??
            (markers.length > 0
                ? { latitude: markers[0].latitude, longitude: markers[0].longitude }
                : { latitude: -15.7942, longitude: -47.8825 });
        const zoom = focusLocation ? 15 : markers.length > 0 ? 13 : 5;
        initialConfigRef.current = { markers, center, zoom };
    }

    const html = buildLeafletHTML(
        initialConfigRef.current.markers,
        initialConfigRef.current.center,
        initialConfigRef.current.zoom
    );

    useEffect(() => {
        if (!focusLocation || !iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ type: 'focusLocation', ...focusLocation }),
            '*'
        );
    }, [focusLocation]);

    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ type: 'updateMarkers', markers: serializeMarkers(markers) }),
            '*'
        );
    }, [markers]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading((stillLoading) => {
                if (stillLoading) setHasError(true);
                return false;
            });
        }, 12000);
        return () => clearTimeout(timer);
    }, [retryKey]);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (iframeRef.current?.contentWindow && e.source !== iframeRef.current.contentWindow) {
                return;
            }
            try {
                const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (!msg) return;
                if (msg.type === 'mapReady') {
                    setIsLoading(false);
                    setHasError(false);
                } else if (msg.type === 'mapError') {
                    setIsLoading(false);
                    setHasError(true);
                } else if (msg.type === 'markerDragEnd' && onMarkerDragEnd) {
                    onMarkerDragEnd(msg.id, { latitude: msg.latitude, longitude: msg.longitude });
                }
            } catch {
                // ignora mensagens malformadas
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [onMarkerDragEnd]);

    const handleRetry = () => {
        const center =
            focusLocation ??
            (markers.length > 0
                ? { latitude: markers[0].latitude, longitude: markers[0].longitude }
                : { latitude: -15.7942, longitude: -47.8825 });
        const zoom = focusLocation ? 15 : markers.length > 0 ? 13 : 5;
        initialConfigRef.current = { markers, center, zoom };
        setHasError(false);
        setIsLoading(true);
        setRetryKey((k) => k + 1);
    };

    return (
        <View style={styles.container} aria-busy={isLoading}>
            {hasError ? (
                <View style={[styles.fallbackBox, { backgroundColor: colors.cardBackground }]}>
                    <Text style={[styles.fallbackTitle, { color: colors.text }]}>
                        Não foi possível carregar o mapa
                    </Text>
                    <Text style={[styles.fallbackSub, { color: colors.textMuted }]}>
                        Verifique sua conexão com a internet e tente novamente.
                    </Text>
                    <TouchableOpacity
                        style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                        onPress={handleRetry}
                        accessibilityRole="button"
                        accessibilityLabel="Tentar carregar mapa novamente"
                    >
                        <Text style={[styles.retryBtnText, { color: colors.onPrimary }]}>Tentar novamente</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <iframe
                        key={retryKey}
                        ref={iframeRef}
                        srcDoc={html}
                        style={styles.iframe}
                        title={`Mapa BioDash com ${markers.length} ${markers.length === 1 ? 'biodigestor' : 'biodigestores'}`}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    />
                    {isLoading && (
                        <View style={[styles.loadingOverlay, { backgroundColor: colors.cardBackground }]}>
                            <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Carregando mapa" />
                            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Carregando mapa...</Text>
                        </View>
                    )}
                </>
            )}
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
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 13,
    },
    fallbackBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 8,
    },
    fallbackTitle: {
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    fallbackSub: {
        fontSize: 13,
        textAlign: 'center',
    },
    retryBtn: {
        marginTop: 6,
        minHeight: 44,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    retryBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});
