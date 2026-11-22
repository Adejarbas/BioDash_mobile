import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { useTheme, Colors } from '../context/ThemeContext';
import { authLib } from '../lib/auth';
import { profileApi } from '../lib/api';
import { uploadFile, getDownloadUrl } from '../lib/storage';
import { showAlert } from '../lib/feedback';
import { maskCNPJ, maskPhone, maskCEP } from '../lib/dashboardMetrics';
import SubScreenHeader from '../components/SubScreenHeader';

interface ProfileFormData {
    nome: string;
    nomeFantasia: string;
    razaoSocial: string;
    cnpj: string;
    email: string;
    endereco: string;
    numero: string;
    cidade: string;
    estado: string;
    cep: string;
    telefone: string;
}

const EMPTY_PROFILE: ProfileFormData = {
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
};

const InputLabel = ({ label, colors }: { label: string; colors: Colors }) => (
    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>{label}</Text>
);

interface CustomInputProps extends Omit<TextInputProps, 'style'> {
    colors: Colors;
    inputRef?: React.RefObject<TextInput | null>;
    style?: TextInputProps['style'];
}

const CustomInput = ({
    colors,
    inputRef,
    style,
    placeholderTextColor,
    ...rest
}: CustomInputProps) => (
    <TextInput
        ref={inputRef}
        style={[
            styles.input,
            {
                backgroundColor: colors.background,
                borderColor: colors.inputBorder,
                color: colors.text,
            },
            style,
        ]}
        placeholderTextColor={placeholderTextColor ?? colors.textMuted}
        {...rest}
    />
);

const InfoRow = ({
    label1,
    val1,
    label2,
    val2,
    colors,
}: {
    label1: string;
    val1: string;
    label2?: string;
    val2?: string;
    colors: Colors;
}) => (
    <View style={styles.twoCols}>
        <View style={styles.col}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label1}</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{val1 || '—'}</Text>
        </View>
        {label2 ? (
            <View style={styles.col}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label2}</Text>
                <Text style={[styles.infoVal, { color: colors.text }]}>{val2 || '—'}</Text>
            </View>
        ) : null}
    </View>
);

interface Props {
    onBack: () => void;
}

