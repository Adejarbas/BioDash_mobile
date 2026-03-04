import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'

const TEST_MODE = true; // <--- MODO DE TESTE ATIVADO

// --- COMPONENTE DE ABAS (MENU INFERIOR) ---
function MainTabs({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'home' | 'settings'>('home')

  return (
    <View style={{ flex: 1, backgroundColor: '#f0fdf4' }}>
      {/* Header Fixo Global */}
      <View style={styles.header}>
        <View style={styles.headerLogo}>
          <Text style={styles.headerEmoji}>🌱</Text>
        </View>
        <View>
          <Text style={styles.headerTitle}>BioDash</Text>
          <Text style={styles.headerSub}>Plataforma Sustentável</Text>
        </View>
      </View>

      {/* Tela Ativa */}
      <View style={{ flex: 1 }}>
        {activeTab === 'home' ? <DashboardScreen /> : <SettingsScreen onLogout={onLogout} />}
      </View>

      {/* Barra de Navegação */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabIconActive]}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Painel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, activeTab === 'settings' && styles.tabIconActive]}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>Ajustes</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(true)

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
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    )
  }

  // Se estiver logado, exibe as abas com Painel e Configurações
  if (session) {
    return (
      <>
        <StatusBar style="dark" />
        <MainTabs onLogout={() => setSession(null)} />
      </>
    )
  }

  // Se não estiver logado, escolhe entre Login ou Cadastro
  return (
    <>
      <StatusBar style="dark" />
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
          onLogin={() => setSession({ user: { email: 'teste@biodash.com' } })}
          onNavigateRegister={() => setCurrentScreen('register')}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
    backgroundColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerEmoji: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14532d',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 12,
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
    color: '#94a3b8',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#16a34a',
  },
})
