import React from 'react';
import { View, Text } from 'react-native';

export default function MapComponent() {
    return (
        <View style={{ flex: 1, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32, opacity: 0.5 }}>🗺️</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748b', marginTop: 8 }}>Mapa (Apenas no App Mobile)</Text>
            <View style={{ position: 'absolute', top: '40%', left: '55%' }}>
                <Text style={{ fontSize: 24 }}>📍</Text>
            </View>
        </View>
    );
}
