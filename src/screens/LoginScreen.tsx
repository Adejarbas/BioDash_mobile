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
    Image,
    Animated,
} from 'react-native'
import { useFadeInUp } from '../hooks/useFadeInUp'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { authLib } from '../lib/auth'

interface Props {
    onLogin: () => void
    onNavigateRegister?: () => void
    onBack?: () => void
}

export default function LoginScreen({ onLogin, onNavigateRegister, onBack }: Props) {
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
            console.log("Tentando logar com:", email.trim());
            await authLib.signIn(email.trim(), password.trim());
            console.log("Login OK!");
            onLogin()
        } catch (e: any) {
            console.log("Erro no login:", e.message);
            setError(e.message === 'Email ou senha inválidos.' ? 'Email ou Senha inválidos.' : (e.message || 'Erro inesperado.'))
        } finally {
            setLoading(false)
        }
    }

    const { animatedStyle } = useFadeInUp()

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={animatedStyle}>
                {/* Botão de Voltar */}
                {onBack && (
                    <TouchableOpacity style={{ marginBottom: 20 }} onPress={onBack}>
                        <Text style={{ fontSize: 16, color: '#16a34a', fontWeight: '600' }}>← Voltar para a tela inicial</Text>
                    </TouchableOpacity>
                )}

                {/* Logo */}
                <View style={styles.logoSection}>
                    <Image source={require('../../assets/logo-biodash.png')} style={{ width: 200, height: 100 }} resizeMode="contain" />
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
                                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Erro */}
                    {error ? (
                        <View style={[styles.errorBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#dc2626" style={{ marginRight: 6 }} />
                            <Text style={styles.errorText}>{error}</Text>
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
                </Animated.View>
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
