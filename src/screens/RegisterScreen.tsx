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
} from 'react-native'
import { supabase } from '../lib/supabase'

interface Props {
    onRegisterSuccess: () => void
    onBackToLogin: () => void
}

export default function RegisterScreen({ onRegisterSuccess, onBackToLogin }: Props) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [razaoSocial, setRazaoSocial] = useState('')
    const [cnpj, setCnpj] = useState('')
    const [cep, setCep] = useState('')
    const [numero, setNumero] = useState('')
    const [endereco, setEndereco] = useState('')

    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleRegister = async () => {
        if (!name || !email || !password || !razaoSocial || !cnpj) {
            setError('Preencha pelo menos os dados principais obrigatórios.')
            return
        }
        setLoading(true)
        setError(null)

        try {
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: email.trim(),
                password,
            })

            if (signUpError) {
                setError(signUpError.message)
            } else {
                // Inserir os dados na tabela pública user_profiles para integração com Web
                if (data.user) {
                    const { error: dbError } = await supabase.from('user_profiles').insert({
                        id: data.user.id,
                        name: name.trim(),
                        company: '',
                        razao_social: razaoSocial.trim(),
                        cnpj: cnpj.replace(/\D/g, ''),
                        address: endereco.trim(),
                        numero: numero.trim() ? Number(numero.trim()) : null,
                        city: '',
                        state: '',
                        zip_code: cep.replace(/\D/g, ''),
                        phone: '',
                        email: email.trim(),
                        updated_at: new Date().toISOString()
                    });

                    if (dbError) {
                        console.log('Erro ao salvar no user_profiles:', dbError);
                    }
                }

                onRegisterSuccess() // Se der sucesso, volta pro login ou mostra msg de confirmação
            }
        } catch (e) {
            setError('Erro inesperado. Tente novamente mais tarde.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Logo Reduzido */}
                <View style={styles.logoSection}>
                    <View style={styles.logoIcon}>
                        <Text style={styles.logoEmoji}>🌱</Text>
                    </View>
                    <Text style={styles.logoTitle}>BioDash</Text>
                </View>

                {/* Card de Cadastro */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Criar Conta</Text>
                    <Text style={styles.cardSubtitle}>
                        Preencha os dados da sua empresa para participar.
                    </Text>

                    {/* Nome */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Nome Completo</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Seu nome"
                            placeholderTextColor="#94a3b8"
                            autoCorrect={false}
                            value={name}
                            onChangeText={setName}
                        />
                    </View>

                    {/* Email */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="empresa@email.com"
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
                                placeholder="Crie uma senha forte"
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

                    {/* Divisão Empresas */}
                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.dividerText}>Dados da Empresa</Text>
                        <View style={styles.line} />
                    </View>

                    {/* Razão Social e CNPJ */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Razão Social</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Nome Oficial LTDA"
                            placeholderTextColor="#94a3b8"
                            value={razaoSocial}
                            onChangeText={setRazaoSocial}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>CNPJ</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="00.000.000/0000-00"
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={cnpj}
                            onChangeText={setCnpj}
                        />
                    </View>

                    {/* Divisão Endereço */}
                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.dividerText}>Endereço do Biodigestor</Text>
                        <View style={styles.line} />
                    </View>

                    {/* Endereço Container (CEP e Número na mesma linha se possível, aqui para mobile empilhado) */}
                    <View style={styles.row}>
                        <View style={[styles.field, { flex: 1, marginRight: 12 }]}>
                            <Text style={styles.label}>CEP</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="00000-000"
                                placeholderTextColor="#94a3b8"
                                keyboardType="numeric"
                                value={cep}
                                onChangeText={setCep}
                            />
                        </View>
                        <View style={[styles.field, { width: 100 }]}>
                            <Text style={styles.label}>Número</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="123"
                                placeholderTextColor="#94a3b8"
                                keyboardType="numeric"
                                value={numero}
                                onChangeText={setNumero}
                            />
                        </View>
                    </View>

                    {/* Endereço Completo */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Logradouro</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Rua, Avenida, etc."
                            placeholderTextColor="#94a3b8"
                            value={endereco}
                            onChangeText={setEndereco}
                        />
                    </View>

                    {/* Erro */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* Botão de Cadastro */}
                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleRegister}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Cadastrar Empresa</Text>
                        )}
                    </TouchableOpacity>

                    {/* Link de volta pro login */}
                    <TouchableOpacity style={styles.backButton} onPress={onBackToLogin}>
                        <Text style={styles.backButtonText}>Já tenho uma conta. <Text style={{ fontWeight: 'bold', color: '#16a34a' }}>Fazer Login</Text></Text>
                    </TouchableOpacity>
                </View>
                <View style={{ height: 40 }} />
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
        padding: 24,
        paddingTop: 60,
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
        shadowColor: '#16a34a',
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
        color: '#64748b',
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
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#e2e8f0',
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 12,
        fontWeight: '600',
        color: '#94a3b8',
        textTransform: 'uppercase',
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
        marginTop: 20,
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 14,
        color: '#64748b',
    },
})