export default function CompanyProfileScreen({ onBack }: Props) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { animatedStyle } = useFadeInUp();

    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const [avatarUri, setAvatarUri] = useState<string | null>(null);

    const [savedProfile, setSavedProfile] = useState<ProfileFormData>(EMPTY_PROFILE);
    const [formData, setFormData] = useState<ProfileFormData>(EMPTY_PROFILE);

    const [passwordData, setPasswordData] = useState({
        nova: '',
        confirmar: '',
    });
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const nomeFantasiaRef = useRef<TextInput>(null);
    const razaoSocialRef = useRef<TextInput>(null);
    const cnpjRef = useRef<TextInput>(null);
    const emailRef = useRef<TextInput>(null);
    const enderecoRef = useRef<TextInput>(null);
    const numeroRef = useRef<TextInput>(null);
    const cidadeRef = useRef<TextInput>(null);
    const estadoRef = useRef<TextInput>(null);
    const cepRef = useRef<TextInput>(null);
    const telefoneRef = useRef<TextInput>(null);
    const confirmPasswordRef = useRef<TextInput>(null);

    const loadProfile = useCallback(async () => {
        setIsInitialLoading(true);
        setLoadError(null);
        try {
            const user = await authLib.getUser();
            if (!user) {
                setLoadError('Sessão não encontrada. Faça login novamente.');
                return;
            }

            const res = await profileApi.fetch();
            if (!res.success && !res.data) {
                setLoadError(res.error || 'Não foi possível carregar os dados do perfil.');
                return;
            }

            const profile = res.data;

            if (profile?.avatar_url) {
                let key = profile.avatar_url;
                if (key.startsWith('http://') || key.startsWith('https://')) {
                    try {
                        const urlObj = new URL(key);
                        const parts = urlObj.pathname.split('/').filter(Boolean);
                        key = parts.length > 1 ? parts.slice(1).join('/') : (parts[0] || key);
                    } catch {
                        // Mantém a key original se não for uma URL válida
                    }
                }
                const downloadUrl = await getDownloadUrl(key);
                if (downloadUrl) setAvatarUri(downloadUrl);
            }

            const loaded: ProfileFormData = {
                nome: profile?.name || '',
                nomeFantasia: profile?.company || '',
                razaoSocial: profile?.razao_social || '',
                cnpj: maskCNPJ(profile?.cnpj || ''),
                email: profile?.email || user.email || '',
                endereco: profile?.address || '',
                numero: profile?.numero?.toString() || '',
                cidade: profile?.city || '',
                estado: profile?.state || '',
                cep: maskCEP(profile?.zip_code || ''),
                telefone: maskPhone(profile?.phone || ''),
            };

            setSavedProfile(loaded);
            setFormData(loaded);
        } catch (err: any) {
            setLoadError(err?.message || 'Erro ao carregar os dados do perfil.');
        } finally {
            setIsInitialLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    const handleFetchCep = async (rawCep: string) => {
        const clean = rawCep.replace(/\D/g, '');
        if (clean.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
            const data = await res.json();
            if (data.erro) {
                showAlert('Aviso', 'CEP não encontrado.');
                return;
            }
            const nextAddress = [data.logradouro, data.bairro].filter(Boolean).join(', ');
            setFormData((prev) => ({
                ...prev,
                endereco: nextAddress || prev.endereco,
                cidade: data.localidade || prev.cidade,
                estado: data.uf || prev.estado,
            }));
            AccessibilityInfo.announceForAccessibility?.('Endereço preenchido automaticamente pelo CEP.');
        } catch {
            showAlert('Erro', 'Falha ao consultar o ViaCEP.');
        } finally {
            setCepLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
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
            setSavedProfile(formData);
            showAlert('Sucesso', 'Informações atualizadas com sucesso!');
        } catch (e: any) {
            showAlert('Erro', e.message || 'Falha ao atualizar o perfil.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passwordData.nova && !passwordData.confirmar) {
            showAlert('Aviso', 'Por favor, digite a nova senha e confirme-a.');
            return;
        }

        if (passwordData.nova !== passwordData.confirmar) {
            showAlert('Erro', 'As senhas novas não coincidem.');
            return;
        }

        if (passwordData.nova.length < 6) {
            showAlert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setIsChangingPassword(true);
        try {
            await authLib.updatePassword(passwordData.nova);
            showAlert('Sucesso', 'Senha alterada com sucesso!');
            setPasswordData({ nova: '', confirmar: '' });
        } catch (e: any) {
            showAlert('Erro', e.message || 'Falha ao alterar senha.');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const uploadAvatar = async (uri: string) => {
        try {
            setIsUploadingAvatar(true);
            const user = await authLib.getUser();
            if (!user) throw new Error('Usuário não logado.');

            const rawExt = uri.substring(uri.lastIndexOf('.') + 1).toLowerCase();
            const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt) ? rawExt : 'jpg';
            const unique = Math.random().toString(36).slice(2);
            const fileName = `${user.id}/${unique}.${ext}`;

            if (Platform.OS === 'web') {
                const response = await fetch(uri);
                const blob = await response.blob();
                const base64String: string = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                setAvatarUri(base64String);
                const storageKey = await uploadFile(uri, fileName);
                await profileApi.update({ avatarUrl: storageKey });
                const downloadUrl = await getDownloadUrl(storageKey);
                if (downloadUrl) setAvatarUri(downloadUrl);
            } else {
                const storageKey = await uploadFile(uri, fileName);
                await profileApi.update({ avatarUrl: storageKey });
                const downloadUrl = await getDownloadUrl(storageKey);
                if (downloadUrl) setAvatarUri(downloadUrl);
            }

            showAlert('Sucesso', 'Foto atualizada com sucesso!');
        } catch (e: any) {
            showAlert('Erro', e.message || 'Falha ao atualizar a foto de perfil.');
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handlePickImage = async () => {
        if (isUploadingAvatar) return;

        if (Platform.OS === 'web') {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });
            if (!result.canceled && result.assets[0].uri) {
                await uploadAvatar(result.assets[0].uri);
            }
            return;
        }

        Alert.alert(
            'Foto de Perfil',
            'Escolha de onde quer adicionar sua foto:',
            [
                {
                    text: 'Tirar Foto (Câmera)',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') {
                            showAlert('Permissão Negada', 'Precisamos de acesso à câmera.');
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
                    },
                },
                {
                    text: 'Escolher da Galeria',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') {
                            showAlert('Permissão Negada', 'Precisamos de acesso à galeria.');
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
                    },
                },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    const savedFormattedAddress = [savedProfile.endereco, savedProfile.numero].filter(Boolean).join(', ');

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <SubScreenHeader onBack={onBack} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 + insets.bottom }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View style={animatedStyle}>
                        <Text style={[styles.pageTitle, { color: colors.text }]} accessibilityRole="header">
                            Perfil da Empresa
                        </Text>
                        <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                            Gerencie suas informações pessoais e configurações da conta
                        </Text>

                        {isInitialLoading ? (
                            <View
                                style={[styles.statusCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                                accessibilityLiveRegion="polite"
                            >
                                <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Carregando perfil" />
                                <Text style={[styles.statusText, { color: colors.textMuted }]}>Carregando perfil da empresa...</Text>
                            </View>
                        ) : loadError ? (
                            <View
                                style={[styles.statusCard, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
                                accessibilityRole="alert"
                                accessibilityLiveRegion="assertive"
                            >
                                <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.danger} importantForAccessibility="no" />
                                <Text style={[styles.statusText, { color: colors.danger, fontWeight: '600' }]}>{loadError}</Text>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                                    onPress={() => void loadProfile()}
                                    accessibilityRole="button"
                                    accessibilityLabel="Tentar novamente"
                                >
                                    <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Tentar novamente</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                {/* CARD 1: RESUMO DO PERFIL */}
                                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                                    <Text style={[styles.cardTitle, { color: colors.primary }]} accessibilityRole="header">
                                        Resumo do Perfil
                                    </Text>
                                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                                        Informações atuais salvas no banco
                                    </Text>

                                    <View style={styles.avatarRow}>
                                        {avatarUri ? (
                                            <Image
                                                source={{ uri: avatarUri }}
                                                style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]}
                                                accessible
                                                accessibilityRole="image"
                                                accessibilityLabel="Foto de perfil da empresa"
                                            />
                                        ) : (
                                            <View style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                                                <MaterialCommunityIcons name="account-outline" size={30} color={colors.textMuted} importantForAccessibility="no" />
                                            </View>
                                        )}
                                        <View style={styles.avatarInfo}>
                                            <Text style={[styles.avatarName, { color: colors.text }]}>{savedProfile.nome || '—'}</Text>
                                            <Text style={[styles.avatarEmail, { color: colors.textMuted }]}>{savedProfile.email || '—'}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.infoBlock}>
                                        <InfoRow colors={colors} label1="RAZÃO SOCIAL" val1={savedProfile.razaoSocial} label2="CNPJ" val2={savedProfile.cnpj} />
                                        <InfoRow colors={colors} label1="ENDEREÇO" val1={savedFormattedAddress} label2="CIDADE" val2={savedProfile.cidade} />
                                        <InfoRow colors={colors} label1="ESTADO" val1={savedProfile.estado} label2="CEP" val2={savedProfile.cep} />
                                        <InfoRow colors={colors} label1="TELEFONE" val1={savedProfile.telefone} />
                                    </View>
                                </View>

                                {/* CARD 2: INFORMAÇÕES DO PERFIL (EDITÁVEL) */}
                                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                                    <Text style={[styles.cardTitle, { color: colors.primary }]} accessibilityRole="header">
                                        Informações do Perfil
                                    </Text>
                                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                                        Atualize suas informações pessoais e da empresa
                                    </Text>

                                    <View style={[styles.avatarRow, { marginBottom: 24 }]}>
                                        {avatarUri ? (
                                            <Image
                                                source={{ uri: avatarUri }}
                                                style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]}
                                                accessible
                                                accessibilityRole="image"
                                                accessibilityLabel="Pré-visualização da foto de perfil"
                                            />
                                        ) : (
                                            <View style={[styles.avatarDummy, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                                                <MaterialCommunityIcons name="account-outline" size={30} color={colors.textMuted} importantForAccessibility="no" />
                                            </View>
                                        )}
                                        <View style={styles.avatarInfo}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.outlineBtn,
                                                    { borderColor: colors.inputBorder, opacity: isUploadingAvatar ? 0.6 : 1 },
                                                ]}
                                                onPress={handlePickImage}
                                                disabled={isUploadingAvatar}
                                                accessibilityRole="button"
                                                accessibilityLabel={isUploadingAvatar ? 'Enviando foto, aguarde' : 'Alterar Foto'}
                                                accessibilityState={{ disabled: isUploadingAvatar, busy: isUploadingAvatar }}
                                            >
                                                {isUploadingAvatar ? (
                                                    <ActivityIndicator size="small" color={colors.primary} />
                                                ) : (
                                                    <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Alterar Foto</Text>
                                                )}
                                            </TouchableOpacity>
                                            <Text style={[styles.helperText, { color: colors.textMuted }]}>JPG, PNG ou GIF (máx. 2MB)</Text>
                                        </View>
                                    </View>

                                    <View style={styles.twoCols}>
                                        <View style={styles.col}>
                                            <InputLabel colors={colors} label="Nome do Usuário" />
                                            <CustomInput
                                                colors={colors}
                                                value={formData.nome}
                                                accessibilityLabel="Nome do Usuário"
                                                autoComplete="name"
                                                textContentType="name"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => nomeFantasiaRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, nome: t })}
                                            />
                                        </View>
                                        <View style={styles.col}>
                                            <InputLabel colors={colors} label="Nome Fantasia" />
                                            <CustomInput
                                                inputRef={nomeFantasiaRef}
                                                colors={colors}
                                                value={formData.nomeFantasia}
                                                accessibilityLabel="Nome Fantasia"
                                                textContentType="organizationName"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => razaoSocialRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, nomeFantasia: t })}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.twoCols}>
                                        <View style={styles.col}>
                                            <InputLabel colors={colors} label="Razão Social" />
                                            <CustomInput
                                                inputRef={razaoSocialRef}
                                                colors={colors}
                                                value={formData.razaoSocial}
                                                accessibilityLabel="Razão Social"
                                                textContentType="organizationName"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => cnpjRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, razaoSocial: t })}
                                            />
                                        </View>
                                        <View style={styles.col}>
                                            <InputLabel colors={colors} label="CNPJ" />
                                            <CustomInput
                                                inputRef={cnpjRef}
                                                colors={colors}
                                                value={formData.cnpj}
                                                placeholder="XX.XXX.XXX/XXXX-XX"
                                                keyboardType="numeric"
                                                maxLength={18}
                                                accessibilityLabel="CNPJ"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => emailRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, cnpj: maskCNPJ(t) })}
                                            />
                                        </View>
                                    </View>

                                    <InputLabel colors={colors} label="Email" />
                                    <CustomInput
                                        inputRef={emailRef}
                                        colors={colors}
                                        value={formData.email}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        autoComplete="email"
                                        textContentType="emailAddress"
                                        accessibilityLabel="Email"
                                        returnKeyType="next"
                                        blurOnSubmit={false}
                                        onSubmitEditing={() => enderecoRef.current?.focus()}
                                        onChangeText={(t) => setFormData({ ...formData, email: t })}
                                    />

                                    <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 12 }]} accessibilityRole="header">
                                        Endereço da Empresa
                                    </Text>

                                    <InputLabel colors={colors} label="Endereço Completo" />
                                    <CustomInput
                                        inputRef={enderecoRef}
                                        colors={colors}
                                        value={formData.endereco}
                                        autoComplete="street-address"
                                        textContentType="fullStreetAddress"
                                        accessibilityLabel="Endereço Completo"
                                        returnKeyType="next"
                                        blurOnSubmit={false}
                                        onSubmitEditing={() => numeroRef.current?.focus()}
                                        onChangeText={(t) => setFormData({ ...formData, endereco: t })}
                                    />

                                    <View style={styles.twoCols}>
                                        <View style={[styles.col, { flex: 0.4 }]}>
                                            <InputLabel colors={colors} label="Número" />
                                            <CustomInput
                                                inputRef={numeroRef}
                                                colors={colors}
                                                value={formData.numero}
                                                accessibilityLabel="Número"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => cidadeRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, numero: t })}
                                            />
                                        </View>
                                        <View style={[styles.col, { flex: 0.6 }]}>
                                            <InputLabel colors={colors} label="Cidade" />
                                            <CustomInput
                                                inputRef={cidadeRef}
                                                colors={colors}
                                                value={formData.cidade}
                                                textContentType="addressCity"
                                                accessibilityLabel="Cidade"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => estadoRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, cidade: t })}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.twoCols}>
                                        <View style={styles.col}>
                                            <InputLabel colors={colors} label="Estado" />
                                            <CustomInput
                                                inputRef={estadoRef}
                                                colors={colors}
                                                value={formData.estado}
                                                autoCapitalize="characters"
                                                maxLength={2}
                                                textContentType="addressState"
                                                accessibilityLabel="Estado"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => cepRef.current?.focus()}
                                                onChangeText={(t) => setFormData({ ...formData, estado: t.toUpperCase() })}
                                            />
                                        </View>
                                        <View style={styles.col}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                                <Text style={[styles.inputLabel, { color: colors.textMuted, marginBottom: 0 }]}>CEP</Text>
                                                {cepLoading && (
                                                    <ActivityIndicator
                                                        size="small"
                                                        color={colors.primary}
                                                        style={{ marginLeft: 8 }}
                                                        accessibilityLabel="Consultando CEP"
                                                    />
                                                )}
                                            </View>
                                            <CustomInput
                                                inputRef={cepRef}
                                                colors={colors}
                                                value={formData.cep}
                                                placeholder="XXXXX-XXX"
                                                keyboardType="numeric"
                                                maxLength={9}
                                                autoComplete="postal-code"
                                                textContentType="postalCode"
                                                accessibilityLabel="CEP"
                                                returnKeyType="next"
                                                blurOnSubmit={false}
                                                onSubmitEditing={() => telefoneRef.current?.focus()}
                                                onChangeText={(t) => {
                                                    const masked = maskCEP(t);
                                                    setFormData((prev) => ({ ...prev, cep: masked }));
                                                    if (masked.replace(/\D/g, '').length === 8) {
                                                        void handleFetchCep(masked);
                                                    }
                                                }}
                                            />
                                        </View>
                                    </View>

                                    <InputLabel colors={colors} label="Telefone" />
                                    <CustomInput
                                        inputRef={telefoneRef}
                                        colors={colors}
                                        value={formData.telefone}
                                        placeholder="(XX) XXXXX-XXXX"
                                        keyboardType="phone-pad"
                                        autoComplete="tel"
                                        textContentType="telephoneNumber"
                                        accessibilityLabel="Telefone"
                                        returnKeyType="done"
                                        onChangeText={(t) => setFormData({ ...formData, telefone: maskPhone(t) })}
                                    />

                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.primaryBtn,
                                                { backgroundColor: colors.primary, opacity: isSavingProfile ? 0.7 : 1 },
                                            ]}
                                            onPress={handleSaveProfile}
                                            disabled={isSavingProfile}
                                            accessibilityRole="button"
                                            accessibilityLabel={isSavingProfile ? 'Salvando alterações, aguarde' : 'Salvar Alterações'}
                                            accessibilityState={{ disabled: isSavingProfile, busy: isSavingProfile }}
                                        >
                                            {isSavingProfile ? (
                                                <ActivityIndicator size="small" color={colors.onPrimary} />
                                            ) : (
                                                <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Salvar Alterações</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* CARD 3: ALTERAR SENHA */}
                                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                                    <Text style={[styles.cardTitle, { color: colors.primary }]} accessibilityRole="header">
                                        Alterar Senha
                                    </Text>
                                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                                        Mantenha sua conta segura com uma senha forte
                                    </Text>

                                    <InputLabel colors={colors} label="Nova Senha" />
                                    <View style={styles.passwordRow}>
                                        <TextInput
                                            style={[
                                                styles.input,
                                                styles.passwordInput,
                                                {
                                                    backgroundColor: colors.background,
                                                    borderColor: colors.inputBorder,
                                                    color: colors.text,
                                                },
                                            ]}
                                            secureTextEntry={!showNewPassword}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            autoComplete="new-password"
                                            textContentType="newPassword"
                                            accessibilityLabel="Nova Senha"
                                            returnKeyType="next"
                                            blurOnSubmit={false}
                                            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                                            value={passwordData.nova}
                                            onChangeText={(t) => setPasswordData({ ...passwordData, nova: t })}
                                        />
                                        <TouchableOpacity
                                            style={[
                                                styles.eyeBtn,
                                                { backgroundColor: colors.background, borderColor: colors.inputBorder },
                                            ]}
                                            onPress={() => setShowNewPassword((prev) => !prev)}
                                            accessibilityRole="button"
                                            accessibilityLabel={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                                        >
                                            <MaterialCommunityIcons
                                                name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                                                size={20}
                                                color={colors.textMuted}
                                                importantForAccessibility="no"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <InputLabel colors={colors} label="Confirmar Nova Senha" />
                                    <View style={styles.passwordRow}>
                                        <TextInput
                                            ref={confirmPasswordRef}
                                            style={[
                                                styles.input,
                                                styles.passwordInput,
                                                {
                                                    backgroundColor: colors.background,
                                                    borderColor: colors.inputBorder,
                                                    color: colors.text,
                                                },
                                            ]}
                                            secureTextEntry={!showConfirmPassword}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            autoComplete="new-password"
                                            textContentType="newPassword"
                                            accessibilityLabel="Confirmar Nova Senha"
                                            returnKeyType="done"
                                            onSubmitEditing={handleChangePassword}
                                            value={passwordData.confirmar}
                                            onChangeText={(t) => setPasswordData({ ...passwordData, confirmar: t })}
                                        />
                                        <TouchableOpacity
                                            style={[
                                                styles.eyeBtn,
                                                { backgroundColor: colors.background, borderColor: colors.inputBorder },
                                            ]}
                                            onPress={() => setShowConfirmPassword((prev) => !prev)}
                                            accessibilityRole="button"
                                            accessibilityLabel={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                                        >
                                            <MaterialCommunityIcons
                                                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                                                size={20}
                                                color={colors.textMuted}
                                                importantForAccessibility="no"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.primaryBtn,
                                                { backgroundColor: colors.primary, opacity: isChangingPassword ? 0.7 : 1 },
                                            ]}
                                            onPress={handleChangePassword}
                                            disabled={isChangingPassword}
                                            accessibilityRole="button"
                                            accessibilityLabel={isChangingPassword ? 'Alterando senha, aguarde' : 'Alterar Senha'}
                                            accessibilityState={{ disabled: isChangingPassword, busy: isChangingPassword }}
                                        >
                                            {isChangingPassword ? (
                                                <ActivityIndicator size="small" color={colors.onPrimary} />
                                            ) : (
                                                <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Alterar Senha</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </>
                        )}
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
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
    statusCard: {
        padding: 24,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    statusText: {
        fontSize: 14,
        textAlign: 'center',
    },
    card: {
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 24,
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
    avatarInfo: {
        flex: 1,
        marginLeft: 16,
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
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        alignSelf: 'flex-start',
        justifyContent: 'center',
        marginBottom: 6,
    },
    outlineBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    helperText: {
        fontSize: 12,
    },
    infoBlock: {
        marginTop: 8,
    },
    infoLabel: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    infoVal: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 16,
    },
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
    passwordRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        marginBottom: 16,
    },
    passwordInput: {
        flex: 1,
        marginBottom: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },
    eyeBtn: {
        borderWidth: 1,
        borderLeftWidth: 0,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        minWidth: 44,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
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
        alignItems: 'flex-start',
    },
    primaryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        minHeight: 44,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 150,
    },
    primaryBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});
