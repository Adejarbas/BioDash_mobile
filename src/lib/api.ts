// API Client - Reutilizado do BioDashFront com adaptações para React Native
const API_BASE_URL = 'http://localhost:3003' // Troque pelo IP do seu servidor quando rodar em device real

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
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        // Em React Native, cookies não funcionam nativamente. Auth via Supabase token.
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
            error: 'Erro de conexão. Verifique se o backend está rodando.',
        }
    }
}
