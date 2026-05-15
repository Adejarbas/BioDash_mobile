import AsyncStorage from "@react-native-async-storage/async-storage";

// URL base do backend (EC2 AWS - node/express conectado ao MongoDB e PostgreSQL RDS)
// EXPO_PUBLIC_API_URL deve incluir o sufixo /api, ex: http://54.91.34.164:3003/api
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://54.91.34.164:3003/api";

// Endpoint de geolocalização (conectado ao MongoDB na EC2 via backend)
const MARKERS_URL = `${API_BASE_URL}/markers`;

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ==========================================
// Helper base — faz requisições HTTP genéricas
// ==========================================
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const config: RequestInit = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  try {
    const res = await fetch(url, config);
    const responseText = await res.text();
    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`🔴 Erro de JSON na API [${url}]: ${responseText}`);
      return { success: false, error: "O servidor não enviou um JSON válido." };
    }

    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Erro ${res.status}: ${res.statusText}`,
      };
    }

    return { success: true, data: data.hasOwnProperty('data') ? data.data : data, message: data.message };
  } catch (err: any) {
    console.error(`API Request Error [${endpoint}]:`, err);
    return {
      success: false,
      error: "Erro de conexão. Verifique se o backend está rodando.",
    };
  }
}

// ==========================================
// Helper autenticado — injeta o Bearer token
// ==========================================
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await AsyncStorage.getItem("@biodash_jwt_token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

async function authRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  return apiRequest<T>(endpoint, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
}

// ==========================================
// markersApi — Geolocalização (MongoDB)
// ==========================================
export const markersApi = {
  fetch: () => authRequest(MARKERS_URL, { method: "GET" }),
  save: (data: any) =>
    authRequest(MARKERS_URL, { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) =>
    authRequest(`${MARKERS_URL}/${id}`, { method: "DELETE" }),
};

// ==========================================
// indicatorsApi — Indicadores do Biodigestor (PostgreSQL)
// ==========================================
export const indicatorsApi = {
  fetch: () => authRequest(`${API_BASE_URL}/indicators`, { method: "GET" }),
  save: (data: {
    wasteProcessed: number;
    energyGenerated: number;
    taxSavings: number;
    month: string;
    year: string;
  }) =>
    authRequest(`${API_BASE_URL}/indicators`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ==========================================
// maintenanceApi — Manutenções (PostgreSQL)
// ==========================================
export const maintenanceApi = {
  fetchSchedules: () =>
    authRequest(`${API_BASE_URL}/maintenance/schedules`, { method: "GET" }),
  updateSchedule: (id: string, status: string) =>
    authRequest(`${API_BASE_URL}/maintenance/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  deleteSchedule: (id: string) =>
    authRequest(`${API_BASE_URL}/maintenance/schedules/${id}`, {
      method: "DELETE",
    }),
  createSchedule: (data: {
    name: string;
    priority: string;
    scheduledDate: string;
  }) =>
    authRequest(`${API_BASE_URL}/maintenance/schedules`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  fetchIncident: () =>
    authRequest(`${API_BASE_URL}/maintenance/incidents`, { method: "GET" }),
  resolveIncident: (message: string) =>
    authRequest(`${API_BASE_URL}/maintenance/incidents/active`, {
      method: "PUT",
      body: JSON.stringify({ resolution_message: message, status: "resolved" }),
    }),
};

// ==========================================
// alertsApi — Alertas de Sensores (PostgreSQL)
// ==========================================
export const alertsApi = {
  fetch: () => authRequest(`${API_BASE_URL}/alerts`, { method: "GET" }),
  create: (data: { alertLevel: string; message: string }) =>
    authRequest(`${API_BASE_URL}/alerts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ==========================================
// profileApi — Perfil do Usuário (PostgreSQL)
// ==========================================
export const profileApi = {
  fetch: () => authRequest(`${API_BASE_URL}/profile`, { method: "GET" }),
  update: (data: any) =>
    authRequest(`${API_BASE_URL}/profile`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
