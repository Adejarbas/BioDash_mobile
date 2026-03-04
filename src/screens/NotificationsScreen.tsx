import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ActivityItem {
    id: number;
    type: "success" | "warning" | "info" | "error";
    message: string;
    timestamp: string;
}

interface Props {
    onBack: () => void;
}

export default function NotificationsScreen({ onBack }: Props) {
    const { colors } = useTheme();
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    const demoActivities: ActivityItem[] = [
        { id: 1, type: "success", message: "Sistema de aquecimento otimizado automaticamente", timestamp: "Agora mesmo" },
        { id: 2, type: "warning", message: "Pressão do gás ligeiramente elevada", timestamp: "Há 5 min" },
        { id: 3, type: "info", message: "Novo sensor de pH instalado e calibrado", timestamp: "Há 12 min" },
        { id: 4, type: "success", message: "Eficiência energética aumentou para 94%", timestamp: "Há 30 min" },
        { id: 5, type: "info", message: "Backup de dados realizado com sucesso", timestamp: "Há 1 hora" },
        { id: 6, type: "warning", message: "Filtro de entrada precisa de limpeza", timestamp: "Há 2 horas" },
        { id: 7, type: "error", message: "Falha na comunicação com o sensor 3", timestamp: "Há 3 horas" },
        { id: 8, type: "success", message: "Meta diária de produção atingida", timestamp: "Ontem" },
    ];

    useEffect(() => {
        // Simulando chamada API
        setTimeout(() => {
            setActivities(demoActivities);
            setLoading(false);
        }, 1000);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            case 'info': return 'ℹ️';
            default: return '🔔';
        }
    };

    const getIconColor = (type: string) => {
        switch (type) {
            case 'success': return '#dcfce7';
            case 'warning': return '#fef3c7';
            case 'error': return '#fee2e2';
            case 'info': return '#e0f2fe';
            default: return colors.iconBg;
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <Text style={{ fontSize: 20, color: colors.text }}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Voltar para Ajustes</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Notificações e Alertas</Text>
                <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    Acompanhe o feed de atividades recentes do seu biodigestor.
                </Text>

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                        {activities.map((item, index) => (
                            <View key={item.id} style={[
                                styles.activityRow,
                                index !== activities.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                            ]}>
                                <View style={[styles.iconContainer, { backgroundColor: getIconColor(item.type) }]}>
                                    <Text style={{ fontSize: 16 }}>{getIcon(item.type)}</Text>
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={[styles.message, { color: colors.text }]}>{item.message}</Text>
                                    <Text style={[styles.timestamp, { color: colors.textMuted }]}>{item.timestamp}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
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
        borderRadius: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
        overflow: 'hidden'
    },
    activityRow: {
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center'
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12
    },
    textContainer: {
        flex: 1,
    },
    message: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
    },
    timestamp: {
        fontSize: 12,
    }
});
