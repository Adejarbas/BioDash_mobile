import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    Modal,
    TextInput,
    Alert,
    RefreshControl,
    Platform
} from 'react-native';
import { useFadeInUp } from '../hooks/useFadeInUp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { alertsApi, maintenanceApi, markersApi } from '../lib/api';
import {
    getCriticalityBadgeInfo,
    getSensorDisplayInfo,
    CriticalityLevel
} from '../lib/anomalyClassifier';

const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`${title}: ${message}`);
    } else {
        Alert.alert(title, message);
    }
};

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
    const { colors } = useTheme();
    const { animatedStyle } = useFadeInUp();

    const [alerts, setAlerts] = useState<AlertOccurrence[]>([]);
    const [loading, setLoading] = useState(true);
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
    const [submittingResolve, setSubmittingResolve] = useState(false);

    const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
    const [selectedAlertForMaintenance, setSelectedAlertForMaintenance] = useState<AlertOccurrence | null>(null);
    const [maintenanceName, setMaintenanceName] = useState('');
    const [maintenancePriority, setMaintenancePriority] = useState('urgent');
    const [maintenanceDate, setMaintenanceDate] = useState('');
    const [submittingMaintenance, setSubmittingMaintenance] = useState(false);

    useEffect(() => {
        loadAlertPreference();
        loadBiodigesters();
    }, []);

    useEffect(() => {
        fetchAlerts();
    }, [selectedBiodigester, selectedLevel, selectedSensor, selectedStatus, selectedPeriod]);

    const loadBiodigesters = async () => {
        try {
            const res = await markersApi.fetch();
            if (res.success && Array.isArray(res.data)) {
                const list = res.data.map((m: any) => ({
                    id: (m.id || m._id)?.toString(),
                    name: m.title || m.address?.title || m.name || `Biodigestor #${m.id || m._id}`
                }));
                setBiodigestersList(list);
            }
        } catch (e) {
            console.error('Erro ao buscar lista de biodigestores:', e);
        }
    };

    // Lista unificada de biodigestores (cadastrados no mapa + presentes no histórico)
    const availableBiodigesters = React.useMemo(() => {
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

    const loadAlertPreference = async () => {
        try {
            const saved = await AsyncStorage.getItem('@biodash_alerts_enabled');
            if (saved !== null) setAlertsEnabled(JSON.parse(saved));
        } catch (e) {
            console.log(e);
        }
    };

    const toggleAlerts = async () => {
        try {
            const newValue = !alertsEnabled;
            setAlertsEnabled(newValue);
            await AsyncStorage.setItem('@biodash_alerts_enabled', JSON.stringify(newValue));
        } catch (e) {
            console.log(e);
        }
    };

    const fetchAlerts = async () => {
        setLoading(true);
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
                // Suporta tanto array direto quanto { alerts, pagination }
                const rawList = Array.isArray(res.data) ? res.data : (res.data.alerts || []);
                setAlerts(rawList as AlertOccurrence[]);
            } else {
                setAlerts([]);
            }
        } catch (err) {
            console.error('Erro ao buscar histórico de alertas:', err);
            setAlerts([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchAlerts();
    };

    // Resolução de Ocorrência
    const handleOpenResolve = (alertItem: AlertOccurrence) => {
        setSelectedAlertForResolve(alertItem);
        setResolutionNotes('');
        setResolveModalVisible(true);
    };

    const handleConfirmResolve = async () => {
        if (!selectedAlertForResolve) return;
        setSubmittingResolve(true);
        const alertId = selectedAlertForResolve.id;
        const notes = resolutionNotes.trim();

        try {
            const res = await alertsApi.resolve(alertId, notes || undefined);
            if (res.success) {
                // Atualização otimista imediata na lista visual com a nota técnica
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
                // Conclui e fecha o modal diretamente sem disparar popup/alert
                setResolveModalVisible(false);
                fetchAlerts();
            } else {
                console.warn('Falha ao resolver alerta:', res.error);
            }
        } catch (err: any) {
            console.error('Erro ao resolver alerta:', err);
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
        
        // Data sugerida: hoje + 1 dia se urgente, + 3 dias se alta
        const sugDate = new Date();
        sugDate.setDate(sugDate.getDate() + (isCrit ? 1 : 3));
        const dd = String(sugDate.getDate()).padStart(2, '0');
        const mm = String(sugDate.getMonth() + 1).padStart(2, '0');
        const yyyy = sugDate.getFullYear();
        setMaintenanceDate(`${dd}/${mm}/${yyyy}`);
        
        setMaintenanceModalVisible(true);
    };

    const handleConfirmMaintenance = async () => {
        if (!selectedAlertForMaintenance || !maintenanceName.trim() || !maintenanceDate.trim()) {
            showAlert('Aviso', 'Preencha todos os campos do agendamento.');
            return;
        }

        let scheduledIso = '';
        try {
            const parts = maintenanceDate.split('/');
            if (parts.length === 3) {
                scheduledIso = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T09:00:00`).toISOString();
            } else {
                throw new Error('Data inválida');
            }
        } catch {
            showAlert('Erro', 'Formato de data inválido. Use DD/MM/AAAA.');
            return;
        }

        setSubmittingMaintenance(true);
        try {
            const res = await maintenanceApi.createSchedule({
                name: maintenanceName.trim(),
                priority: maintenancePriority,
                scheduledDate: scheduledIso,
            });

            if (res.success) {
                showAlert('Sucesso', 'Manutenção priorizada e agendada com sucesso!');
                setMaintenanceModalVisible(false);
            } else {
                showAlert('Erro', res.error || 'Não foi possível agendar.');
            }
        } catch (err: any) {
            showAlert('Erro', err.message || 'Erro ao agendar manutenção.');
        } finally {
            setSubmittingMaintenance(false);
        }
    };

    // Filtro reativo no cliente para resposta instantânea ao trocar o biodigestor
    const displayedAlerts = React.useMemo(() => {
        if (selectedBiodigester === 'all') return alerts;
        return alerts.filter((a) => {
            if (a.biodigester_id && String(a.biodigester_id) === selectedBiodigester) return true;
            if (a.biodigester_name && (a.biodigester_name.toLowerCase().includes(selectedBiodigester.toLowerCase()) || selectedBiodigester.toLowerCase().includes(a.biodigester_name.toLowerCase()))) return true;
            return false;
        });
    }, [alerts, selectedBiodigester]);

    // Contadores de status
    const totalCount = displayedAlerts.length;
    const activeCriticalCount = displayedAlerts.filter(
        (a) => (a.alert_level === 'critical' || a.alert_level === 'critico') && a.status === 'active'
    ).length;
    const resolvedCount = displayedAlerts.filter((a) => a.status === 'resolved').length;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header Superior Fixo */}
            <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={[styles.backButton, { backgroundColor: colors.iconBg }]}>
                    <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Histórico de Alertas</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Ocorrências e análise de sensores</Text>
                </View>
                <TouchableOpacity
                    onPress={fetchAlerts}
                    style={[styles.backButton, { backgroundColor: colors.iconBg }]}
                    disabled={loading}
                >
                    <MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            >
                <Animated.View style={animatedStyle}>
                    {/* Título e Resumo da Página */}
                    <Text style={[styles.pageTitle, { color: colors.text }]}>Registro de Ocorrências</Text>
                    <Text style={[styles.pageSub, { color: colors.textMuted }]}>
                        Histórico completo de anomalias classificadas por criticidade para apoiar a manutenção preventiva.
                    </Text>

                    {/* Cards de Métricas Rápidas */}
                    <View style={styles.kpiRow}>
                        <View style={[styles.kpiCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <Text style={[styles.kpiNumber, { color: colors.text }]}>{totalCount}</Text>
                            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Total Ocorrências</Text>
                        </View>
                        <View
                            style={[
                                styles.kpiCard,
                                {
                                    backgroundColor: activeCriticalCount > 0 ? '#fee2e2' : colors.cardBackground,
                                    borderColor: activeCriticalCount > 0 ? '#fca5a5' : colors.border,
                                },
                            ]}
                        >
                            <Text style={[styles.kpiNumber, { color: activeCriticalCount > 0 ? '#dc2626' : colors.text }]}>
                                {activeCriticalCount}
                            </Text>
                            <Text style={[styles.kpiLabel, { color: activeCriticalCount > 0 ? '#b91c1c' : colors.textMuted }]}>
                                Críticos Ativos
                            </Text>
                        </View>
                        <View style={[styles.kpiCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <Text style={[styles.kpiNumber, { color: '#16a34a' }]}>{resolvedCount}</Text>
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
                        <TouchableOpacity
                            onPress={toggleAlerts}
                            style={[
                                styles.toggleTrack,
                                { backgroundColor: alertsEnabled ? colors.primary : '#ccc' }
                            ]}
                        >
                            <View
                                style={[
                                    styles.toggleThumb,
                                    { transform: [{ translateX: alertsEnabled ? 20 : 0 }] }
                                ]}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* SEÇÃO DE FILTROS */}
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Filtros de Pesquisa</Text>

                    {/* Filtro por Biodigestor */}
                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted }]}>BIODIGESTOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {availableBiodigesters.map((b) => {
                            const isSelected = selectedBiodigester === b.id;
                            return (
                                <TouchableOpacity
                                    key={b.id}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedBiodigester(b.id)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <MaterialCommunityIcons
                                            name="factory"
                                            size={14}
                                            color={isSelected ? '#fff' : colors.primary}
                                        />
                                        <Text
                                            style={[
                                                styles.filterChipText,
                                                { color: colors.text },
                                                isSelected && { color: '#fff', fontWeight: 'bold' },
                                            ]}
                                        >
                                            {b.name}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Filtro por Criticidade */}
                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>NÍVEL DE CRITICIDADE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Todos' },
                            { key: 'critical', label: '🚨 Crítico' },
                            { key: 'medium', label: '⚠️ Alerta Médio' },
                            { key: 'low', label: '⚡ Atenção' },
                            { key: 'info', label: 'ℹ️ Informativo' },
                        ].map((chip) => {
                            const isSelected = selectedLevel === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedLevel(chip.key)}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: '#fff', fontWeight: 'bold' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Filtro por Sensor */}
                    <Text style={[styles.filterGroupLabel, { color: colors.textMuted, marginTop: 12 }]}>SENSOR AFETADO</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                        {[
                            { key: 'all', label: 'Todos os Sensores' },
                            { key: 'temperatura', label: '🌡️ Temperatura' },
                            { key: 'pressao', label: '⏱️ Pressão' },
                            { key: 'ph', label: '💧 pH' },
                            { key: 'h2s', label: '🧪 H2S' },
                        ].map((chip) => {
                            const isSelected = selectedSensor === chip.key;
                            return (
                                <TouchableOpacity
                                    key={chip.key}
                                    style={[
                                        styles.filterChip,
                                        { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                    ]}
                                    onPress={() => setSelectedSensor(chip.key)}
                                >
                                    <Text
                                        style={[
                                            styles.filterChipText,
                                            { color: colors.text },
                                            isSelected && { color: '#fff', fontWeight: 'bold' },
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Filtro por Status e Período */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                            {[
                                { key: 'all', label: 'Status: Todos' },
                                { key: 'active', label: 'Ativos' },
                                { key: 'resolved', label: 'Resolvidos' },
                            ].map((chip) => {
                                const isSelected = selectedStatus === chip.key;
                                return (
                                    <TouchableOpacity
                                        key={chip.key}
                                        style={[
                                            styles.filterChipSmall,
                                            { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                        onPress={() => setSelectedStatus(chip.key)}
                                    >
                                        <Text
                                            style={[
                                                styles.filterChipTextSmall,
                                                { color: colors.text },
                                                isSelected && { color: '#fff', fontWeight: 'bold' },
                                            ]}
                                        >
                                            {chip.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
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
                                            styles.filterChipSmall,
                                            { borderColor: colors.border, backgroundColor: colors.cardBackground },
                                            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                        onPress={() => setSelectedPeriod(chip.key)}
                                    >
                                        <Text
                                            style={[
                                                styles.filterChipTextSmall,
                                                { color: colors.text },
                                                isSelected && { color: '#fff', fontWeight: 'bold' },
                                            ]}
                                        >
                                            {chip.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* LISTAGEM DE HISTÓRICO */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Ocorrências Anteriores ({displayedAlerts.length})
                        </Text>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                    ) : displayedAlerts.length === 0 ? (
                        <View style={[styles.emptyContainer, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <MaterialCommunityIcons name="check-circle-outline" size={48} color="#16a34a" />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma anomalia encontrada</Text>
                            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                                O sistema está operando dentro dos parâmetros de segurança para os filtros aplicados.
                            </Text>
                        </View>
                    ) : (
                        <View style={{ gap: 14 }}>
                            {displayedAlerts.map((item) => {
                                const isResolved = item.status === 'resolved';
                                const badgeInfo = isResolved
                                    ? {
                                          label: 'Resolvido',
                                          color: '#16a34a',
                                          bgColor: '#dcfce7',
                                          borderColor: '#86efac',
                                          iconName: 'check-circle',
                                      }
                                    : getCriticalityBadgeInfo(item.alert_level);
                                const sensorInfo = getSensorDisplayInfo(item.sensor_type);
                                const isCritical = item.alert_level === 'critical' || item.alert_level === 'critico';
                                const isMedium = item.alert_level === 'medium';

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
                                                borderColor: isResolved ? '#86efac' : isCritical ? '#fca5a5' : colors.border,
                                            },
                                        ]}
                                    >
                                        {/* Header do Card com Badge e Data */}
                                        <View style={styles.cardHeaderRow}>
                                            <View
                                                style={[
                                                    styles.badge,
                                                    { backgroundColor: badgeInfo.bgColor, borderColor: badgeInfo.borderColor },
                                                ]}
                                            >
                                                <MaterialCommunityIcons
                                                    name={badgeInfo.iconName as any}
                                                    size={14}
                                                    color={badgeInfo.color}
                                                />
                                                <Text style={[styles.badgeText, { color: badgeInfo.color }]}>
                                                    {badgeInfo.label.toUpperCase()}
                                                </Text>
                                            </View>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <MaterialCommunityIcons name="clock-outline" size={13} color={colors.textMuted} />
                                                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                                                    {formattedDate}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Associação: Biodigestor e Sensor */}
                                        <View style={styles.deviceRow}>
                                            <View style={styles.deviceTag}>
                                                <MaterialCommunityIcons name="factory" size={14} color={colors.primary} />
                                                <Text style={[styles.deviceText, { color: colors.text }]}>
                                                    {item.biodigester_name || 'Biodigestor Principal'}
                                                </Text>
                                            </View>

                                            <View style={[styles.deviceTag, { backgroundColor: colors.iconBg }]}>
                                                <MaterialCommunityIcons
                                                    name={sensorInfo.icon as any}
                                                    size={14}
                                                    color={sensorInfo.color}
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
                                                    <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>VALOR REGISTRADO:</Text>
                                                    <Text style={[styles.metricValue, { color: badgeInfo.color }]}>
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
                                            <View style={styles.resolvedBox}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <MaterialCommunityIcons name="check-circle" size={14} color="#16a34a" />
                                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>
                                                        Ocorrência Resolvida
                                                    </Text>
                                                    {item.resolved_at && (
                                                        <Text style={{ fontSize: 11, color: '#15803d' }}>
                                                            em {new Date(item.resolved_at).toLocaleDateString('pt-BR')}
                                                        </Text>
                                                    )}
                                                </View>
                                                {item.resolution_notes ? (
                                                    <Text style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>
                                                        Nota técnica: {item.resolution_notes}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        )}

                                        {/* Rodapé de Ações do Alerta */}
                                        {!isResolved && (
                                            <View style={styles.cardActionsRow}>
                                                <TouchableOpacity
                                                    style={[styles.resolveBtn, { borderColor: colors.border }]}
                                                    onPress={() => handleOpenResolve(item)}
                                                >
                                                    <MaterialCommunityIcons name="check" size={16} color={colors.text} />
                                                    <Text style={[styles.actionBtnText, { color: colors.text }]}>
                                                        Resolver Ocorrência
                                                    </Text>
                                                </TouchableOpacity>

                                                {(isCritical || isMedium) && (
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.maintenanceBtn,
                                                            { backgroundColor: isCritical ? '#dc2626' : '#ea580c' },
                                                        ]}
                                                        onPress={() => handleOpenMaintenance(item)}
                                                    >
                                                        <MaterialCommunityIcons name="wrench-outline" size={15} color="#fff" />
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
                transparent={true}
                animationType="fade"
                onRequestClose={() => setResolveModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: colors.cardBackground }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Resolver Ocorrência</Text>
                            <TouchableOpacity onPress={() => setResolveModalVisible(false)}>
                                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
                            Insira notas técnicas sobre a correção aplicada para manter o histórico de rastreabilidade.
                        </Text>

                        <TextInput
                            style={[
                                styles.textInputMultiline,
                                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                            ]}
                            placeholder="Ex: Válvula de alívio checada e pressão normalizada."
                            placeholderTextColor={colors.textMuted}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            value={resolutionNotes}
                            onChangeText={setResolutionNotes}
                        />

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                style={[styles.modalSecondaryBtn, { borderColor: colors.border }]}
                                onPress={() => setResolveModalVisible(false)}
                            >
                                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalPrimaryBtn, { backgroundColor: '#16a34a' }]}
                                onPress={handleConfirmResolve}
                                disabled={submittingResolve}
                            >
                                {submittingResolve ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Concluir</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: AGENDAR MANUTENÇÃO A PARTIR DA ANOMALIA */}
            <Modal
                visible={maintenanceModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setMaintenanceModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: colors.cardBackground }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Priorizar Ação de Manutenção</Text>
                            <TouchableOpacity onPress={() => setMaintenanceModalVisible(false)}>
                                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
                            Agende uma ação corretiva imediata vinculada à criticidade detectada.
                        </Text>

                        <Text style={[styles.formLabel, { color: colors.text }]}>Título da Manutenção</Text>
                        <TextInput
                            style={[
                                styles.textInput,
                                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                            ]}
                            value={maintenanceName}
                            onChangeText={setMaintenanceName}
                        />

                        <Text style={[styles.formLabel, { color: colors.text, marginTop: 12 }]}>Prioridade Sugerida</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                            {['urgent', 'high', 'medium', 'low'].map((p) => {
                                const isSel = maintenancePriority === p;
                                const pLabels: Record<string, string> = {
                                    urgent: 'Urgente',
                                    high: 'Alta',
                                    medium: 'Média',
                                    low: 'Baixa',
                                };
                                return (
                                    <TouchableOpacity
                                        key={p}
                                        style={[
                                            styles.priorityBtn,
                                            { borderColor: colors.border },
                                            isSel && {
                                                backgroundColor: p === 'urgent' ? '#fee2e2' : p === 'high' ? '#ffedd5' : colors.primaryLight,
                                                borderColor: p === 'urgent' ? '#ef4444' : p === 'high' ? '#ea580c' : colors.primary,
                                            },
                                        ]}
                                        onPress={() => setMaintenancePriority(p)}
                                    >
                                        <Text
                                            style={[
                                                { fontSize: 12, color: colors.text },
                                                isSel && {
                                                    fontWeight: 'bold',
                                                    color: p === 'urgent' ? '#dc2626' : p === 'high' ? '#ea580c' : colors.primary,
                                                },
                                            ]}
                                        >
                                            {pLabels[p]}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={[styles.formLabel, { color: colors.text }]}>Data de Agendamento (DD/MM/AAAA)</Text>
                        <TextInput
                            style={[
                                styles.textInput,
                                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                            ]}
                            value={maintenanceDate}
                            placeholder="DD/MM/AAAA"
                            placeholderTextColor={colors.textMuted}
                            onChangeText={setMaintenanceDate}
                        />

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                            <TouchableOpacity
                                style={[styles.modalSecondaryBtn, { borderColor: colors.border }]}
                                onPress={() => setMaintenanceModalVisible(false)}
                            >
                                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                                onPress={handleConfirmMaintenance}
                                disabled={submittingMaintenance}
                            >
                                {submittingMaintenance ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirmar Agendamento</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
    backButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    scrollContent: { padding: 18, paddingBottom: 90 },
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
    kpiLabel: { fontSize: 11, textAlign: 'center', fontWeight: '500' },
    prefCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 20,
    },
    toggleTrack: {
        width: 48,
        height: 28,
        borderRadius: 14,
        padding: 3,
        justifyContent: 'center',
    },
    toggleThumb: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#fff',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    filterGroupLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    filterScroll: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 8,
    },
    filterChipText: { fontSize: 13, fontWeight: '500' },
    filterChipSmall: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        marginRight: 6,
    },
    filterChipTextSmall: { fontSize: 11, fontWeight: '500' },
    emptyContainer: {
        padding: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        marginTop: 10,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
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
    thresholdText: { fontSize: 11 },
    alertMessage: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
    resolvedBox: {
        backgroundColor: '#dcfce7',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#bbf7d0',
        marginBottom: 6,
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        paddingTop: 10,
    },
    resolveBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
    },
    maintenanceBtn: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
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
    modalTitle: { fontSize: 16, fontWeight: '700' },
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
    priorityBtn: {
        flex: 1,
        paddingVertical: 7,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalPrimaryBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalSecondaryBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
});
