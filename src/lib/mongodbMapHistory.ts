export type MapHistoryMarker = {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    description: string;
};

import { apiRequest } from './api';
import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
        throw new Error('Sessao expirada. Faca login novamente.');
    }

    return token;
}

export async function fetchMapHistoryByUser(userId: string): Promise<MapHistoryMarker[]> {
    if (!userId) {
        return [];
    }

    const token = await getAccessToken();
    const response = await apiRequest<MapHistoryMarker[]>('/api/map-history', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.success) {
        throw new Error(response.error || 'Falha ao carregar historico do mapa.');
    }

    const markers = Array.isArray(response.data) ? response.data : [];

    return markers
        .map((doc, index) => {
            const latitude = Number(doc.latitude);
            const longitude = Number(doc.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
            }

            return {
                id: doc.id || `marker-${index}`,
                latitude,
                longitude,
                title: doc.title || 'Marcador',
                description: doc.description || '',
            } satisfies MapHistoryMarker;
        })
        .filter((item): item is MapHistoryMarker => item !== null);
}

export async function saveMapHistoryMarker(params: {
    userId: string;
    userEmail?: string | null;
    marker: MapHistoryMarker;
}) {
    const { marker } = params;
    const token = await getAccessToken();

    const response = await apiRequest<{ persisted: boolean }>('/api/map-history', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ marker }),
    });

    if (!response.success) {
        throw new Error(response.error || 'Falha ao salvar historico do mapa.');
    }

    return {
        persisted: Boolean(response.data?.persisted),
        reason: 'ok' as const,
    };
}
