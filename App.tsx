import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, BackHandler } from 'react-native'
import { authLib } from './src/lib/auth'
import LandingScreen from './src/screens/LandingScreen'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import CompanyProfileScreen from './src/screens/CompanyProfileScreen'
import NotificationsScreen from './src/screens/NotificationsScreen'
import TermsScreen from './src/screens/TermsScreen'
import HelpCenterScreen from './src/screens/HelpCenterScreen'
import ChatbotScreen from './src/screens/ChatbotScreen'
import { StatusBar } from 'expo-status-bar'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context'
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons'

const TEST_MODE = false; // <--- MODO DE TESTE DESATIVADO

// --- COMPONENTE DE ABAS (MENU INFERIOR) ---
type SubScreen = 'none' | 'profile' | 'notifications' | 'terms' | 'helpCenter';

function MainTabs({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'home' | 'chatbot' | 'settings'>('home')
  const [currentSubScreen, setCurrentSubScreen] = useState<SubScreen>('none')
  const { theme, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentSubScreen !== 'none') {
        setCurrentSubScreen('none')
        return true
      }
      if (activeTab !== 'home') {
        setActiveTab('home')
        return true
      }
      return false
    })
    return () => subscription.remove()
  }, [activeTab, currentSubScreen])

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header Fixo Global */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <Image
          source={require('./assets/logo-biodash.png')}
          style={{ width: 112, height: 42, marginRight: 10 }}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel="BioDash"
        />
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Plataforma Sustentável</Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            setActiveTab('settings');
            setCurrentSubScreen('notifications');
          }}
          style={[styles.themeBtn, { backgroundColor: colors.iconBg, marginRight: 8 }]}
          accessibilityRole="button"
          accessibilityLabel="Histórico de Alertas"
        >
          <MaterialCommunityIcons name="bell-outline" size={22} color={colors.text} importantForAccessibility="no" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleTheme}
          style={[styles.themeBtn, { backgroundColor: colors.iconBg }]}
          accessibilityRole="button"
          accessibilityLabel={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
        >
          <MaterialCommunityIcons name={theme === 'light' ? 'weather-night' : 'white-balance-sunny'} size={22} color={colors.text} importantForAccessibility="no" />
        </TouchableOpacity>
      </View>

      {/* Tela Ativa */}
      <View style={{ flex: 1 }}>
        {activeTab === 'home' ? (
          <DashboardScreen
            onNavigateNotifications={() => {
              setActiveTab('settings');
              setCurrentSubScreen('notifications');
            }}
          />
        ) : activeTab === 'chatbot' ? (
          <ChatbotScreen />
        ) : currentSubScreen === 'profile' ? (
          <CompanyProfileScreen onBack={() => setCurrentSubScreen('none')} />
        ) : currentSubScreen === 'notifications' ? (
          <NotificationsScreen onBack={() => setCurrentSubScreen('none')} />
        ) : currentSubScreen === 'terms' ? (
          <TermsScreen
            onBack={() => setCurrentSubScreen('none')}
            onNavigateHelpCenter={() => setCurrentSubScreen('helpCenter')}
          />
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
      <View
        style={[styles.tabBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}
        accessibilityRole="tablist"
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('home');
            setCurrentSubScreen('none');
          }}
          activeOpacity={0.7}
          id="tab-home"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'home' }}
          accessibilityLabel="Painel"
        >
          <MaterialIcons name="dashboard" size={24} color={activeTab === 'home' ? colors.primary : colors.textMuted} importantForAccessibility="no" />
          <Text
            style={[styles.tabLabel, { color: activeTab === 'home' ? colors.primary : colors.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            Painel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('chatbot');
            setCurrentSubScreen('none');
          }}
          activeOpacity={0.7}
          id="tab-chatbot"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'chatbot' }}
          accessibilityLabel="Assistente"
        >
          <MaterialCommunityIcons name="robot-outline" size={24} color={activeTab === 'chatbot' ? colors.primary : colors.textMuted} importantForAccessibility="no" />
          <Text
            style={[styles.tabLabel, { color: activeTab === 'chatbot' ? colors.primary : colors.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            Assistente
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('settings');
            setCurrentSubScreen('none'); // Reseta a sub-tela ao clicar na tab
          }}
          activeOpacity={0.7}
          id="tab-settings"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'settings' }}
          accessibilityLabel="Ajustes"
        >
          <MaterialIcons name="settings" size={24} color={activeTab === 'settings' ? colors.primary : colors.textMuted} importantForAccessibility="no" />
          <Text
            style={[styles.tabLabel, { color: activeTab === 'settings' ? colors.primary : colors.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            Ajustes
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function MainApp() {
  const [session, setSession] = useState<any>(null)
  const [currentScreen, setCurrentScreen] = useState<'landing' | 'login' | 'register'>('landing')
  const [loading, setLoading] = useState(true)
  const { theme, colors } = useTheme();

  useEffect(() => {
    if (TEST_MODE) {
      setLoading(false)
      return;
    }

    // Verifica se existe token JWT salvo (substitui supabase.auth.getSession)
    authLib.isAuthenticated().then((authenticated) => {
      setSession(authenticated ? true : null)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (session || currentScreen === 'landing') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCurrentScreen('landing')
      return true
    })
    return () => subscription.remove()
  }, [session, currentScreen])

  if (loading) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.background }]} accessible accessibilityLabel="Carregando BioDash">
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Carregando BioDash" />
      </View>
    )
  }

  // Se estiver logado, exibe as abas com Painel e Configurações
  if (session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <MainTabs onLogout={async () => { await authLib.signOut(); setSession(null); }} />
      </View>
    )
  }

  // Se não estiver logado, escolhe entre Login ou Cadastro
  return (
    <View style={{ flex: 1, backgroundColor: '#f0fdf4' }}>
      <StatusBar style="dark" />
      {currentScreen === 'landing' ? (
        <LandingScreen
          onNavigateLogin={() => setCurrentScreen('login')}
          onNavigateRegister={() => setCurrentScreen('register')}
        />
      ) : currentScreen === 'register' ? (
        <RegisterScreen
          onBackToLogin={() => setCurrentScreen('login')}
          onRegisterSuccess={() => {
            setSession(true) // Cadastro + login automático via authLib
          }}
          onBack={() => setCurrentScreen('landing')}
        />
      ) : (
        <LoginScreen
          onLogin={() => {
            setSession(true) // Login bem-sucedido — JWT salvo pelo authLib
          }}
          onNavigateRegister={() => setCurrentScreen('register')}
          onBack={() => setCurrentScreen('landing')}
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    minHeight: 48,
    paddingTop: 4,
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
})
