import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'

const TEST_MODE = true; // <--- MODO DE TESTE ATIVADO

export default function App() {
  const [session, setSession] = useState<any>(null)
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

  return (
    <>
      <StatusBar style="dark" />
      {session ? (
        <DashboardScreen onLogout={() => setSession(null)} />
      ) : (
        <LoginScreen onLogin={() => setSession({ user: { email: 'teste@biodash.com' } })} />
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
})
