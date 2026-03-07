import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import CompanyProfileScreen from './src/screens/CompanyProfileScreen'
import NotificationsScreen from './src/screens/NotificationsScreen'
import TermsScreen from './src/screens/TermsScreen'
import HelpCenterScreen from './src/screens/HelpCenterScreen'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context'

const TEST_MODE = false; // <--- MODO DE TESTE DESATIVADO

// --- COMPONENTE DE ABAS (MENU INFERIOR) ---
type SubScreen = 'none' | 'profile' | 'notifications' | 'terms' | 'helpCenter';

function MainTabs({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'home' | 'settings'>('home')
  const [currentSubScreen, setCurrentSubScreen] = useState<SubScreen>('none')
  const { theme, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header Fixo Global */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <View style={[styles.headerLogo, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.headerEmoji}>🌱</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>BioDash</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Plataforma Sustentável</Text>
        </View>

        <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: colors.iconBg }]}>
          <Text style={{ fontSize: 18 }}>{theme === 'light' ? '🌙' : '☀️'}</Text>
        </TouchableOpacity>
      </View>

      {/* Tela Ativa */}
      <View style={{ flex: 1 }}>
        {activeTab === 'home' ? (
          <DashboardScreen />
        ) : currentSubScreen === 'profile' ? (
          <CompanyProfileScreen onBack={() => setCurrentSubScreen('none')} />
        ) : currentSubScreen === 'notifications' ? (
          <NotificationsScreen onBack={() => setCurrentSubScreen('none')} />
        ) : currentSubScreen === 'terms' ? (
          <TermsScreen onBack={() => setCurrentSubScreen('none')} />
        ) : currentSubScreen === 'helpCenter' ? (
          <HelpCenterScreen onBack={() => setCurrentSubScreen('none')} />
        ) : (
          <SettingsScreen
            onLogout={onLogout}
            onNavigateProfile={() => setCurrentSubScreen('profile')}
            onNavigateNotifications={() => setCurrentSubScreen('notifications')}
            onNavigateTerms={() => setCurrentSubScreen('terms')}
            onNavigateHelpCenter={() => setCurrentSubScreen('helpCenter')}
          />
        )}
      </View>

      {/* Barra de Navegação */}
      <View style={[styles.tabBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('home');
            setCurrentSubScreen('none');
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabIconActive]}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && { color: colors.primary }]}>Painel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('settings');
            setCurrentSubScreen('none'); // Reseta a sub-tela ao clicar na tab
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'settings' && styles.tabIconActive]}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'settings' && { color: colors.primary }]}>Ajustes</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function MainApp() {
  const [session, setSession] = useState<any>(null)
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(true)
  const { theme, colors } = useTheme();

  useEffect(() => {
    if (TEST_MODE) {
      setLoading(false)
      return;
    }

    // Verifica sessão salva ao abrir o app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Ouve mudanças de autenticação em tempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  // Se estiver logado, exibe as abas com Painel e Configurações
  if (session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <MainTabs onLogout={() => setSession(null)} />
      </View>
    )
  }

  // Se não estiver logado, escolhe entre Login ou Cadastro
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {currentScreen === 'register' ? (
        <RegisterScreen
          onBackToLogin={() => setCurrentScreen('login')}
          onRegisterSuccess={() => {
            // Em modo teste, loga automaticamente após o cadastro fechar
            setSession({ user: { email: 'nova_empresa@biodash.com' } })
          }}
        />
      ) : (
        <LoginScreen
          onLogin={() => {
            // The session will automatically update via the onAuthStateChange listener
            // We don't need to manually setSession here unless needed for forced UI updates 
          }}
          onNavigateRegister={() => setCurrentScreen('register')}
        />
      )}
    </View>
  )
}


export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingTop: 8,
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
})
