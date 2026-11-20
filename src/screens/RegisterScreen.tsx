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
    onRegisterSuccess: () => void
    onBackToLogin: () => void
    onBack?: () => void
}

export default function RegisterScreen({ onRegisterSuccess, onBackToLogin, onBack }: Props) {
    const insets = useSafeAreaInsets()
    const emailRef = useRef<TextInput>(null)
    const passwordRef = useRef<TextInput>(null)
    const razaoSocialRef = useRef<TextInput>(null)
    const cnpjRef = useRef<TextInput>(null)
    const cepRef = useRef<TextInput>(null)
    const numeroRef = useRef<TextInput>(null)
    const enderecoRef = useRef<TextInput>(null)

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [razaoSocial, setRazaoSocial] = useState('')
    const [cnpj, setCnpj] = useState('')
    const [cep, setCep] = useState('')
    const [numero, setNumero] = useState('')
    const [endereco, setEndereco] = useState('')
    const [cepLoading, setCepLoading] = useState(false)
    const [cepError, setCepError] = useState<string | null>(null)

    const handleCnpjChange = (text: string) => {
        let value = text.replace(/\D/g, '');
        if (value.length > 14) value = value.slice(0, 14);

        value = value.replace(/^(\d{2})(\d)/, '$1.$2');
        value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
        value = value.replace(/(\d{4})(\d)/, '$1-$2');

        setCnpj(value);
        if (error) setError(null)
    }

    const handleCepChange = async (text: string) => {
        let value = text.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);

        value = value.replace(/^(\d{5})(\d)/, '$1-$2');
        setCep(value);
        setCepError(null);

        const pureCep = value.replace(/\D/g, '');
        if (pureCep.length === 8) {
            setCepLoading(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${pureCep}/json/`);
                const data = await response.json();
                if (data.erro) {
                    setCepError('CEP não encontrado. Preencha o logradouro manualmente.');
                } else {
                    const streetPart = [data.logradouro, data.bairro].filter(Boolean).join(', ');
                    const cityPart = [data.localidade, data.uf].filter(Boolean).join(' - ');
                    setEndereco([streetPart, cityPart].filter(Boolean).join(', '));
                }
            } catch {
                setCepError('Não foi possível consultar o CEP. Preencha o logradouro manualmente.');
            } finally {
                setCepLoading(false);
            }
        }
    }

    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRegister = async () => {
        const missing: string[] = []
        if (!name.trim()) missing.push('Nome Completo')
        if (!email.trim()) missing.push('E-mail')
        if (!password) missing.push('Senha')
        if (!razaoSocial.trim()) missing.push('Razão Social')
        if (!cnpj.trim()) missing.push('CNPJ')

        if (missing.length > 0) {
            setError(`Preencha os campos obrigatórios: ${missing.join(', ')}.`)
            return
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError('Informe um e-mail válido.')
            return
        }
        const pureCnpj = cnpj.replace(/\D/g, '')
        if (pureCnpj.length !== 14) {
            setError('Informe um CNPJ completo com 14 dígitos.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            await authLib.signUp({
                email: email.trim(),
                password,
                name: name.trim(),
                razaoSocial: razaoSocial.trim(),
                cnpj: pureCnpj,
                address: endereco.trim(),
                numero: numero.trim(),
                zipCode: cep.replace(/\D/g, ''),
            });
            onRegisterSuccess();
        } catch (e: any) {
            setError(e.message || 'Erro inesperado. Tente novamente mais tarde.')
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
                        paddingBottom: Math.max(insets.bottom + 24, 40),
                    },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
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

                {/* Logo Reduzido */}
                <View style={styles.logoSection}>
                    <Image
                        source={require('../../assets/logo-biodash.png')}
                        style={{ width: 200, height: 100 }}
                        resizeMode="contain"
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel="BioDash"
                    />
                </View>

                {/* Card de Cadastro */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle} accessibilityRole="header">Criar Conta</Text>
                    <Text style={styles.cardSubtitle}>
                        Preencha os dados da sua empresa para participar. Campos com * são obrigatórios.
                    </Text>

                    {/* Nome */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Nome Completo *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Seu nome"
                            placeholderTextColor="#475569"
                            autoCorrect={false}
                            textContentType="name"
                            autoComplete="name"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => emailRef.current?.focus()}
                            accessibilityLabel="Nome Completo obrigatório"
                            value={name}
                            onChangeText={(text) => {
                                setName(text)
                                if (error) setError(null)
                            }}
                        />
                    </View>

                    {/* Email */}
                    <View style={styles.field}>
                        <Text style={styles.label}>E-mail *</Text>
                        <TextInput
                            ref={emailRef}
                            style={styles.input}
                            placeholder="empresa@email.com"
                            placeholderTextColor="#475569"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="emailAddress"
                            autoComplete="email"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            accessibilityLabel="E-mail obrigatório"
                            value={email}
                            onChangeText={(text) => {
                                setEmail(text)
                                if (error) setError(null)
                            }}
                        />
                    </View>

                    {/* Senha */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Senha *</Text>
                        <View style={styles.passwordRow}>
                            <TextInput
                                ref={passwordRef}
                                style={[styles.input, styles.passwordInput]}
                                placeholder="Crie uma senha forte"
                                placeholderTextColor="#475569"
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="newPassword"
                                autoComplete="new-password"
                                returnKeyType="next"
                                blurOnSubmit={false}
                                onSubmitEditing={() => razaoSocialRef.current?.focus()}
                                accessibilityLabel="Senha obrigatória"
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

                    {/* Divisão Empresas */}
                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.dividerText} accessibilityRole="header">Dados da Empresa</Text>
                        <View style={styles.line} />
                    </View>

                    {/* Razão Social e CNPJ */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Razão Social *</Text>
                        <TextInput
                            ref={razaoSocialRef}
                            style={styles.input}
                            placeholder="Nome Oficial LTDA"
                            placeholderTextColor="#475569"
                            textContentType="organizationName"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => cnpjRef.current?.focus()}
                            accessibilityLabel="Razão Social obrigatória"
                            value={razaoSocial}
                            onChangeText={(text) => {
                                setRazaoSocial(text)
                                if (error) setError(null)
                            }}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>CNPJ *</Text>
                        <TextInput
                            ref={cnpjRef}
                            style={styles.input}
                            placeholder="00.000.000/0000-00"
                            placeholderTextColor="#475569"
                            keyboardType="numeric"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => cepRef.current?.focus()}
                            accessibilityLabel="CNPJ obrigatório"
                            value={cnpj}
                            maxLength={18}
                            onChangeText={handleCnpjChange}
                        />
                    </View>

                    {/* Divisão Endereço */}
                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.dividerText} accessibilityRole="header">Endereço do Biodigestor</Text>
                        <View style={styles.line} />
                    </View>

                    {/* Endereço Container */}
                    <View style={styles.row}>
                        <View style={[styles.field, { flex: 1, marginRight: 12 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <Text style={[styles.label, { marginBottom: 0 }]}>CEP</Text>
                                {cepLoading && <ActivityIndicator size="small" color="#15803d" style={{ marginLeft: 8 }} accessibilityLabel="Buscando CEP" />}
                            </View>
                            <TextInput
                                ref={cepRef}
                                style={styles.input}
                                placeholder="00000-000"
                                placeholderTextColor="#475569"
                                keyboardType="numeric"
                                textContentType="postalCode"
                                autoComplete="postal-code"
                                returnKeyType="next"
                                blurOnSubmit={false}
                                onSubmitEditing={() => numeroRef.current?.focus()}
                                accessibilityLabel="CEP"
                                value={cep}
                                maxLength={9}
                                onChangeText={handleCepChange}
                            />
                        </View>
                        <View style={[styles.field, { flex: 0.45, minWidth: 110 }]}>
                            <Text style={styles.label}>Número</Text>
                            <TextInput
                                ref={numeroRef}
                                style={styles.input}
                                placeholder="123 ou S/N"
                                placeholderTextColor="#475569"
                                returnKeyType="next"
                                blurOnSubmit={false}
                                onSubmitEditing={() => enderecoRef.current?.focus()}
                                accessibilityLabel="Número do endereço"
                                value={numero}
                                onChangeText={setNumero}
                            />
                        </View>
                    </View>

                    {cepError ? (
                        <Text style={styles.cepErrorText} accessibilityLiveRegion="polite">
                            {cepError}
                        </Text>
                    ) : null}

                    {/* Endereço Completo */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Logradouro</Text>
                        <TextInput
                            ref={enderecoRef}
                            style={styles.input}
                            placeholder="Rua, Avenida, etc."
                            placeholderTextColor="#475569"
                            textContentType="fullStreetAddress"
                            autoComplete="street-address"
                            returnKeyType="done"
                            onSubmitEditing={handleRegister}
                            accessibilityLabel="Logradouro"
                            value={endereco}
                            onChangeText={setEndereco}
                        />
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

                    {/* Botão de Cadastro */}
                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleRegister}
                        disabled={loading}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={loading ? 'Cadastrando empresa, aguarde' : 'Cadastrar Empresa'}
                        accessibilityState={{ disabled: loading, busy: loading }}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Cadastrar Empresa</Text>
                        )}
                    </TouchableOpacity>

                    {/* Link de volta pro login */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={onBackToLogin}
                        accessibilityRole="button"
                        accessibilityLabel="Já tenho uma conta. Fazer Login"
                    >
                        <Text style={styles.backButtonText}>Já tenho uma conta. <Text style={{ fontWeight: 'bold', color: '#15803d' }}>Fazer Login</Text></Text>
                    </TouchableOpacity>
                </View>
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
        marginBottom: 24,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    logoIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#bbf7d0',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#15803d',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
    },
    logoEmoji: {
        fontSize: 22,
    },
    logoTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#14532d',
        letterSpacing: -0.5,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 24,
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
    row: {
        flexDirection: 'row',
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
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#cbd5e1',
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        textTransform: 'uppercase',
    },
    cepErrorText: {
        color: '#b91c1c',
        fontSize: 12,
        marginTop: -8,
        marginBottom: 12,
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
        marginTop: 8,
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
    backButton: {
        marginTop: 12,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 14,
        color: '#475569',
    },
})
