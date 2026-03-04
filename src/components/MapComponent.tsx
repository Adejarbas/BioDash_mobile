import React from 'react';
import MapView, { Marker } from 'react-native-maps';

export default function MapComponent() {
    return (
        <MapView
            style={{ flex: 1 }}
            initialRegion={{
                latitude: -23.550520,
                longitude: -46.633308,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            }}
        >
            <Marker
                coordinate={{ latitude: -23.550520, longitude: -46.633308 }}
                title="Unidade Principal"
                description="Biodigestor Centro Administrativo"
                pinColor="#16a34a"
            />
        </MapView>
    );
}
