import React, { useEffect, useRef } from 'react';
import MapView, { Marker, LatLng } from 'react-native-maps';

export type MarkerData = {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    description: string;
}

export default function MapComponent({
    markers = [],
    focusLocation,
    onMarkerDragEnd
}: {
    markers?: MarkerData[],
    focusLocation?: { latitude: number, longitude: number },
    onMarkerDragEnd?: (id: string, coordinate: LatLng) => void
}) {
    const mapRef = useRef<MapView>(null);

    // Zoom explícito p/ localização focada
    useEffect(() => {
        if (focusLocation && mapRef.current) {
            mapRef.current.animateToRegion({
                ...focusLocation,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            }, 1000);
        }
    }, [focusLocation]);

    // Zoom inicial ao carregar
    useEffect(() => {
        if (markers.length > 0 && mapRef.current && !focusLocation) {
            mapRef.current.animateToRegion({
                latitude: markers[0].latitude,
                longitude: markers[0].longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            }, 1000);
        }
    }, []);

    const initialRegion = {
        latitude: markers.length > 0 ? markers[0].latitude : -15.7942,
        longitude: markers.length > 0 ? markers[0].longitude : -47.8825,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    return (
        <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={initialRegion}
        >
            {markers.map((m) => (
                <Marker
                    key={m.id}
                    coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                    title={m.title}
                    description={m.description}
                    pinColor={m.id.startsWith('temp') ? "#fbbf24" : "#16a34a"}
                    draggable
                    onDragEnd={(e) => {
                        if (onMarkerDragEnd) {
                            onMarkerDragEnd(m.id, e.nativeEvent.coordinate);
                        }
                    }}
                />
            ))}
        </MapView>
    );
}
