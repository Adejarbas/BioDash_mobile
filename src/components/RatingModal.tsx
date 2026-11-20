import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../lib/feedback';

interface RatingModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function RatingModal({ visible, onClose }: RatingModalProps) {
    const { colors, theme } = useTheme();
    const insets = useSafeAreaInsets();
    const descricaoRef = useRef<TextInput>(null);

    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [estrelas, setEstrelas] = useState(0);
    const [loading, setLoading] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const activeStarColor = theme === 'dark' ? '#facc15' : '#d97706';

    const handleClose = () => {
        if (loading) return;
        setValidationError(null);
        onClose();
    };

    const handleSubmit = async () => {
        if (estrelas === 0) {
            setValidationError('Por favor, selecione pelo menos uma estrela para nos avaliar.');
            return;
        }

        setValidationError(null);
        setLoading(true);
        try {
            const novaAvaliacao = {
                titulo: titulo.trim() || 'Avaliação via App',
                descricao: descricao.trim(),
                estrelas,
                data: new Date().toISOString(),
            };

            const armazenado = await AsyncStorage.getItem('@biodash_ratings');
            const avaliacoes = armazenado ? JSON.parse(armazenado) : [];
            avaliacoes.push(novaAvaliacao);
            await AsyncStorage.setItem('@biodash_ratings', JSON.stringify(avaliacoes));

            showAlert('Obrigado!', 'Sua avaliação foi registrada neste dispositivo e nos ajuda a melhorar.');
            setTitulo('');
            setDescricao('');
            setEstrelas(0);
            onClose();
        } catch {
            showAlert('Erro', 'Não foi possível salvar a avaliação.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    accessible={false}
                    onPress={handleClose}
                />

                <View
                    accessibilityViewIsModal
                    style={[
                        styles.modalContent,
                        {
                            backgroundColor: colors.cardBackground,
                            borderColor: colors.border,
                            paddingBottom: Math.max(insets.bottom, 20),
                        },
                    ]}
                >
                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <View style={styles.headerRow}>
                            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                                Deixe sua avaliação
                            </Text>
                            <TouchableOpacity
                                style={styles.closeBtn}
                                onPress={handleClose}
                                disabled={loading}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar avaliação"
                            >
                                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                            Sua opinião é fundamental para evoluirmos o sistema!
                        </Text>

                        <View
                            style={styles.starsContainer}
                            accessibilityRole="radiogroup"
                            accessibilityLabel="Avaliação por estrelas"
                        >
                            {[1, 2, 3, 4, 5].map((star) => {
                                const isSelected = star <= estrelas;
                                return (
                                    <TouchableOpacity
                                        key={star}
                                        style={styles.starBtn}
                                        onPress={() => {
                                            setEstrelas(star);
                                            if (validationError) setValidationError(null);
                                        }}
                                        accessibilityRole="radio"
                                        accessibilityLabel={`Avaliar com ${star} de 5 ${star === 1 ? 'estrela' : 'estrelas'}`}
                                        accessibilityState={{ selected: isSelected, checked: star === estrelas }}
                                    >
                                        <MaterialCommunityIcons
                                            name={isSelected ? 'star' : 'star-outline'}
                                            size={34}
                                            color={isSelected ? activeStarColor : colors.textMuted}
                                            importantForAccessibility="no"
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={[styles.ratingStatusText, { color: colors.textMuted }]}>
                            {estrelas > 0 ? `${estrelas} de 5 ${estrelas === 1 ? 'estrela selecionada' : 'estrelas selecionadas'}` : 'Nenhuma estrela selecionada'}
                        </Text>

                        {validationError ? (
                            <View
                                style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                            >
                                <Text style={[styles.errorText, { color: colors.danger }]}>{validationError}</Text>
                            </View>
                        ) : null}

                        <Text style={[styles.label, { color: colors.text }]}>Título (Opcional)</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.inputBorder }]}
                            placeholder="Ex: Ótimo sistema!"
                            placeholderTextColor={colors.textMuted}
                            maxLength={80}
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => descricaoRef.current?.focus()}
                            accessibilityLabel="Título opcional da avaliação"
                            value={titulo}
                            onChangeText={setTitulo}
                        />

                        <Text style={[styles.label, { color: colors.text }]}>Descrição (Opcional)</Text>
                        <TextInput
                            ref={descricaoRef}
                            style={[
                                styles.input,
                                styles.textArea,
                                { backgroundColor: colors.background, color: colors.text, borderColor: colors.inputBorder },
                            ]}
                            placeholder="Conte sua experiência e sugestões..."
                            placeholderTextColor={colors.textMuted}
                            value={descricao}
                            onChangeText={setDescricao}
                            multiline
                            maxLength={500}
                            numberOfLines={4}
                            textAlignVertical="top"
                            accessibilityLabel="Descrição opcional da avaliação"
                        />

                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={[styles.cancelBtn, { borderColor: colors.inputBorder, opacity: loading ? 0.6 : 1 }]}
                                onPress={handleClose}
                                disabled={loading}
                                accessibilityRole="button"
                                accessibilityLabel="Cancelar"
                                accessibilityState={{ disabled: loading }}
                            >
                                <Text style={[styles.cancelText, { color: colors.text }]}>Cancelar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.submitBtn,
                                    { backgroundColor: colors.primary, opacity: loading || estrelas === 0 ? 0.6 : 1 },
                                ]}
                                onPress={handleSubmit}
                                disabled={loading}
                                accessibilityRole="button"
                                accessibilityLabel={loading ? 'Enviando avaliação, aguarde' : 'Enviar avaliação'}
                                accessibilityState={{ disabled: loading || estrelas === 0, busy: loading }}
                            >
                                {loading ? (
                                    <ActivityIndicator color={colors.onPrimary} size="small" />
                                ) : (
                                    <Text style={[styles.submitText, { color: colors.onPrimary }]}>Enviar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        maxHeight: '90%',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    closeBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: -10,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        marginBottom: 20,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 8,
        gap: 8,
    },
    starBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ratingStatusText: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
    },
    errorBox: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginBottom: 14,
    },
    errorText: {
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        marginBottom: 16,
    },
    textArea: {
        height: 100,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    cancelBtn: {
        flex: 1,
        borderWidth: 1,
        minHeight: 44,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelText: {
        fontWeight: '600',
        fontSize: 15,
    },
    submitBtn: {
        flex: 1,
        minHeight: 44,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        fontWeight: '700',
        fontSize: 15,
    },
});
