import React, { useEffect, useState, ComponentProps } from 'react'
import { View, ActivityIndicator, StyleSheet, Image, TouchableOpacity, Text } from 'react-native'
import { supabase } from './src/lib/supabase'
import LandingScreen from './src/screens/LandingScreen'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import CompanyProfileScreen from './src/screens/CompanyProfileScreen'
import NotificationsScreen from './src/screens/NotificationsScreen'
import TermsScreen from './src/screens/TermsScreen'
import HelpCenterScreen from './src/screens/HelpCenterScreen'
import { StatusBar } from 'expo-status-bar'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context'
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

const TEST_MODE = false;

import { AuthStackParamList, SettingsStackParamList, MainTabParamList } from './src/navigation/types'

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// --- HEADER GLOBAL ---
function CustomHeader() {
  const { theme, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
      <Image source={require('./assets/logo-biodash.png')} style={{ width: 100, height: 70, marginRight: 12 }} resizeMode="contain" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerSub, { color: colors.textMuted }]}>Plataforma Sustentável</Text>
      </View>

      <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: colors.iconBg }]}>
        <MaterialCommunityIcons name={theme === 'light' ? 'weather-night' : 'white-balance-sunny'} size={22} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

// --- STACK DE CONFIGURAÇÕES ---
function SettingsStackNavigator({ onLogout }: { onLogout: () => void }) {
  const { colors } = useTheme();

  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <SettingsStack.Screen name="SettingsHome">
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </SettingsStack.Screen>
      <SettingsStack.Screen name="CompanyProfile" component={CompanyProfileScreen} />
      <SettingsStack.Screen name="Notifications" component={NotificationsScreen} />
      <SettingsStack.Screen name="Terms" component={TermsScreen} />
      <SettingsStack.Screen name="HelpCenter" component={HelpCenterScreen} />
    </SettingsStack.Navigator>
  );
}

// --- TABS PRINCIPAIS ---
function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CustomHeader />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: [styles.tabBar, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }],
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size }) => {
            const iconName = route.name === 'Dashboard' ? 'dashboard' : 'settings';
            return <MaterialIcons name={iconName as any} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Painel' }} />
        <Tab.Screen name="Settings" options={{ title: 'Ajustes' }}>
          {() => <SettingsStackNavigator onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  );
}

// --- APP PRINCIPAL ---
function MainApp() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { theme, colors } = useTheme();

  useEffect(() => {
    if (TEST_MODE) {
      setLoading(false)
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

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

  return (
    <NavigationContainer>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {session ? (
        <MainTabs onLogout={() => supabase.auth.signOut()} />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <AuthStack.Screen name="Landing" component={LandingScreen} />
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
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
