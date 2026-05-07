import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@biodash_jwt_token';
const USER_KEY = '@biodash_user';

const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL || "http://54.166.146.10:3003";
const API_URL = RAW_API_URL.replace(/\/+$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/+$/, "")
  : `${RAW_API_URL.replace(/\/+$/, "")}/api`;

export const authLib = {
  /**
   * Realiza o login e armazena o token JWT localmente.
   */
  signIn: async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Email ou senha inválidos.');
    }
    await AsyncStorage.setItem(TOKEN_KEY, json.data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(json.data.user));
    return json.data;
  },

  /**
   * Realiza o cadastro de um novo usuário.
   */
  signUp: async (data: {
    email: string;
    password: string;
    name?: string;
    razaoSocial?: string;
    cnpj?: string;
    address?: string;
    numero?: string;
    zipCode?: string;
  }) => {
    const payload = {
      email: data.email,
      password: data.password,
      full_name: data.name,
      company_name: data.razaoSocial,
      cnpj: data.cnpj,
      address: data.address,
      numero: data.numero,
      zipCode: data.zipCode,
    };

    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      const validationErrors = json?.errors as Record<string, string[]> | undefined;
      const firstField = validationErrors ? Object.keys(validationErrors)[0] : undefined;
      const firstValidationError = firstField ? validationErrors?.[firstField]?.[0] : undefined;
      throw new Error(firstValidationError || json.error || json.message || 'Erro ao realizar cadastro.');
    }
    await AsyncStorage.setItem(TOKEN_KEY, json.data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(json.data.user));
    return json.data;
  },

  /**
   * Retorna o token JWT armazenado localmente.
   */
  getToken: async (): Promise<string | null> => {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  /**
   * Retorna o usuário armazenado localmente (cache).
   */
  getUser: async (): Promise<{ id: string; email: string } | null> => {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  /**
   * Verifica se existe uma sessão ativa (token armazenado).
   */
  isAuthenticated: async (): Promise<boolean> => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return token !== null;
  },

  /**
   * Altera a senha do usuário autenticado.
   */
  updatePassword: async (newPassword: string) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Erro ao alterar senha.');
    }
    return json;
  },

  /**
   * Realiza o logout, removendo o token e os dados do usuário.
   */
  signOut: async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  },
};
