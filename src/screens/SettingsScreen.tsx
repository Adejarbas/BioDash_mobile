import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'

interface Props {
    onLogout: () => void
}

export default function SettingsScreen({ onLogout }: Props) {
    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>Configurações</Text>
            <Text style={styles.sectionSub}>Gerencie sua conta e preferências operacionais.</Text>

            <View style={styles.card}>
                <TouchableOpacity style={styles.row}>
                    <View style={styles.iconBg}><Text style={styles.rowIcon}>👤</Text></View>
                    <Text style={styles.rowText}>Perfil da Empresa</Text>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.row}>
                    <View style={styles.iconBg}><Text style={styles.rowIcon}>🔔</Text></View>
                    <Text style={styles.rowText}>Notificações e Alertas</Text>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.row}>
                    <View style={styles.iconBg}><Text style={styles.rowIcon}>🔒</Text></View>
                    <Text style={styles.rowText}>Segurança e Senhas</Text>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Aplicativo e Suporte</Text>

            <View style={styles.card}>
                <TouchableOpacity style={styles.row}>
                    <View style={styles.iconBg}><Text style={styles.rowIcon}>❓</Text></View>
                    <Text style={styles.rowText}>Central de Ajuda</Text>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.row}>
                    <View style={styles.iconBg}><Text style={styles.rowIcon}>📄</Text></View>
                    <Text style={styles.rowText}>Termos de Uso e Privacidade</Text>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                <Text style={styles.logoutIcon}>🚪</Text>
                <Text style={styles.logoutText}>Encerrar Sessão</Text>
            </TouchableOpacity>

            <Text style={styles.version}>BioDash Mobile v1.0.0</Text>
            <View style={{ height: 60 }} />
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0fdf4',
    },
    scroll: {
        padding: 20,
        paddingTop: 24,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#14532d',
    },
    sectionSub: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 4,
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#ffffff',
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
        backgroundColor: '#f1f5f9',
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
        color: '#334155',
    },
    chevron: {
        fontSize: 22,
        color: '#94a3b8',
        fontWeight: '300',
    },
    divider: {
        height: 1,
        backgroundColor: '#f1f5f9',
        marginLeft: 48,
    },
    logoutBtn: {
        flexDirection: 'row',
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fca5a5',
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
        color: '#dc2626',
        fontSize: 15,
        fontWeight: '700',
    },
    version: {
        textAlign: 'center',
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 24,
    },
})
