import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFadeInUp } from '../hooks/useFadeInUp';
import { useTheme } from '../context/ThemeContext';
import { alertsApi, maintenanceApi, markersApi } from '../lib/api';
import {
    getCriticalityBadgeInfo,
    getSensorDisplayInfo,
} from '../lib/anomalyClassifier';
import { showAlert } from '../lib/feedback';
import { parseStrictPtBrDate } from '../lib/dashboardMetrics';

interface AlertOccurrence {
    id: string;
    user_id: string;
    biodigester_id?: string | number | null;
    biodigester_name?: string;
    sensor_id?: string;
    sensor_type: string;
    reading_value?: number | null;
    threshold_value?: number | null;
    unit?: string;
    alert_level: string;
    message: string;
    status: string;
    resolved_at?: string | null;
    resolution_notes?: string | null;
    created_at: string;
}

interface Props {
    onBack: () => void;
}

export default function NotificationsScreen({ onBack }: Props) {
    const { colors, theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { animatedStyle } = useFadeInUp();
    const isDark = theme === 'dark';

    const [alerts, setAlerts] = useState<AlertOccurrence[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [alertsEnabled, setAlertsEnabled] = useState(true);

    // Filtros
    const [selectedBiodigester, setSelectedBiodigester] = useState<string>('all');
    const [biodigestersList, setBiodigestersList] = useState<{ id: string; name: string }[]>([]);
    const [selectedLevel, setSelectedLevel] = useState<string>('all');
    const [selectedSensor, setSelectedSensor] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedPeriod, setSelectedPeriod] = useState<string>('all');

    // Modais
    const [resolveModalVisible, setResolveModalVisible] = useState(false);
    const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<AlertOccurrence | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolveError, setResolveError] = useState<string | null>(null);
    const [submittingResolve, setSubmittingResolve] = useState(false);

    const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
    const [selectedAlertForMaintenance, setSelectedAlertForMaintenance] = useState<AlertOccurrence | null>(null);
    const [maintenanceName, setMaintenanceName] = useState('');
    const [maintenancePriority, setMaintenancePriority] = useState('urgent');
    const [maintenanceDate, setMaintenanceDate] = useState('');
    const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
    const [submittingMaintenance, setSubmittingMaintenance] = useState(false);

    const maintenanceDateRef = useRef<TextInput>(null);

    const loadAlertPreference = useCallback(async () => {
        try {
            const saved = await AsyncStorage.getItem('@biodash_alerts_enabled');
            if (saved !== null) setAlertsEnabled(JSON.parse(saved));
        } catch {
            // mantém preferência padrão
        }
    }, []);

    const loadBiodigesters = useCallback(async () => {
        try {
            const res = await markersApi.fetch();
            if (res.success && Array.isArray(res.data)) {
                const list = res.data.map((m: any) => ({
                    id: (m.id || m._id)?.toString(),
                    name: m.title || m.address?.title || m.name || `Biodigestor #${m.id || m._id}`,
                }));
                setBiodigestersList(list);
            }
        } catch {
            // lista será preenchida pelos alertas existentes quando disponível
        }
    }, []);

    const fetchAlerts = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setFetchError(null);
        try {
            const filters: any = {};
            if (selectedBiodigester !== 'all') filters.biodigesterId = selectedBiodigester;
            if (selectedLevel !== 'all') filters.level = selectedLevel;
            if (selectedSensor !== 'all') filters.sensorType = selectedSensor;
            if (selectedStatus !== 'all') filters.status = selectedStatus;

            if (selectedPeriod === '24h') {
                filters.startDate = new Date(Date.now() - 24 * 3600000).toISOString();
            } else if (selectedPeriod === '7d') {
                filters.startDate = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
            } else if (selectedPeriod === '30d') {
                filters.startDate = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
            }

            const res = await alertsApi.fetch(filters);
            if (res.success && res.data) {
                const rawList = Array.isArray(res.data) ? res.data : (res.data.alerts || []);
                setAlerts(rawList as AlertOccurrence[]);
            } else {
                setFetchError(res.error || 'Não foi possível carregar o histórico de alertas.');
            }
        } catch (err: any) {
            setFetchError(err?.message || 'Erro de conexão ao buscar histórico de alertas.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBiodigester, selectedLevel, selectedSensor, selectedStatus, selectedPeriod]);

    useEffect(() => {
        void loadAlertPreference();
        void loadBiodigesters();
    }, [loadAlertPreference, loadBiodigesters]);

    useEffect(() => {
        void fetchAlerts();
    }, [fetchAlerts]);

    const availableBiodigesters = useMemo(() => {
        const map = new Map<string, string>();
        biodigestersList.forEach((b) => {
            if (b.id && b.name) map.set(b.id, b.name);
        });

        alerts.forEach((a) => {
            if (a.biodigester_id) {
                const key = String(a.biodigester_id);
                if (!map.has(key)) {
                    map.set(key, a.biodigester_name || `Biodigestor #${a.biodigester_id}`);
                }
            } else if (a.biodigester_name) {
                if (!map.has(a.biodigester_name)) {
                    map.set(a.biodigester_name, a.biodigester_name);
                }
            }
        });

        const items: { id: string; name: string }[] = [{ id: 'all', name: 'Todos os Biodigestores' }];
        map.forEach((name, id) => {
            items.push({ id, name });
        });
        return items;
    }, [biodigestersList, alerts]);

    const toggleAlerts = async (nextValue: boolean) => {
        setAlertsEnabled(nextValue);
        try {
            await AsyncStorage.setItem('@biodash_alerts_enabled', JSON.stringify(nextValue));
        } catch {
            // ignora falha de persistência local
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        void fetchAlerts();
    };

    const hasActiveFilters =
        selectedBiodigester !== 'all' ||
        selectedLevel !== 'all' ||
        selectedSensor !== 'all' ||
        selectedStatus !== 'all' ||
        selectedPeriod !== 'all';

    const clearAllFilters = () => {
        setSelectedBiodigester('all');
        setSelectedLevel('all');
        setSelectedSensor('all');
        setSelectedStatus('all');
        setSelectedPeriod('all');
    };

    // Resolução de Ocorrência
    const handleOpenResolve = (alertItem: AlertOccurrence) => {
        setSelectedAlertForResolve(alertItem);
        setResolutionNotes('');
        setResolveError(null);
        setResolveModalVisible(true);
    };

    const handleCloseResolveModal = () => {
        if (submittingResolve) return;
        setResolveError(null);
        setResolveModalVisible(false);
    };

    const handleConfirmResolve = async () => {
        if (!selectedAlertForResolve) return;
        setSubmittingResolve(true);
        setResolveError(null);
        const alertId = selectedAlertForResolve.id;
        const notes = resolutionNotes.trim();

        try {
            const res = await alertsApi.resolve(alertId, notes || undefined);
            if (res.success) {
                setAlerts((prev) =>
                    prev.map((a) =>
                        a.id === alertId
                            ? {
                                  ...a,
                                  status: 'resolved',
                                  resolved_at: new Date().toISOString(),
                                  resolution_notes: notes || null,
                              }
                            : a
                    )
                );
                setResolveModalVisible(false);
                AccessibilityInfo.announceForAccessibility?.('Ocorrência marcada como resolvida.');
                void fetchAlerts(true);
            } else {
                setResolveError(res.error || 'Não foi possível concluir a resolução do alerta.');
            }
        } catch (err: any) {
            setResolveError(err?.message || 'Erro de conexão ao resolver o alerta.');
        } finally {
            setSubmittingResolve(false);
        }
    };

    // Agendamento Rápido de Manutenção a partir do Alerta
    const handleOpenMaintenance = (alertItem: AlertOccurrence) => {
        setSelectedAlertForMaintenance(alertItem);
        const sensorInfo = getSensorDisplayInfo(alertItem.sensor_type);
        const isCrit = alertItem.alert_level === 'critical' || alertItem.alert_level === 'critico';

        setMaintenanceName(`Inspeção Corretiva - ${sensorInfo.name} (${alertItem.biodigester_name || 'Biodigestor'})`);
        setMaintenancePriority(isCrit ? 'urgent' : 'high');

        const sugDate = new Date();
        sugDate.setDate(sugDate.getDate() + (isCrit ? 1 : 3));
        const dd = String(sugDate.getDate()).padStart(2, '0');
        const mm = String(sugDate.getMonth() + 1).padStart(2, '0');
        const yyyy = sugDate.getFullYear();
        setMaintenanceDate(`${dd}/${mm}/${yyyy}`);
        setMaintenanceError(null);
        setMaintenanceModalVisible(true);
    };

    const handleCloseMaintenanceModal = () => {
        if (submittingMaintenance) return;
        setMaintenanceError(null);
        setMaintenanceModalVisible(false);
    };

    const handleConfirmMaintenance = async () => {
        if (!selectedAlertForMaintenance || !maintenanceName.trim() || !maintenanceDate.trim()) {
            setMaintenanceError('Preencha o título e a data de agendamento.');
            return;
        }

        const scheduledIso = parseStrictPtBrDate(maintenanceDate);
        if (!scheduledIso) {
            setMaintenanceError('Data inválida. Informe uma data real no formato DD/MM/AAAA.');
            return;
        }

        setMaintenanceError(null);
        setSubmittingMaintenance(true);
        try {
            const res = await maintenanceApi.createSchedule({
                name: maintenanceName.trim(),
                priority: maintenancePriority,
                scheduledDate: scheduledIso,
            });

            if (res.success) {
                setMaintenanceModalVisible(false);
                showAlert('Sucesso', 'Manutenção priorizada e agendada com sucesso!');
            } else {
                setMaintenanceError(res.error || 'Não foi possível agendar a manutenção.');
            }
        } catch (err: any) {
            setMaintenanceError(err?.message || 'Erro ao agendar manutenção.');
        } finally {
            setSubmittingMaintenance(false);
        }
    };

    const displayedAlerts = useMemo(() => {
        if (selectedBiodigester === 'all') return alerts;
        return alerts.filter((a) => {
            if (a.biodigester_id && String(a.biodigester_id) === selectedBiodigester) return true;
            if (
                a.biodigester_name &&
                (a.biodigester_name.toLowerCase().includes(selectedBiodigester.toLowerCase()) ||
                    selectedBiodigester.toLowerCase().includes(a.biodigester_name.toLowerCase()))
            ) {
                return true;
            }
            return false;
        });
    }, [alerts, selectedBiodigester]);

    const totalCount = displayedAlerts.length;
    const activeCriticalCount = displayedAlerts.filter(
        (a) => (a.alert_level === 'critical' || a.alert_level === 'critico') && a.status === 'active'
    ).length;
    const resolvedCount = displayedAlerts.filter((a) => a.status === 'resolved').length;

    const resolvedBadgeColors = isDark
        ? { color: '#86efac', bgColor: '#052e16', borderColor: '#166534' }
        : { color: '#15803d', bgColor: '#dcfce7', borderColor: '#86efac' };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header Superior Fixo */}
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity
                    onPress={onBack}
                    style={[styles.headerIconBtn, { backgroundColor: colors.iconBg, marginRight: 10 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar para Ajustes"
                >
                    <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} importantForAccessibility="no" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]} accessibilityRole="header">
                        Histórico de Alertas
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Ocorrências e análise de sensores</Text>
                </View>
                <TouchableOpacity
                    onPress={() => void fetchAlerts()}
                    style={[styles.headerIconBtn, { backgroundColor: colors.iconBg, opacity: loading ? 0.6 : 1 }]}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={loading ? 'Atualizando histórico de alertas' : 'Atualizar histórico de alertas'}
                    accessibilityState={{ disabled: loading, busy: loading }}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <MaterialCommunityIcons name="refresh" size={20} color={colors.primary} importantForAccessibility="no" />
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 + insets.bottom }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                <Animated.View style={animatedStyle}>
                    <Text style={[styles.pageTitle, { color: colors.text }]} accessibilityRole="header">
                        Registro de Ocorrências
                    </Text>
                    <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                        Histórico completo de anomalias classificadas por criticidade para apoiar a manutenção preventiva.
                    </Text>

                    {/* Cards de Métricas Rápidas */}
                    <View style={styles.kpiRow}>
                        <View
                            accessible
                            accessibilityLabel={`${totalCount} Total de ocorrências`}
                            style={[styles.kpiCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                        >
                            <Text style={[styles.kpiNumber, { color: colors.text }]}>{totalCount}</Text>
                            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Total Ocorrências</Text>
                        </View>
                        <View
                            accessible
                            accessibilityLabel={`${activeCriticalCount} Críticos ativos`}
                            style={[
                                styles.kpiCard,
                                {
                                    backgroundColor: activeCriticalCount > 0 ? colors.dangerBg : colors.cardBackground,
                                    borderColor: activeCriticalCount > 0 ? colors.dangerBorder : colors.border,
                                },
                            ]}
                        >
                            <Text style={[styles.kpiNumber, { color: activeCriticalCount > 0 ? colors.danger : colors.text }]}>
                                {activeCriticalCount}
                            </Text>
                            <Text style={[styles.kpiLabel, { color: activeCriticalCount > 0 ? colors.danger : colors.textMuted }]}>
                                Críticos Ativos
                            </Text>
                        </View>
                        <View
                            accessible
                            accessibilityLabel={`${resolvedCount} Ocorrências resolvidas`}
                            style={[styles.kpiCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                        >
                            <Text style={[styles.kpiNumber, { color: colors.primary }]}>{resolvedCount}</Text>
                            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Resolvidos</Text>
                        </View>
                    </View>

                    {/* Card de Configuração de Notificação Automática */}
                    <View style={[styles.prefCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>
                                Expandir Alertas Críticos no Painel
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                                Abre o widget de telemetria em caso de temperatura ou sobrepressão de risco.
                            </Text>
                        </View>
                        <Switch
                            value={alertsEnabled}
                            onValueChange={(val) => void toggleAlerts(val)}
                            trackColor={{ false: '#64748b', true: colors.primary }}
                            thumbColor="#ffffff"
                            accessibilityLabel="Expandir Alertas Críticos no Painel"
                        />
                    </View>

                    {/* SEÇÃO DE FILTROS */}
                    <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
                        Filtros de Pesquisa
                    </Text>

                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted }]}>BIODIGESTOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {availableBiodigesters.map((b) => {
                            const isSelected = selectedBiodigester === b.id;
                            return (
                                <TouchableOpacity
                                    key={b.id}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedBiodigester(b.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Filtrar por biodigestor ${b.name}`}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <MaterialCommunityIcons
                                            name="factory"
                                            size={14}
                                            color={isSelected ? colors.onPrimary : colors.primary}
                                            importantForAccessibility="no"
                                        />
                                        <Text
                                            style={[
                                                styles.filterChipText,
                                                { color: colors.text },
                                                isSelected && { color: colors.onPrimary, fontWeight: '700' },
                                            ]}
                                        >
                                            {b.name}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>NÍVEL DE CRITICIDADE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Todos', spoken: 'Todos os níveis de criticidade' },
                            { key: 'critical', label: '🚨 Crítico', spoken: 'Crítico' },
                            { key: 'medium', label: '⚠️ Alerta Médio', spoken: 'Alerta Médio' },
                            { key: 'low', label: '⚡ Atenção', spoken: 'Atenção' },
                            { key: 'info', label: 'ℹ️ Informativo', spoken: 'Informativo' },
                        ].map((chip) => {
                            const isSelected = selectedLevel === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedLevel(chip.key)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Criticidade: ${chip.spoken}`}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: colors.onPrimary, fontWeight: '700' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>SENSOR AFETADO</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Todos os Sensores', spoken: 'Todos os sensores' },
                            { key: 'temperatura', label: '🌡️ Temperatura', spoken: 'Temperatura' },
                            { key: 'pressao', label: '⏱️ Pressão', spoken: 'Pressão' },
                            { key: 'ph', label: '💧 pH', spoken: 'pH' },
                            { key: 'h2s', label: '🧪 H2S', spoken: 'H2S' },
                        ].map((chip) => {
                            const isSelected = selectedSensor === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedSensor(chip.key)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Sensor: ${chip.spoken}`}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: colors.onPrimary, fontWeight: '700' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>STATUS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Todos' },
                            { key: 'active', label: 'Ativos' },
                            { key: 'resolved', label: 'Resolvidos' },
                        ].map((chip) => {
                            const isSelected = selectedStatus === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedStatus(chip.key)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Status: ${chip.label}`}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: colors.onPrimary, fontWeight: '700' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>PERÍODO</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Qualquer data' },
                            { key: '24h', label: '24h' },
                            { key: '7d', label: '7 dias' },
                            { key: '30d', label: '30 dias' },
                        ].map((chip) => {
                            const isSelected = selectedPeriod === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedPeriod(chip.key)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Período: ${chip.label}`}
                                    accessibilityState={{ selected: isSelected }}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: colors.onPrimary, fontWeight: '700' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* LISTAGEM DE HISTÓRICO */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text
                            style={{ fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 }}
                            accessibilityRole="header"
                        >
                            Ocorrências Anteriores ({displayedAlerts.length})
                        </Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingBox} accessibilityLiveRegion="polite">
                            <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Carregando histórico de alertas" />
                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10 }}>
                                Carregando histórico de alertas...
                            </Text>
                        </View>
                    ) : fetchError ? (
                        <View
                            style={[styles.emptyContainer, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="assertive"
                        >
                            <MaterialCommunityIcons name="alert-circle-outline" size={44} color={colors.danger} importantForAccessibility="no" />
                            <Text style={[styles.emptyTitle, { color: colors.danger }]}>Erro ao carregar alertas</Text>
                            <Text style={[styles.emptySub, { color: colors.text }]}>{fetchError}</Text>
                            <TouchableOpacity
                                style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                                onPress={() => void fetchAlerts()}
                                accessibilityRole="button"
                                accessibilityLabel="Tentar novamente"
                            >
                                <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>Tentar novamente</Text>
                            </TouchableOpacity>
                        </View>
                    ) : displayedAlerts.length === 0 ? (
                        <View style={[styles.emptyContainer, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.primary} importantForAccessibility="no" />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma anomalia encontrada</Text>
                            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                                {hasActiveFilters
                                    ? 'Não há ocorrências para os filtros aplicados no momento.'
                                    : 'O sistema está operando dentro dos parâmetros de segurança.'}
                            </Text>
                            {hasActiveFilters && (
                                <TouchableOpacity
                                    style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                                    onPress={clearAllFilters}
                                    accessibilityRole="button"
                                    accessibilityLabel="Limpar filtros"
                                >
                                    <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>Limpar filtros</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <View style={{ gap: 14 }}>
                            {displayedAlerts.map((item) => {
                                const isResolved = item.status === 'resolved';
                                const critBadge = getCriticalityBadgeInfo(item.alert_level, theme);
                                const sensorInfo = getSensorDisplayInfo(item.sensor_type);
                                const isCritical = item.alert_level === 'critical' || item.alert_level === 'critico';
                                const isMedium = item.alert_level === 'medium';
                                const deviceName = item.biodigester_name || 'Biodigestor Principal';

                                const formattedDate = new Date(item.created_at).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                });

                                return (
                                    <View
                                        key={item.id}
                                        style={[
                                            styles.alertCard,
                                            {
                                                backgroundColor: colors.cardBackground,
                                                borderColor: isResolved
                                                    ? resolvedBadgeColors.borderColor
                                                    : isCritical
                                                    ? colors.dangerBorder
                                                    : colors.border,
                                            },
                                        ]}
                                    >
                                        {/* Header do Card com Badge de Criticidade + Status + Data */}
                                        <View style={styles.cardHeaderRow}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                                                <View
                                                    style={[
                                                        styles.badge,
                                                        { backgroundColor: critBadge.bgColor, borderColor: critBadge.borderColor },
                                                    ]}
                                                >
                                                    <MaterialCommunityIcons
                                                        name={critBadge.iconName as any}
                                                        size={14}
                                                        color={critBadge.color}
                                                        importantForAccessibility="no"
                                                    />
                                                    <Text style={[styles.badgeText, { color: critBadge.color }]}>
                                                        {critBadge.label.toUpperCase()}
                                                    </Text>
                                                </View>

                                                {isResolved && (
                                                    <View
                                                        style={[
                                                            styles.badge,
                                                            {
                                                                backgroundColor: resolvedBadgeColors.bgColor,
                                                                borderColor: resolvedBadgeColors.borderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name="check-circle"
                                                            size={14}
                                                            color={resolvedBadgeColors.color}
                                                            importantForAccessibility="no"
                                                        />
                                                        <Text style={[styles.badgeText, { color: resolvedBadgeColors.color }]}>
                                                            RESOLVIDO
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <MaterialCommunityIcons name="clock-outline" size={13} color={colors.textMuted} importantForAccessibility="no" />
                                                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                                                    {formattedDate}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Associação: Biodigestor e Sensor */}
                                        <View style={styles.deviceRow}>
                                            <View style={styles.deviceTag}>
                                                <MaterialCommunityIcons name="factory" size={14} color={colors.primary} importantForAccessibility="no" />
                                                <Text style={[styles.deviceText, { color: colors.text }]}>
                                                    {deviceName}
                                                </Text>
                                            </View>

                                            <View style={[styles.deviceTag, { backgroundColor: colors.iconBg }]}>
                                                <MaterialCommunityIcons
                                                    name={sensorInfo.icon as any}
                                                    size={14}
                                                    color={sensorInfo.color}
                                                    importantForAccessibility="no"
                                                />
                                                <Text style={[styles.deviceText, { color: colors.text }]}>
                                                    {sensorInfo.name} ({item.sensor_id || 'SN-01'})
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Caixa de Telemetria / Métrica Registrada */}
                                        {item.reading_value !== null && item.reading_value !== undefined && (
                                            <View style={[styles.metricBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                                    <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>VALOR REGISTRADO:</Text>
                                                    <Text style={[styles.metricValue, { color: critBadge.color }]}>
                                                        {item.reading_value} {item.unit || ''}
                                                    </Text>
                                                </View>

                                                {item.threshold_value !== null && item.threshold_value !== undefined && (
                                                    <Text style={[styles.thresholdText, { color: colors.textMuted }]}>
                                                        Limite seguro: {item.threshold_value} {item.unit || ''}
                                                    </Text>
                                                )}
                                            </View>
                                        )}

                                        {/* Mensagem da Ocorrência */}
                                        <Text style={[styles.alertMessage, { color: colors.text }]}>
                                            {item.message}
                                        </Text>

                                        {/* Indicador de Resolução / Notas */}
                                        {isResolved && (
                                            <View
                                                style={[
                                                    styles.resolvedBox,
                                                    {
                                                        backgroundColor: resolvedBadgeColors.bgColor,
                                                        borderColor: resolvedBadgeColors.borderColor,
                                                    },
                                                ]}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                    <MaterialCommunityIcons name="check-circle" size={14} color={resolvedBadgeColors.color} importantForAccessibility="no" />
                                                    <Text style={{ fontSize: 12, fontWeight: '700', color: resolvedBadgeColors.color }}>
                                                        Ocorrência Resolvida
                                                    </Text>
                                                    {item.resolved_at && (
                                                        <Text style={{ fontSize: 12, color: resolvedBadgeColors.color }}>
                                                            em {new Date(item.resolved_at).toLocaleDateString('pt-BR')}
                                                        </Text>
                                                    )}
                                                </View>
                                                {item.resolution_notes ? (
                                                    <Text style={{ fontSize: 12, color: colors.text, marginTop: 3 }}>
                                                        Nota técnica: {item.resolution_notes}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        )}

                                        {/* Rodapé de Ações do Alerta */}
                                        {!isResolved && (
                                            <View style={[styles.cardActionsRow, { borderTopColor: colors.border }]}>
                                                <TouchableOpacity
                                                    style={[styles.resolveBtn, { borderColor: colors.inputBorder }]}
                                                    onPress={() => handleOpenResolve(item)}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Resolver ocorrência de ${sensorInfo.name} em ${deviceName}`}
                                                >
                                                    <MaterialCommunityIcons name="check" size={16} color={colors.text} importantForAccessibility="no" />
                                                    <Text style={[styles.actionBtnText, { color: colors.text }]}>
                                                        Resolver Ocorrência
                                                    </Text>
                                                </TouchableOpacity>

                                                {(isCritical || isMedium) && (
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.maintenanceBtn,
                                                            { backgroundColor: isCritical ? '#b91c1c' : '#c2410c' },
                                                        ]}
                                                        onPress={() => handleOpenMaintenance(item)}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Agendar manutenção para ${sensorInfo.name} em ${deviceName}`}
                                                    >
                                                        <MaterialCommunityIcons name="wrench-outline" size={15} color="#fff" importantForAccessibility="no" />
                                                        <Text style={[styles.actionBtnText, { color: '#fff', fontWeight: 'bold' }]}>
                                                            Agendar Manutenção
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </Animated.View>
            </ScrollView>

            {/* MODAL: RESOLVER OCORRÊNCIA */}
            <Modal
                visible={resolveModalVisible}
                transparent
                animationType="fade"
                onRequestClose={handleCloseResolveModal}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        accessible={false}
                        onPress={handleCloseResolveModal}
                    />
                    <View
                        accessibilityViewIsModal
                        style={[styles.modalCard, { backgroundColor: colors.cardBackground }]}
                    >
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">
                                    Resolver Ocorrência
                                </Text>
                                <TouchableOpacity
                                    style={styles.modalCloseBtn}
                                    onPress={handleCloseResolveModal}
                                    disabled={submittingResolve}
                                    accessibilityRole="button"
                                    accessibilityLabel="Fechar resolução de ocorrência"
                                >
                                    <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} importantForAccessibility="no" />
                                </TouchableOpacity>
                            </View>

                            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
                                Insira notas técnicas sobre a correção aplicada para manter o histórico de rastreabilidade.
                            </Text>

                            <Text style={[styles.formLabel, { color: colors.text }]}>Notas Técnicas (Opcional)</Text>
                            <TextInput
                                style={[
                                    styles.textInputMultiline,
                                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.inputBorder },
                                ]}
                                placeholder="Ex: Válvula de alívio checada e pressão normalizada."
                                placeholderTextColor={colors.textMuted}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                                accessibilityLabel="Notas técnicas da resolução"
                                value={resolutionNotes}
                                onChangeText={setResolutionNotes}
                            />

                            {resolveError ? (
                                <View
                                    style={[styles.inlineErrorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="assertive"
                                >
                                    <Text style={[styles.inlineErrorText, { color: colors.danger }]}>{resolveError}</Text>
                                </View>
                            ) : null}

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                                <TouchableOpacity
                                    style={[styles.modalSecondaryBtn, { borderColor: colors.inputBorder, opacity: submittingResolve ? 0.6 : 1 }]}
                                    onPress={handleCloseResolveModal}
                                    disabled={submittingResolve}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cancelar"
                                    accessibilityState={{ disabled: submittingResolve }}
                                >
                                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalPrimaryBtn, { backgroundColor: '#15803d', opacity: submittingResolve ? 0.7 : 1 }]}
                                    onPress={handleConfirmResolve}
                                    disabled={submittingResolve}
                                    accessibilityRole="button"
                                    accessibilityLabel={submittingResolve ? 'Concluindo resolução, aguarde' : 'Concluir resolução'}
                                    accessibilityState={{ disabled: submittingResolve, busy: submittingResolve }}
                                >
                                    {submittingResolve ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Concluir</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* MODAL: AGENDAR MANUTENÇÃO A PARTIR DA ANOMALIA */}
            <Modal
                visible={maintenanceModalVisible}
                transparent
                animationType="fade"
                onRequestClose={handleCloseMaintenanceModal}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        accessible={false}
                        onPress={handleCloseMaintenanceModal}
                    />
                    <View
                        accessibilityViewIsModal
                        style={[styles.modalCard, { backgroundColor: colors.cardBackground }]}
                    >
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">
                                    Priorizar Ação de Manutenção
                                </Text>
                                <TouchableOpacity
                                    style={styles.modalCloseBtn}
                                    onPress={handleCloseMaintenanceModal}
                                    disabled={submittingMaintenance}
                                    accessibilityRole="button"
                                    accessibilityLabel="Fechar agendamento de manutenção"
                                >
                                    <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} importantForAccessibility="no" />
                                </TouchableOpacity>
                            </View>

                            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
                                Agende uma ação corretiva imediata vinculada à criticidade detectada.
                            </Text>

                            <Text style={[styles.formLabel, { color: colors.text }]}>Título da Manutenção *</Text>
                            <TextInput
                                style={[
                                    styles.textInput,
                                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.inputBorder },
                                ]}
                                returnKeyType="next"
                                blurOnSubmit={false}
                                onSubmitEditing={() => maintenanceDateRef.current?.focus()}
                                accessibilityLabel="Título da manutenção obrigatório"
                                value={maintenanceName}
                                onChangeText={(t) => {
                                    setMaintenanceName(t);
                                    if (maintenanceError) setMaintenanceError(null);
                                }}
                            />

                            <Text style={[styles.formLabel, { color: colors.text, marginTop: 12 }]}>Prioridade Sugerida</Text>
                            <View
                                style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}
                                accessibilityRole="radiogroup"
                                accessibilityLabel="Prioridade sugerida"
                            >
                                {['urgent', 'high', 'medium', 'low'].map((p) => {
                                    const isSel = maintenancePriority === p;
                                    const pLabels: Record<string, string> = {
                                        urgent: 'Urgente',
                                        high: 'Alta',
                                        medium: 'Média',
                                        low: 'Baixa',
                                    };
                                    const selBg =
                                        p === 'urgent'
                                            ? colors.dangerBg
                                            : p === 'high'
                                            ? isDark
                                                ? '#431407'
                                                : '#ffedd5'
                                            : colors.primaryLight;
                                    const selBorder =
                                        p === 'urgent'
                                            ? colors.danger
                                            : p === 'high'
                                            ? isDark
                                                ? '#fdba74'
                                                : '#c2410c'
                                            : colors.primary;
                                    const selText =
                                        p === 'urgent'
                                            ? colors.danger
                                            : p === 'high'
                                            ? isDark
                                                ? '#fdba74'
                                                : '#c2410c'
                                            : isDark
                                            ? '#86efac'
                                            : '#15803d';

                                    return (
                                        <TouchableOpacity
                                            key={p}
                                            style={[
                                                styles.priorityBtn,
                                                { borderColor: colors.inputBorder },
                                                isSel && {
                                                    backgroundColor: selBg,
                                                    borderColor: selBorder,
                                                },
                                            ]}
                                            onPress={() => setMaintenancePriority(p)}
                                            accessibilityRole="radio"
                                            accessibilityLabel={`Prioridade ${pLabels[p]}`}
                                            accessibilityState={{ selected: isSel, checked: isSel }}
                                        >
                                            <Text
                                                style={[
                                                    { fontSize: 12, color: colors.text },
                                                    isSel && { fontWeight: 'bold', color: selText },
                                                ]}
                                            >
                                                {pLabels[p]}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[styles.formLabel, { color: colors.text }]}>Data de Agendamento (DD/MM/AAAA) *</Text>
                            <TextInput
                                ref={maintenanceDateRef}
                                style={[
                                    styles.textInput,
                                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.inputBorder },
                                ]}
                                value={maintenanceDate}
                                placeholder="DD/MM/AAAA"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numbers-and-punctuation"
                                maxLength={10}
                                returnKeyType="done"
                                onSubmitEditing={handleConfirmMaintenance}
                                accessibilityLabel="Data de agendamento no formato dia, mês e ano"
                                onChangeText={(t) => {
                                    setMaintenanceDate(t);
                                    if (maintenanceError) setMaintenanceError(null);
                                }}
                            />

                            {maintenanceError ? (
                                <View
                                    style={[styles.inlineErrorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="assertive"
                                >
                                    <Text style={[styles.inlineErrorText, { color: colors.danger }]}>{maintenanceError}</Text>
                                </View>
                            ) : null}

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                                <TouchableOpacity
                                    style={[styles.modalSecondaryBtn, { borderColor: colors.inputBorder, opacity: submittingMaintenance ? 0.6 : 1 }]}
                                    onPress={handleCloseMaintenanceModal}
                                    disabled={submittingMaintenance}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cancelar"
                                    accessibilityState={{ disabled: submittingMaintenance }}
                                >
                                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary, opacity: submittingMaintenance ? 0.7 : 1 }]}
                                    onPress={handleConfirmMaintenance}
                                    disabled={submittingMaintenance}
                                    accessibilityRole="button"
                                    accessibilityLabel={submittingMaintenance ? 'Confirmando agendamento, aguarde' : 'Confirmar Agendamento'}
                                    accessibilityState={{ disabled: submittingMaintenance, busy: submittingMaintenance }}
                                >
                                    {submittingMaintenance ? (
                                        <ActivityIndicator size="small" color={colors.onPrimary} />
                                    ) : (
                                        <Text style={{ color: colors.onPrimary, fontWeight: 'bold' }}>Confirmar Agendamento</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerIconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    scrollContent: { padding: 18 },
    pageTitle: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    pageSub: { fontSize: 13, lineHeight: 18, marginBottom: 18 },
    kpiRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    kpiCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
    },
    kpiNumber: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
    kpiLabel: { fontSize: 12, textAlign: 'center', fontWeight: '500' },
    prefCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    filterGroupLabel: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    filterScroll: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    filterChip: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 22,
        borderWidth: 1,
        marginRight: 8,
    },
    filterChipText: { fontSize: 13, fontWeight: '500' },
    loadingBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyContainer: {
        padding: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        marginTop: 10,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 4, textAlign: 'center' },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    retryBtn: {
        marginTop: 16,
        minHeight: 44,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    alertCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
    },
    badgeText: { fontSize: 11, fontWeight: '800' },
    dateText: { fontSize: 12 },
    deviceRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    deviceTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    deviceText: { fontSize: 12, fontWeight: '600' },
    metricBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 10,
    },
    metricValue: { fontSize: 15, fontWeight: '800' },
    thresholdText: { fontSize: 12 },
    alertMessage: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
    resolvedBox: {
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        marginBottom: 6,
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        borderTopWidth: 1,
        paddingTop: 10,
    },
    resolveBtn: {
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    maintenanceBtn: {
        flex: 1.2,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    actionBtnText: { fontSize: 12, fontWeight: '600' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '90%',
        borderRadius: 16,
        padding: 20,
        elevation: 6,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalCloseBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: -10,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
    formLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
    textInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
    },
    textInputMultiline: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        height: 100,
    },
    inlineErrorBox: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginTop: 12,
    },
    inlineErrorText: {
        fontSize: 12,
        fontWeight: '600',
    },
    priorityBtn: {
        flex: 1,
        minHeight: 44,
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalPrimaryBtn: {
        flex: 1,
        minHeight: 44,
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalSecondaryBtn: {
        flex: 1,
        minHeight: 44,
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
});
