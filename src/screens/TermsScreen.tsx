import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { useTheme } from '../context/ThemeContext';

interface Props {
    onBack: () => void;
}

export default function TermsScreen({ onBack }: Props) {
    const { colors } = useTheme();
    const { animatedStyle } = useFadeInUp()

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <Text style={{ fontSize: 20, color: colors.text }}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Voltar para Ajustes</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Animated.View style={animatedStyle}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Termos de Uso</Text>
                <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    Última atualização: Março de 2026
                </Text>

                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>1. Aceitação dos Termos</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Ao acessar e utilizar o aplicativo BioDash, você concorda em cumprir e ficar vinculado a estes Termos de Uso e Política de Privacidade.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>2. Uso do Aplicativo</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        O aplicativo destina-se ao monitoramento e gestão de biodigestores. O usuário é responsável por manter a confidencialidade de sua conta e senha.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>3. Coleta de Dados</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Coletamos informações relacionadas ao funcionamento do biodigestor, incluindo telemetria, produção de biogás e dados de perfil do usuário para fornecer nossos serviços.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>4. Privacidade e Segurança</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        Seus dados são armazenados de forma segura e não serão compartilhados com terceiros sem consentimento, exceto quando exigido por lei.
                    </Text>

                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>5. Limitação de Responsabilidade</Text>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        A BioDash não se responsabiliza por falhas no maquinário físico ou por perdas decorrentes do uso inadequado das informações fornecidas pelo aplicativo.
                    </Text>

                    <Text style={[styles.paragraph, { color: colors.textMuted, marginTop: 20, fontStyle: 'italic', textAlign: 'center' }]}>
                        Para dúvidas, entre em contato via Central de Ajuda.
                    </Text>
                </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    headerTitle: { fontSize: 16, fontWeight: '600' },
    scrollContent: { padding: 20, paddingBottom: 80 },
    pageTitle: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
    pageSub: { fontSize: 14, marginBottom: 24 },
    card: {
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
    },
    paragraph: {
        fontSize: 14,
        lineHeight: 22,
    }
});
