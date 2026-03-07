import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeType = 'light' | 'dark';

interface ThemeContextType {
    theme: ThemeType;
    toggleTheme: () => void;
    colors: Colors;
}

export interface Colors {
    background: string;
    cardBackground: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    primaryLight: string;
    primaryDark: string;
    danger: string;
    dangerBg: string;
    dangerBorder: string;
    iconBg: string;
}

const lightColors: Colors = {
    background: '#f0fdf4',
    cardBackground: '#ffffff',
    text: '#14532d', // green-900 (headings) or general text
    textMuted: '#64748b', // slate-500
    border: '#e2e8f0', // slate-200
    primary: '#16a34a', // green-600
    primaryLight: '#bbf7d0', // green-200
    primaryDark: '#14532d', // green-900
    danger: '#dc2626', // red-600
    dangerBg: '#fee2e2', // red-100
    dangerBorder: '#fca5a5', // red-300
    iconBg: '#f1f5f9', // slate-100
};

const darkColors: Colors = {
    background: '#0f172a', // slate-900
    cardBackground: '#1e293b', // slate-800
    text: '#f8fafc', // slate-50
    textMuted: '#94a3b8', // slate-400
    border: '#334155', // slate-700
    primary: '#22c55e', // green-500 (slightly lighter for dark mode)
    primaryLight: '#14532d', // green-900
    primaryDark: '#4ade80', // green-400
    danger: '#ef4444', // red-500
    dangerBg: '#450a0a', // red-950
    dangerBorder: '#7f1d1d', // red-900
    iconBg: '#334155', // slate-700
};

const ThemeContext = createContext<ThemeContextType>({
    theme: 'light',
    toggleTheme: () => { },
    colors: lightColors,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [theme, setTheme] = useState<ThemeType>('light');

    useEffect(() => {
        // Load saved theme on startup
        AsyncStorage.getItem('@biodash_theme').then((savedTheme) => {
            if (savedTheme === 'dark' || savedTheme === 'light') {
                setTheme(savedTheme);
            }
        });
    }, []);

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        await AsyncStorage.setItem('@biodash_theme', newTheme);
    };

    const colors = theme === 'light' ? lightColors : darkColors;

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
            {children}
        </ThemeContext.Provider>
    );
};
