import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { useTheme } from '../context/ThemeContext';
import SubScreenHeader from '../components/SubScreenHeader';

interface Props {
    onBack: () => void;
    onNavigateHelpCenter?: () => void;
}

export default function TermsScreen({ onBack, onNavigateHelpCenter }: Props) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { animatedStyle } = useFadeInUp();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <SubScreenHeader onBack={onBack} />

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 + insets.bottom }]}>
                <Animated.View style={animatedStyle}>
                    <Text style={[styles.pageTitle, { color: colors.text }]} accessibilityRole="header">
                        Termos de Uso e Privacidade
                    </Text>
                    <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                        Última atualização: Março de 2026
                    </Text>

                    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.primary }]} accessibilityRole="header">
                            1. Aceitação dos Termos
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.text }]} selectable>
                            Ao acessar e utilizar o aplicativo BioDash, você concorda em cumprir e ficar vinculado a estes Termos de Uso e Política de Privacidade.
                        </Text>

                        <Text style={[styles.sectionTitle, { color: colors.primary }]} accessibilityRole="header">
                            2. Uso do Aplicativo
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.text }]} selectable>
                            O aplicativo destina-se ao monitoramento e gestão de biodigestores. O usuário é responsável por manter a confidencialidade de sua conta e senha.
                        </Text>

                        <Text style={[styles.sectionTitle, { color: colors.primary }]} accessibilityRole="header">
                            3. Coleta de Dados
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.text }]} selectable>
                            Coletamos informações relacionadas ao funcionamento do biodigestor, incluindo telemetria, produção de biogás e dados de perfil do usuário para fornecer nossos serviços.
                        </Text>

                        <Text style={[styles.sectionTitle, { color: colors.primary }]} accessibilityRole="header">
                            4. Privacidade e Segurança
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.text }]} selectable>
                            Seus dados são armazenados de forma segura e não serão compartilhados com terceiros sem consentimento, exceto quando exigido por lei.
                        </Text>

                        <Text style={[styles.sectionTitle, { color: colors.primary }]} accessibilityRole="header">
                            5. Limitação de Responsabilidade
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.text }]} selectable>
                            A BioDash não se responsabiliza por falhas no maquinário físico ou por perdas decorrentes do uso inadequado das informações fornecidas pelo aplicativo.
                        </Text>

                        {onNavigateHelpCenter ? (
                            <TouchableOpacity
                                style={styles.helpLinkBtn}
                                onPress={onNavigateHelpCenter}
                                accessibilityRole="button"
                                accessibilityLabel="Ir para a Central de Ajuda"
                            >
                                <Text style={[styles.helpLinkText, { color: colors.primary }]}>
                                    Para dúvidas, acesse a Central de Ajuda →
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={[styles.paragraph, { color: colors.textMuted, marginTop: 20, fontStyle: 'italic', textAlign: 'center' }]}>
                                Para dúvidas, entre em contato via Central de Ajuda.
                            </Text>
                        )}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 20 },
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
    },
    helpLinkBtn: {
        marginTop: 20,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    helpLinkText: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
