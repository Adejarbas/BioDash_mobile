import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

interface RatingModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function RatingModal({ visible, onClose }: RatingModalProps) {
    const { colors } = useTheme();
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [estrelas, setEstrelas] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (estrelas === 0) {
            Alert.alert('Aviso', 'Por favor, selecione pelo menos uma estrela para nos avaliar.');
            return;
        }

        setLoading(true);
        try {
            const novaAvaliacao = {
                titulo: titulo || 'Avaliação via App',
                descricao,
                estrelas,
                data: new Date().toISOString()
            };

            const armazenado = await AsyncStorage.getItem('@biodash_ratings');
            const avaliacoes = armazenado ? JSON.parse(armazenado) : [];
            avaliacoes.push(novaAvaliacao);
            await AsyncStorage.setItem('@biodash_ratings', JSON.stringify(avaliacoes));

            Alert.alert('Obrigado!', 'Sua avaliação foi registrada e nos ajuda a melhorar.');
            setTitulo('');
            setDescricao('');
            setEstrelas(0);
            onClose();
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível salvar a avaliação.');
        } finally {
            setLoading(false);
        }
    };

    const StarButton = ({ index }: { index: number }) => (
        <TouchableOpacity onPress={() => setEstrelas(index)}>
            <Text style={{ fontSize: 40, color: index <= estrelas ? '#facc15' : colors.border }}>
                ★
            </Text>
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.title, { color: colors.text }]}>Deixe sua avaliação</Text>
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                        Sua opinião é fundamental para evoluirmos o sistema!
                    </Text>

                    <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <StarButton key={star} index={star} />
                        ))}
                    </View>

                    <Text style={[styles.label, { color: colors.text }]}>Título (Opcional)</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        placeholder="Ex: Ótimo sistema!"
                        placeholderTextColor={colors.textMuted}
                        value={titulo}
                        onChangeText={setTitulo}
                    />

                    <Text style={[styles.label, { color: colors.text }]}>Descrição</Text>
                    <TextInput
                        style={[
                            styles.input,
                            styles.textArea,
                            { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                        ]}
                        placeholder="Conte sua experiência e sugestões..."
                        placeholderTextColor={colors.textMuted}
                        value={descricao}
                        onChangeText={setDescricao}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.cancelBtn, { borderColor: colors.border }]}
                            onPress={onClose}
                            disabled={loading}
                        >
                            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.submitText}>Enviar</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
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
        padding: 24,
        borderTopWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        marginBottom: 24,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 24,
        gap: 8,
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
        paddingBottom: 20, // Pra dar espaço em devices sem notch
    },
    cancelBtn: {
        flex: 1,
        borderWidth: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelText: {
        fontWeight: '600',
        fontSize: 15,
    },
    submitBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    submitText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    }
});
