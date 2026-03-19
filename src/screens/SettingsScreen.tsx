import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native'
import { useFadeInUp } from '../hooks/useFadeInUp'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
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
    const { animatedStyle } = useFadeInUp()
    const [isRatingVisible, setRatingVisible] = useState(false)

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scroll}>
            <Animated.View style={animatedStyle}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Configurações</Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Gerencie sua conta e preferências operacionais.</Text>

            <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                <TouchableOpacity style={styles.row} onPress={onNavigateProfile}>
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]}><MaterialCommunityIcons name="account-outline" size={18} color={colors.text} /></View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Perfil da Empresa</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.row} onPress={onNavigateNotifications}>
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]}><MaterialCommunityIcons name="bell-outline" size={18} color={colors.text} /></View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Notificações e Alertas</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Aplicativo e Suporte</Text>

            <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                <TouchableOpacity style={styles.row} onPress={onNavigateHelpCenter}>
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]}><MaterialCommunityIcons name="help-circle-outline" size={18} color={colors.text} /></View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Central de Ajuda</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.row} onPress={onNavigateTerms}>
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]}><MaterialCommunityIcons name="file-document-outline" size={18} color={colors.text} /></View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Termos de Uso e Privacidade</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.row} onPress={() => setRatingVisible(true)}>
                    <View style={[styles.iconBg, { backgroundColor: colors.iconBg }]}><MaterialCommunityIcons name="star-outline" size={18} color={colors.text} /></View>
                    <Text style={[styles.rowText, { color: colors.text }]}>Avalie nosso Sistema</Text>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.danger }]} onPress={onLogout}>
                <Text style={[styles.logoutText, { color: colors.danger }]}>Encerrar Sessão</Text>
            </TouchableOpacity>

            <Text style={[styles.version, { color: colors.textMuted }]}>BioDash Mobile v1.0.0</Text>
            <View style={{ height: 60 }} />

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
