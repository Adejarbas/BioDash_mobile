import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Animated } from 'react-native';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import { HelpCenterScreenProps } from '../navigation/types';

export default function HelpCenterScreen({ navigation }: HelpCenterScreenProps) {
    const { colors } = useTheme();
    const { animatedStyle } = useFadeInUp()

    const handleContactSupport = () => {
        Linking.openURL('mailto:suporte@biodash.com?subject=Suporte App BioDash');
    };

    const FaqItem = ({ question, answer }: { question: string, answer: string }) => (
        <View style={[styles.faqItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.faqQuestion, { color: colors.text }]}>{question}</Text>
            <Text style={[styles.faqAnswer, { color: colors.textMuted }]}>{answer}</Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <Text style={{ fontSize: 20, color: colors.text }}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Voltar para Ajustes</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Animated.View style={animatedStyle}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Central de Ajuda</Text>
                <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    Dúvidas frequentes e suporte técnico.
                </Text>

                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>Perguntas Frequentes (FAQ)</Text>

                    <FaqItem
                        question="Como atualizo os dados do biodigestor?"
                        answer="Os dados são atualizados automaticamente em tempo real caso tenha internet. Você também pode puxar a tela do Dashboard para baixo para forçar uma atualização."
                    />
                    <FaqItem
                        question="O que significa o alerta de H2S?"
                        answer="Indica que a concentração de Gás Sulfídrico está acima do normal. Verifique os filtros imediatamente."
                    />
                    <FaqItem
                        question="Esqueci minha senha, e agora?"
                        answer="Por motivos de segurança, se você esquecer a senha atual de Perfil, deverá solicitar a redefinição através do contato com o suporte."
                    />
                    <FaqItem
                        question="Como exportar relatórios antigos?"
                        answer="No Dashboard aba role até o final e clique em Gerar PDF ou Excel. Eles exportam a competência atual."
                    />
                </View>

                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border, marginTop: 16 }]}>
                    <Text style={[styles.cardTitle, { color: colors.primary, marginBottom: 8 }]}>Ainda precisa de ajuda?</Text>
                    <Text style={[styles.paragraph, { color: colors.textMuted, marginBottom: 16 }]}>
                        Nossa equipe técnica está pronta para ajudar com problemas operacionais ou dúvidas no aplicativo.
                    </Text>

                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: colors.primary, gap: 8 }]}
                        onPress={handleContactSupport}
                    >
                        <MaterialCommunityIcons name="email-outline" size={20} color="#fff" />
                        <Text style={styles.primaryBtnText}>Contatar Suporte</Text>
                    </TouchableOpacity>
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
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
    },
    faqItem: {
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    faqQuestion: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 6,
    },
    faqAnswer: {
        fontSize: 14,
        lineHeight: 20,
    },
    paragraph: {
        fontSize: 14,
        lineHeight: 20,
    },
    primaryBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});
