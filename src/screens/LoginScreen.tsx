import React, { useState } from 'react'
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

interface Props {
    onLogin: () => void
    onNavigateRegister?: () => void
}

export default function LoginScreen({ onLogin, onNavigateRegister }: Props) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Preencha o email e a senha.')
            return
        }
        setLoading(true)
        setError(null)

        try {
            console.log("Tentando logar com:", email.trim(), "| Senha (tamanho):", password.length);
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(), // Removido espaço acidental
            })
            if (authError) {
                console.log("Erro do Supabase:", authError.message);
                setError(authError.message === 'Invalid login credentials' ? 'Email ou Senha inválidos.' : authError.message)
            } else {
                console.log("Login OK!");
                onLogin()
            }
        } catch (e) {
            setError('Erro inesperado. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
            >
                {/* Logo */}
                <View style={styles.logoSection}>
                    <View style={styles.logoIcon}>
                        <Text style={styles.logoEmoji}>🌱</Text>
                    </View>
                    <Text style={styles.logoTitle}>BioDash</Text>
                    <Text style={styles.logoSubtitle}>Monitoramento de Biodigestores</Text>
                </View>

                {/* Card de Login */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Entrar</Text>
                    <Text style={styles.cardSubtitle}>
                        Entre com seu email para acessar o dashboard
                    </Text>

                    {/* Email */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="usuario@email.com"
                            placeholderTextColor="#94a3b8"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                        />
                    </View>

                    {/* Senha */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Senha</Text>
                        <View style={styles.passwordRow}>
                            <TextInput
                                style={[styles.input, styles.passwordInput]}
                                placeholder="••••••••"
                                placeholderTextColor="#94a3b8"
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                value={password}
                                onChangeText={setPassword}
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Text style={styles.eyeEmoji}>{showPassword ? '🙈' : '👁️'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Erro */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* Botão */}
                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Entrar</Text>
                        )}
                    </TouchableOpacity>

                    {/* Link para Cadastro */}
                    <TouchableOpacity
                        style={{ marginTop: 24, alignItems: 'center' }}
                        onPress={onNavigateRegister}
                    >
                        <Text style={{ fontSize: 14, color: '#64748b' }}>
                            Não tem uma conta? <Text style={{ fontWeight: 'bold', color: '#16a34a' }}>Cadastre-se</Text>
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.footer}>BioDash Mobile v1.0</Text>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0fdf4',
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    logoSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#bbf7d0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        shadowColor: '#16a34a',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 4,
    },
    logoEmoji: {
        fontSize: 36,
    },
    logoTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#14532d',
        letterSpacing: -0.5,
    },
    logoSubtitle: {
        fontSize: 14,
        color: '#4ade80',
        marginTop: 4,
        fontWeight: '500',
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 28,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
    },
    cardTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#14532d',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginBottom: 24,
    },
    field: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#1e293b',
        backgroundColor: '#f8fafc',
    },
    passwordRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    passwordInput: {
        flex: 1,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },
    eyeButton: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderLeftWidth: 0,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#f8fafc',
    },
    eyeEmoji: {
        fontSize: 18,
    },
    errorBox: {
        backgroundColor: '#fef2f2',
        borderRadius: 8,
        padding: 10,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    errorText: {
        color: '#dc2626',
        fontSize: 13,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#16a34a',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        shadowColor: '#16a34a',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 3,
        marginTop: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    footer: {
        textAlign: 'center',
        color: '#86efac',
        fontSize: 12,
        marginTop: 24,
    },
})
