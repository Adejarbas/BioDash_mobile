import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFadeInUp } from '../hooks/useFadeInUp'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { showConfirm } from '../lib/feedback'
import RatingModal from '../components/RatingModal'

interface Props {
    onLogout: () => void
    onNavigateProfile?: () => void
    onNavigateNotifications?: () => void
    onNavigateTerms?: () => void
    onNavigateHelpCenter?: () => void
}

export default function SettingsScreen({
    onLogout,
    onNavigateProfile,
    onNavigateNotifications,
    onNavigateTerms,
    onNavigateHelpCenter
}: Props) {
    const { colors } = useTheme()
    const insets = useSafeAreaInsets()
    const { animatedStyle } = useFadeInUp()
    const [isRatingVisible, setRatingVisible] = useState(false)

    const handleLogoutPress = () => {
        showConfirm(
            'Encerrar Sessão',
            'Deseja realmente sair da sua conta?',
            onLogout,
            'Sair',
            true
        )
    }

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={[styles.scroll, { paddingBottom: 88 + insets.bottom }]}
        >
            <Animated.View style={animatedStyle}>
            <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">Configurações</Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Gerencie sua conta e preferências operacionais.</Text>

            <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={onNavigateProfile}
                    accessibilityRole="button"
                    accessibilityLabel="Perfil da Empresa"
                    accessibilityHint="Abre as informações de perfil, endereço e senha"
                >
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                        <MaterialCommunityIcons name="account-outline" size={18} color={colors.text} importantForAccessibility="no" />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Perfil da Empresa</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} importantForAccessibility="no" />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                    style={styles.row}
                    onPress={onNavigateNotifications}
                    accessibilityRole="button"
                    accessibilityLabel="Notificações e Alertas"
                    accessibilityHint="Abre o histórico de alertas e preferências de notificação"
                >
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                        <MaterialCommunityIcons name="bell-outline" size={18} color={colors.text} importantForAccessibility="no" />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Notificações e Alertas</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} importantForAccessibility="no" />
                </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]} accessibilityRole="header">Aplicativo e Suporte</Text>

            <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={onNavigateHelpCenter}
                    accessibilityRole="button"
                    accessibilityLabel="Central de Ajuda"
                    accessibilityHint="Abre perguntas frequentes e contato com o suporte"
                >
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                        <MaterialCommunityIcons name="help-circle-outline" size={18} color={colors.text} importantForAccessibility="no" />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Central de Ajuda</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} importantForAccessibility="no" />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                    style={styles.row}
                    onPress={onNavigateTerms}
                    accessibilityRole="button"
                    accessibilityLabel="Termos de Uso e Privacidade"
                    accessibilityHint="Abre os termos de uso e política de privacidade"
                >
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                        <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.text} importantForAccessibility="no" />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Termos de Uso e Privacidade</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} importantForAccessibility="no" />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => setRatingVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Avalie nosso Sistema"
                    accessibilityHint="Abre o formulário de avaliação do aplicativo"
                >
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]} importantForAccessibility="no">
                        <MaterialCommunityIcons name="star-outline" size={18} color={colors.text} importantForAccessibility="no" />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Avalie nosso Sistema</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} importantForAccessibility="no" />
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: colors.danger }]}
                onPress={handleLogoutPress}
                accessibilityRole="button"
                accessibilityLabel="Encerrar Sessão"
                accessibilityHint="Abre confirmação para sair da sua conta"
            >
                <Text style={[styles.logoutText, { color: colors.danger }]}>Encerrar Sessão</Text>
            </TouchableOpacity>

            <Text style={[styles.version, { color: colors.textMuted }]}>BioDash Mobile v1.0.0</Text>

            <RatingModal visible={isRatingVisible} onClose={() => setRatingVisible(false)} />
            </Animated.View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scroll: {
        padding: 20,
        paddingTop: 24,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: '700',
    },
    sectionSub: {
        fontSize: 13,
        marginTop: 4,
        marginBottom: 20,
    },
    card: {
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    iconBg: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    rowIcon: {
        fontSize: 18,
    },
    rowText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
    },
    chevron: {
        fontSize: 22,
        fontWeight: '300',
    },
    divider: {
        height: 1,
        marginLeft: 48,
    },
    logoutBtn: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 32,
    },
    logoutIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '700',
    },
    version: {
        textAlign: 'center',
        fontSize: 12,
        marginTop: 24,
    },
})
