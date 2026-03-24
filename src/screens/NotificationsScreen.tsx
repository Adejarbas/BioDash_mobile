import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { useFadeInUp } from '../hooks/useFadeInUp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

interface ActivityItem {
    id: string | number;
    type: "success" | "warning" | "info" | "error";
    message: string;
    timestamp: string;
}

import { NotificationsScreenProps } from '../navigation/types';

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
    const { colors } = useTheme();
    const { animatedStyle } = useFadeInUp()
    const [activities, setActivities] = useState<ActivityItem[]>([])
    const [loading, setLoading] = useState(true);
    const [alertsEnabled, setAlertsEnabled] = useState(true);

    useEffect(() => {
        loadAlertPreference();
        fetchAlerts();
    }, []);

    const loadAlertPreference = async () => {
        try {
            const saved = await AsyncStorage.getItem('@biodash_alerts_enabled');
            if (saved !== null) setAlertsEnabled(JSON.parse(saved));
        } catch (e) { console.log(e); }
    };

    const toggleAlerts = async () => {
        try {
            const newValue = !alertsEnabled;
            setAlertsEnabled(newValue);
            await AsyncStorage.setItem('@biodash_alerts_enabled', JSON.stringify(newValue));
        } catch (e) { console.log(e); }
    };

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data, error } = await supabase
                    .from('sensor_alerts')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (!error && data && data.length > 0) {
                    const mapped = data.map(item => ({
                        id: item.id,
                        type: item.alert_level === 'critico' ? 'error' : item.alert_level === 'aviso' ? 'warning' : 'info',
                        message: item.message,
                        timestamp: new Date(item.created_at).toLocaleString('pt-BR')
                    }));
                    setActivities(mapped as ActivityItem[]);
                } else {
                    setActivities([]);
                }
            }
        } catch (err) {
            console.log(err);
            setActivities([]);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <MaterialCommunityIcons name="check-circle-outline" size={20} color="#16a34a" />;
            case 'warning': return <MaterialCommunityIcons name="alert-outline" size={20} color="#d97706" />;
            case 'error': return <MaterialCommunityIcons name="close-circle-outline" size={20} color="#dc2626" />;
            case 'info': return <MaterialCommunityIcons name="information-outline" size={20} color="#0284c7" />;
            default: return <MaterialCommunityIcons name="bell-outline" size={20} color={colors.primary} />;
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
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <Text style={{ fontSize: 20, color: colors.text }}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Voltar para Ajustes</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Animated.View style={animatedStyle}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Notificações e Alertas</Text>
                <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                    Acompanhe o feed de atividades recentes do seu biodigestor.
                </Text>

                <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border, marginBottom: 30, padding: 16 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ fontWeight: 'bold', color: colors.text, fontSize: 15 }}>Auto-abrir Alertas Críticos</Text>
                            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                                Expandir o painel de sensores automaticamente em caso de falha.
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={toggleAlerts}
                            style={{
                                width: 50,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: alertsEnabled ? colors.primary : '#ccc',
                                padding: 2,
                                justifyContent: 'center'
                            }}
                        >
                            <View style={{
                                width: 24,
                                height: 24,
                                borderRadius: 12,
                                backgroundColor: '#fff',
                                transform: [{ translateX: alertsEnabled ? 22 : 0 }]
                            }} />
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Histórico de Atividades</Text>

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
                                    {getIcon(item.type)}
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={[styles.message, { color: colors.text }]}>{item.message}</Text>
                                    <Text style={[styles.timestamp, { color: colors.textMuted }]}>{item.timestamp}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
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
