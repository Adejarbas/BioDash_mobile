import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, Colors } from '../context/ThemeContext';
import { showAlert } from '../lib/feedback';
import SubScreenHeader from '../components/SubScreenHeader';

interface Props {
    onBack: () => void;
}

const SUPPORT_EMAIL = 'suporte@biodash.com';

const FaqItem = ({
    question,
    answer,
    colors,
    isLast = false,
}: {
    question: string;
    answer: string;
    colors: Colors;
    isLast?: boolean;
}) => (
    <View
        style={[
            styles.faqItem,
            !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        ]}
    >
        <Text style={[styles.faqQuestion, { color: colors.text }]} accessibilityRole="header">
            {question}
        </Text>
        <Text style={[styles.faqAnswer, { color: colors.textMuted }]}>{answer}</Text>
    </View>
);

export default function HelpCenterScreen({ onBack }: Props) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { animatedStyle } = useFadeInUp();

    const handleContactSupport = async () => {
        const subject = encodeURIComponent('Suporte App BioDash');
        const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                showAlert('Contato de Suporte', `Envie sua mensagem diretamente para: ${SUPPORT_EMAIL}`);
                return;
            }
            await Linking.openURL(url);
        } catch {
            showAlert('Contato de Suporte', `Não foi possível abrir o app de e-mail. Escreva para: ${SUPPORT_EMAIL}`);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <SubScreenHeader onBack={onBack} />

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 + insets.bottom }]}>
                <Animated.View style={animatedStyle}>
                    <Text style={[styles.pageTitle, { color: colors.text }]} accessibilityRole="header">
                        Central de Ajuda
                    </Text>
                    <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                        Dúvidas frequentes e suporte técnico.
                    </Text>

                    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                        <Text style={[styles.cardTitle, { color: colors.primary }]} accessibilityRole="header">
                            Perguntas Frequentes (FAQ)
                        </Text>

                        <FaqItem
                            colors={colors}
                            question="Como atualizo os dados do biodigestor?"
                            answer="Os dados são atualizados automaticamente em tempo real caso tenha internet. Você também pode usar o botão Atualizar ou puxar a tela do Painel para baixo."
                        />
                        <FaqItem
                            colors={colors}
                            question="O que significa o alerta de H2S?"
                            answer="Indica que a concentração de Gás Sulfídrico está acima do normal. Verifique os filtros imediatamente."
                        />
                        <FaqItem
                            colors={colors}
                            question="Como altero minha senha?"
                            answer="Acesse Ajustes → Perfil da Empresa e preencha a seção Alterar Senha. Se estiver sem acesso à conta, entre em contato com o suporte."
                        />
                        <FaqItem
                            colors={colors}
                            isLast
                            question="Como exportar relatórios antigos?"
                            answer="Na aba Painel, role até o final e toque em Gerar PDF, Excel ou CSV para escolher o período desejado."
                        />
                    </View>

                    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border, marginTop: 16 }]}>
                        <Text style={[styles.cardTitle, { color: colors.primary, marginBottom: 8 }]} accessibilityRole="header">
                            Ainda precisa de ajuda?
                        </Text>
                        <Text style={[styles.paragraph, { color: colors.textMuted, marginBottom: 16 }]}>
                            Nossa equipe técnica está pronta para ajudar com problemas operacionais ou dúvidas no aplicativo pelo e-mail{' '}
                            <Text style={{ color: colors.text, fontWeight: '600' }} selectable>
                                {SUPPORT_EMAIL}
                            </Text>
                            .
                        </Text>

                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: colors.primary, gap: 8 }]}
                            onPress={handleContactSupport}
                            accessibilityRole="button"
                            accessibilityLabel="Contatar Suporte"
                            accessibilityHint={`Abre o aplicativo de e-mail para ${SUPPORT_EMAIL}`}
                        >
                            <MaterialCommunityIcons name="email-outline" size={20} color={colors.onPrimary} importantForAccessibility="no" />
                            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Contatar Suporte</Text>
                        </TouchableOpacity>
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
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
    },
    faqItem: {
        paddingVertical: 12,
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
        minHeight: 44,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
