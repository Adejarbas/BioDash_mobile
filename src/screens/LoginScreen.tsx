import React, { useRef, useState } from 'react'
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
    Image,
    Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFadeInUp } from '../hooks/useFadeInUp'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { authLib } from '../lib/auth'

interface Props {
    onLogin: () => void
    onNavigateRegister?: () => void
    onBack?: () => void
}

export default function LoginScreen({ onLogin, onNavigateRegister, onBack }: Props) {
    const insets = useSafeAreaInsets()
    const passwordRef = useRef<TextInput>(null)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            setError('Preencha o email e a senha.')
            return
        }
        setLoading(true)
        setError(null)

        try {
            await authLib.signIn(email.trim(), password.trim());
            onLogin()
        } catch (e: any) {
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
                contentContainerStyle={[
                    styles.scroll,
                    {
                        paddingTop: Math.max(insets.top + 12, 24),
                        paddingBottom: Math.max(insets.bottom + 16, 24),
                    },
                ]}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={animatedStyle}>
                {/* Botão de Voltar */}
                {onBack && (
                    <TouchableOpacity
                        style={styles.backNavBtn}
                        onPress={onBack}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar para a tela inicial"
                    >
                        <Text style={styles.backNavText}>← Voltar para a tela inicial</Text>
                    </TouchableOpacity>
                )}

                {/* Logo */}
                <View style={styles.logoSection}>
                    <Image
                        source={require('../../assets/logo-biodash.png')}
                        style={{ width: 200, height: 100 }}
                        resizeMode="contain"
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel="BioDash"
                    />
                    <Text style={styles.logoSubtitle}>Monitoramento de Biodigestores</Text>
                </View>

                {/* Card de Login */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle} accessibilityRole="header">Entrar</Text>
                    <Text style={styles.cardSubtitle}>
                        Entre com seu email para acessar o dashboard
                    </Text>

                    {/* Email */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="usuario@email.com"
                            placeholderTextColor="#475569"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="emailAddress"
                            autoComplete="email"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            accessibilityLabel="Email"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text)
                                if (error) setError(null)
                            }}
                        />
                    </View>

                    {/* Senha */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Senha</Text>
                        <View style={styles.passwordRow}>
                            <TextInput
                                ref={passwordRef}
                                style={[styles.input, styles.passwordInput]}
                                placeholder="••••••••"
                                placeholderTextColor="#475569"
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="password"
                                autoComplete="password"
                                returnKeyType="done"
                                onSubmitEditing={handleLogin}
                                accessibilityLabel="Senha"
                                value={password}
                                onChangeText={(text) => {
                                    setPassword(text)
                                    if (error) setError(null)
                                }}
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(!showPassword)}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#475569" importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Erro */}
                    {error ? (
                        <View
                            style={[styles.errorBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="polite"
                        >
                            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#b91c1c" style={{ marginRight: 6 }} importantForAccessibility="no" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Botão */}
                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={loading ? 'Entrando, aguarde' : 'Entrar'}
                        accessibilityState={{ disabled: loading, busy: loading }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Entrar</Text>
                        )}
                    </TouchableOpacity>

                    {/* Link para Cadastro */}
                    <TouchableOpacity
                        style={styles.registerLinkBtn}
                        onPress={onNavigateRegister}
                        accessibilityRole="button"
                        accessibilityLabel="Não tem uma conta? Cadastre-se"
                    >
                        <Text style={{ fontSize: 14, color: '#475569' }}>
                            Não tem uma conta? <Text style={{ fontWeight: 'bold', color: '#15803d' }}>Cadastre-se</Text>
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
        paddingHorizontal: 24,
    },
    backNavBtn: {
        minHeight: 44,
        justifyContent: 'center',
        alignSelf: 'flex-start',
        marginBottom: 12,
        paddingVertical: 8,
    },
    backNavText: {
        fontSize: 16,
        color: '#15803d',
        fontWeight: '600',
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
        shadowColor: '#15803d',
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
        color: '#166534',
        marginTop: 4,
        fontWeight: '600',
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
        color: '#475569',
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
        borderColor: '#64748b',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#1e293b',
        backgroundColor: '#f8fafc',
    },
    passwordRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    passwordInput: {
        flex: 1,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },
    eyeButton: {
        borderWidth: 1,
        borderColor: '#64748b',
        borderLeftWidth: 0,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        paddingHorizontal: 12,
        minWidth: 44,
        justifyContent: 'center',
        alignItems: 'center',
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
        color: '#b91c1c',
        fontSize: 13,
        textAlign: 'center',
        flexShrink: 1,
    },
    button: {
        backgroundColor: '#15803d',
        borderRadius: 12,
        paddingVertical: 14,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#15803d',
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
    registerLinkBtn: {
        marginTop: 16,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        textAlign: 'center',
        color: '#475569',
        fontSize: 12,
        marginTop: 24,
    },
})
