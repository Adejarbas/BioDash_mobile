import { supabase } from "./supabase"

// API Client - Reutilizado do BioDashFront com adaptações para React Native
const API_BASE_URL = 'http://localhost:3003' // Troque pelo IP do seu servidor quando rodar em device real

// AWS Lambda Endpoints (Placeholder - Substitua pela URL da sua CloudFront/API Gateway)
const MARKERS_LAMBDA_URL = 'https://sua-url-lambda.aws.com/markers' 

export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    message?: string
    error?: string
}

export async function apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const isLambda = endpoint.startsWith('https://')
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    }

    try {
        const res = await fetch(url, config)
        const data = await res.json()

        if (!res.ok) {
            return {
                success: false,
                error: data.message || `Erro ${res.status}: ${res.statusText}`,
            }
        }

        return {
            success: true,
            data: data.data || data,
            message: data.message,
        }
    } catch (err: any) {
        console.error(`API Request Error [${endpoint}]:`, err)
        return {
            success: false,
            error: 'Erro de conexão. Verifique se o backend ou lambda está rodando.',
        }
    }
}

const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
        console.warn('Usuário não autenticado ou sessão expirada.')
        return {}
    }

    return {
        'Authorization': `Bearer ${session.access_token}`
    }
}

// Marker specific functions for MongoDB
export const markersApi = {
    // Note que removemos o userId do parâmetro. A Lambda vai descobrir quem é o usuário pelo Token!
    fetch: async () => {
        const headers = await getAuthHeaders()
        return apiRequest(MARKERS_LAMBDA_URL, { 
            method: 'GET', 
            headers 
        })
    },
    
    save: async (data: any) => {
        const headers = await getAuthHeaders()
        return apiRequest(MARKERS_LAMBDA_URL, { 
            method: 'POST', 
            headers,
            body: JSON.stringify(data)
        })
    },
    
    delete: async (id: string) => {
        const headers = await getAuthHeaders()
        return apiRequest(`${MARKERS_LAMBDA_URL}/${id}`, { 
            method: 'DELETE',
            headers
        })
    }
}