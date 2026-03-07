import React from 'react';
import MapView, { Marker } from 'react-native-maps';

export type MarkerData = {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    description: string;
}

export default function MapComponent({ markers = [] }: { markers?: MarkerData[] }) {
    // Definimos a região inicial baseada no primeiro marcador manual, ou o default (SP Centro)
    const initialRegion = markers.length > 0 ? {
        latitude: markers[0].latitude,
        longitude: markers[0].longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    } : {
        latitude: -23.550520,
        longitude: -46.633308,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    };

    return (
        <MapView
            style={{ flex: 1 }}
            initialRegion={initialRegion}
        >
            <Marker
                coordinate={{ latitude: -23.550520, longitude: -46.633308 }}
                title="Unidade Principal"
                description="Biodigestor Centro Administrativo"
                pinColor="#16a34a"
            />
            {markers.map((m) => (
                <Marker
                    key={m.id}
                    coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                    title={m.title}
                    description={m.description}
                    pinColor="#3b82f6"
                />
            ))}
        </MapView>
    );
}
