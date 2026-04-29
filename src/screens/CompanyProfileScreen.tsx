import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    Image,
    ActivityIndicator,
    Alert,
    Animated,
} from 'react-native';
import { useFadeInUp } from '../hooks/useFadeInUp';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { authLib } from '../lib/auth';
import { profileApi } from '../lib/api';
import { uploadImageToS3, getImageFromS3 } from '../lib/aws-s3';

const InputLabel = ({ label, colors }: { label: string, colors: any }) => (
    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>{label}</Text>
);

const CustomInput = ({ value, onChangeText, placeholder, style, secure = false, colors }: any) => (
    <TextInput
        style={[
            styles.input,
            {
                backgroundColor: colors.background, // Fundo levemente contrastante
                borderColor: colors.border,
                color: colors.text
            },
            style
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secure}
    />
);

const InfoRow = ({ label1, val1, label2, val2, colors }: any) => (
    <View style={styles.twoCols}>
        <View style={styles.col}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label1}</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{val1 || '—'}</Text>
        </View>
        <View style={styles.col}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label2}</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{val2 || '—'}</Text>
        </View>
    </View>
);

interface Props {
    onBack: () => void;
}

export default function CompanyProfileScreen({ onBack }: Props) {
    const { colors, theme } = useTheme();
    const { animatedStyle } = useFadeInUp()
    const [loading, setLoading] = useState(false);
    const [avatarUri, setAvatarUri] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        nome: '',
        nomeFantasia: '',
        razaoSocial: '',
        cnpj: '',
        email: '',
        endereco: '',
        numero: '',
        cidade: '',
        estado: '',
        cep: '',
        telefone: '',
    });

    const [passwordData, setPasswordData] = useState({
        atual: '',
        nova: '',
        confirmar: ''
    });

    React.useEffect(() => {
        const loadProfile = async () => {
            try {
                const user = await authLib.getUser();
                console.log('[Profile] Usuário autenticado:', user?.email);

                if (!user) {
                    console.warn('[Profile] Nenhum usuário logado.');
                    return;
                }

                const res = await profileApi.fetch();
                console.log('[Profile] Resposta da API:', JSON.stringify(res));

                const profile = res.data;

                if (profile?.avatar_url) {
                    const key = profile.avatar_url.includes('amazonaws.com/')
                        ? profile.avatar_url.split('amazonaws.com/')[1]
                        : profile.avatar_url;
                    const base64 = await getImageFromS3(key);
                    if (base64) setAvatarUri(base64);
                }

                setFormData({
                    nome: profile?.name || '',
                    nomeFantasia: profile?.company || '',
                    razaoSocial: profile?.razao_social || '',
                    cnpj: profile?.cnpj || '',
                    email: profile?.email || user.email || '',
                    endereco: profile?.address || '',
                    numero: profile?.numero?.toString() || '',
                    cidade: profile?.city || '',
                    estado: profile?.state || '',
                    cep: profile?.zip_code || '',
                    telefone: profile?.phone || '',
                });
            } catch (err) {
                console.error('[Profile] Erro ao carregar perfil:', err);
            }
        };
        loadProfile();
    }, []);

        const handleSaveProfile = async () => {
        setLoading(true);
        try {
            await profileApi.update({
                name: formData.nome || null,
                company: formData.nomeFantasia || null,
                razaoSocial: formData.razaoSocial || null,
                cnpj: formData.cnpj || null,
                address: formData.endereco || null,
                numero: formData.numero || null,
                city: formData.cidade || null,
                state: formData.estado || null,
                zipCode: formData.cep || null,
                phone: formData.telefone || null,
                email: formData.email || null,
            });
            Alert.alert('Sucesso', 'Informações atualizadas com sucesso!');
        } catch (e: any) {
            Alert.alert('Erro', e.message || 'Falha ao atualizar o perfil.');
        } finally {
            setLoading(false);
        }
    };

        const handleChangePassword = async () => {
        if (passwordData.nova !== passwordData.confirmar) {
            Alert.alert('Erro', 'As senhas novas não coincidem.');
            return;
        }
        if (passwordData.nova.length < 6) {
            Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setLoading(true);
        try {
            await authLib.updatePassword(passwordData.nova);
            Alert.alert('Sucesso', 'Senha alterada com segurança.');
            setPasswordData({ atual: '', nova: '', confirmar: '' });
        } catch (e: any) {
            Alert.alert('Erro', e.message || 'Falha ao alterar senha.');
        } finally {
            setLoading(false);
        }
    };

        const uploadAvatar = async (uri: string) => {
        try {
            setLoading(true);
            const user = await authLib.getUser();
            if (!user) throw new Error("Usuário não logado.");

            // Detecta a extensão real — ignora 'blob' e 'undefined'
            const rawExt = uri.substring(uri.lastIndexOf('.') + 1).toLowerCase();
            const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt) ? rawExt : 'jpg';
            const unique = Math.random().toString(36).slice(2);
            const fileName = `${user.id}/${unique}.${ext}`;

            const s3Key = await uploadImageToS3(uri, fileName);

            await profileApi.update({ avatarUrl: s3Key });

            const base64 = await getImageFromS3(s3Key);
            if (base64) setAvatarUri(base64);
            Alert.alert("Sucesso", "Foto atualizada com sucesso!");

        } catch (e: any) {
            console.error('Erro ao atualizar foto:', e);
            Alert.alert("Erro", e.message || "Falha ao atualizar a foto de perfil.");
        } finally {
            setLoading(false);
        }
    };

    const handlePickImage = () => {
        Alert.alert(
            "Foto de Perfil",
            "Escolha de onde quer adicionar sua foto:",
            [
                {
                    text: "Tirar Foto (Câmera)",
                    onPress: async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Permissão Negada', 'Precisamos de acesso à câmera.');
                            return;
                        }
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            allowsEditing: true,
                            aspect: [1, 1],
                            quality: 0.5,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            await uploadAvatar(result.assets[0].uri);
                        }
                    }
                },
                {
                    text: "Escolher da Galeria",
                    onPress: async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Permissão Negada', 'Precisamos de acesso à galeria.');
                            return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            allowsEditing: true,
                            aspect: [1, 1],
                            quality: 0.5,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            await uploadAvatar(result.assets[0].uri);
                        }
                    }
                },
                { text: "Cancelar", style: "cancel" }
            ]
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* HEADER */}
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <Text style={{ fontSize: 20, color: colors.text }}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Voltar para Ajustes</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <Animated.View style={animatedStyle}>
                {/* TÍTULO DA PÁGINA */}
                <Text style={[styles.pageTitle, { color: colors.text }]}>Configurações</Text>
                <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    Gerencie suas informações pessoais e configurações da conta
                </Text>

                {/* =========================================
            CARD 1: RESUMO DO PERFIL
        =========================================== */}
                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>Resumo do Perfil</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>Informações atuais salvas no banco</Text>

                    <View style={styles.avatarRow}>
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]} />
                        ) : (
                            <View style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]}>
                                <MaterialCommunityIcons name="account-outline" size={30} color={colors.textMuted} />
                            </View>
                        )}
                        <View style={{ marginLeft: 16 }}>
                            <Text style={[styles.avatarName, { color: colors.text }]}>{formData.nome}</Text>
                            <Text style={[styles.avatarEmail, { color: colors.textMuted }]}>{formData.email}</Text>
                        </View>
                    </View>

                    <View style={styles.infoBlock}>
                        <InfoRow colors={colors} label1="RAZÃO SOCIAL" val1={formData.razaoSocial} label2="CNPJ" val2={formData.cnpj} />
                        <InfoRow colors={colors} label1="ENDEREÇO" val1={`${formData.endereco}, ${formData.numero} `} label2="CIDADE" val2={formData.cidade} />
                        <InfoRow colors={colors} label1="ESTADO" val1={formData.estado} label2="CEP" val2={formData.cep} />
                        <InfoRow colors={colors} label1="TELEFONE" val1={formData.telefone} label2="" val2="" />
                    </View>
                </View>

                {/* =========================================
            CARD 2: INFORMAÇÕES DO PERFIL (EDITÁVEL)
        =========================================== */}
                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>Informações do Perfil</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>Atualize suas informações pessoais e da empresa</Text>

                    {/* Trocar Foto */}
                    <View style={[styles.avatarRow, { marginBottom: 24 }]}>
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]} />
                        ) : (
                            <View style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]}>
                                <MaterialCommunityIcons name="account-outline" size={30} color={colors.textMuted} />
                            </View>
                        )}
                        <View style={{ marginLeft: 16 }}>
                            <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.border }]} onPress={handlePickImage}>
                                <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Alterar Foto</Text>
                            </TouchableOpacity>
                            <Text style={[styles.helperText, { color: colors.primary }]}>JPG, PNG ou GIF (máx. 2MB)</Text>
                        </View>
                    </View>

                    {/* Campos Pessoais / Fantasia */}
                    <View style={styles.twoCols}>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Nome do Usuário" />
                            <CustomInput colors={colors} value={formData.nome} onChangeText={(t: string) => setFormData({ ...formData, nome: t })} />
                        </View>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Nome Fantasia" />
                            <CustomInput colors={colors} value={formData.nomeFantasia} onChangeText={(t: string) => setFormData({ ...formData, nomeFantasia: t })} />
                        </View>
                    </View>

                    {/* Razão Social / CNPJ */}
                    <View style={styles.twoCols}>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Razão Social" />
                            <CustomInput colors={colors} value={formData.razaoSocial} onChangeText={(t: string) => setFormData({ ...formData, razaoSocial: t })} />
                        </View>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="CNPJ" />
                            <CustomInput colors={colors} value={formData.cnpj} onChangeText={(t: string) => setFormData({ ...formData, cnpj: t })} />
                        </View>
                    </View>

                    {/* Email */}
                    <InputLabel colors={colors} label="Email" />
                    <CustomInput colors={colors} value={formData.email} onChangeText={(t: string) => setFormData({ ...formData, email: t })} />

                    <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 12 }]}>Endereço da Empresa</Text>

                    {/* Endereço / Numero / Cidade (Adaptação mobile, 2 num linha, 1 noutra pra caber) */}
                    <InputLabel colors={colors} label="Endereço Completo" />
                    <CustomInput colors={colors} value={formData.endereco} onChangeText={(t: string) => setFormData({ ...formData, endereco: t })} />

                    <View style={styles.twoCols}>
                        <View style={[styles.col, { flex: 0.4 }]}>
                            <InputLabel colors={colors} label="Número" />
                            <CustomInput colors={colors} value={formData.numero} onChangeText={(t: string) => setFormData({ ...formData, numero: t })} />
                        </View>
                        <View style={[styles.col, { flex: 0.6 }]}>
                            <InputLabel colors={colors} label="Cidade" />
                            <CustomInput colors={colors} value={formData.cidade} onChangeText={(t: string) => setFormData({ ...formData, cidade: t })} />
                        </View>
                    </View>

                    <View style={styles.twoCols}>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Estado" />
                            <CustomInput colors={colors} value={formData.estado} onChangeText={(t: string) => setFormData({ ...formData, estado: t })} />
                        </View>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="CEP" />
                            <CustomInput colors={colors} value={formData.cep} onChangeText={(t: string) => setFormData({ ...formData, cep: t })} />
                        </View>
                    </View>

                    <InputLabel colors={colors} label="Telefone" />
                    <CustomInput colors={colors} value={formData.telefone} onChangeText={(t: string) => setFormData({ ...formData, telefone: t })} />

                    {/* Botão Salvar */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                            onPress={handleSaveProfile}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Salvar Alterações</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* =========================================
            CARD 3: ALTERAR SENHA
        =========================================== */}
                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>Alterar Senha</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>Mantenha sua conta segura com uma senha forte</Text>

                    <InputLabel colors={colors} label="Senha Atual" />
                    <CustomInput colors={colors} secure value={passwordData.atual} onChangeText={(t: string) => setPasswordData({ ...passwordData, atual: t })} />

                    <View style={styles.twoCols}>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Nova Senha" />
                            <CustomInput colors={colors} secure value={passwordData.nova} onChangeText={(t: string) => setPasswordData({ ...passwordData, nova: t })} />
                        </View>
                        <View style={styles.col}>
                            <InputLabel colors={colors} label="Confirmar Nova Senha" />
                            <CustomInput colors={colors} secure value={passwordData.confirmar} onChangeText={(t: string) => setPasswordData({ ...passwordData, confirmar: t })} />
                        </View>
                    </View>

                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                            onPress={handleChangePassword}
                            disabled={loading}
                        >
                            <Text style={styles.primaryBtnText}>Alterar Senha</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 80,
    },
    pageTitle: {
        fontSize: 26,
        fontWeight: '800',
        marginBottom: 4,
    },
    pageSub: {
        fontSize: 14,
        marginBottom: 24,
    },
    card: {
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 24,
        // Sombra suave para os cards
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 2,
        letterSpacing: -0.5,
    },
    cardSub: {
        fontSize: 13,
        marginBottom: 20,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarDummy: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarName: {
        fontSize: 16,
        fontWeight: '700',
    },
    avatarEmail: {
        fontSize: 13,
        marginTop: 2,
    },
    outlineBtn: {
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 6,
    },
    outlineBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    helperText: {
        fontSize: 10,
        opacity: 0.8,
    },
    // INFORMAÇÕES DE LEITURA (Card 1)
    infoBlock: {
        marginTop: 8,
    },
    infoLabel: {
        fontSize: 10,
        fontWeight: '700',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    infoVal: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 16,
    },
    // FORMULÁRIO (Card 2 e 3)
    sectionHeading: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        marginBottom: 16,
    },
    twoCols: {
        flexDirection: 'row',
        gap: 12,
    },
    col: {
        flex: 1,
    },
    actionRow: {
        marginTop: 8,
        alignItems: 'flex-start', // Igual Web: botão justificado a esquerda
    },
    primaryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 140,
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});
