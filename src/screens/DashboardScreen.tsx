import React, { useEffect, useState, useRef } from 'react'
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    AccessibilityInfo,
    Modal,
    TextInput,
    Animated,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    Pressable,
    useWindowDimensions,
} from 'react-native'
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ViewShot from 'react-native-view-shot'
import { authLib } from '../lib/auth'
import { markersApi, indicatorsApi, maintenanceApi, alertsApi } from '../lib/api'
import MapComponent from '../components/MapComponent'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme } from '../context/ThemeContext'
import { useFadeInUp } from '../hooks/useFadeInUp'
import { classifySensorReading, getCriticalityBadgeInfo } from '../lib/anomalyClassifier'
import { evaluateTelemetryReadings, recordTelemetryOccurrence } from '../lib/iotTelemetry'
import { showAlert, showConfirm } from '../lib/feedback'
import { selectMostRecentIndicator } from '../lib/indicators'
import {
    CardKey,
    DEFAULT_CARD_ORDER,
    IDEAL_RATIO,
    MetricData,
    colorToMetric,
    calculateChange,
    formatMetric,
    calculateHaversineDistance,
    parseMarkerAddress,
    getMarkerAddressLines,
    parseStrictScheduleDateTime,
    processExportHistory,
    processExportMetrics,
} from '../lib/dashboardMetrics'

interface DashboardData {
    energy: MetricData
    waste: MetricData
    tax: MetricData
    efficiency: MetricData
}

type ChartPoint = {
    name: string        // "Jan", "Fev", ...
    wasteProcessed: number
    energyGenerated: number
    taxDeduction: number
}

export default function DashboardScreen({ onNavigateNotifications }: { onNavigateNotifications?: () => void } = {}) {
    const { width: windowWidth } = useWindowDimensions();
    const isSmallScreen = windowWidth < 420;
    const insets = useSafeAreaInsets()
    const chartRef = useRef<ViewShot>(null)
    const telemetryRef = useRef<any>(null)
    const [isMapModalVisible, setMapModalVisible] = useState(false)
    const [markerName, setMarkerName] = useState('')
    const [markerCep, setMarkerCep] = useState('')
    const [markerAddress, setMarkerAddress] = useState('')
    const [markerNumber, setMarkerNumber] = useState('')
    const [markerComplement, setMarkerComplement] = useState('')
    const [markerEditingId, setMarkerEditingId] = useState<string | null>(null)
    const [cepLoading, setCepLoading] = useState(false)
    const [savingMarker, setSavingMarker] = useState(false)
    const [chartData, setChartData] = useState<ChartPoint[]>([])


    const [cardOrder, setCardOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)
    const [isOrderModalVisible, setOrderModalVisible] = useState(false)
    const [tempOrder, setTempOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)

    interface MarkerData { id: string; latitude: number; longitude: number; title: string; description: string; address?: any; }
    const [mapMarkers, setMapMarkers] = useState<MarkerData[]>([]);
    const [mapFocusLocation, setMapFocusLocation] = useState<{ latitude: number, longitude: number } | undefined>(undefined);

    interface MaintenanceItem { id: string; title: string; date: string; status: string; raw: any; }
    const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceItem | null>(null);
    const [activeIncident, setActiveIncident] = useState<any>(null);

    const [incidentResolveModalVisible, setIncidentResolveModalVisible] = useState(false);
    const [incidentResolveMessage, setIncidentResolveMessage] = useState('');
    const [resolvingIncident, setResolvingIncident] = useState(false);
    const [archivedModalVisible, setArchivedModalVisible] = useState(false);
    const [archivedMaintenances, setArchivedMaintenances] = useState<MaintenanceItem[]>([]);
    const [archivedLoading, setArchivedLoading] = useState(false);

    const handleResolveIncident = async () => {
        if (!incidentResolveMessage.trim()) {
            showAlert("Erro", "Por favor, digite uma mensagem.");
            return;
        }
        setResolvingIncident(true);
        try {
            const res = await maintenanceApi.resolveIncident(incidentResolveMessage.trim());
            if (!res.success) throw new Error(res.error);

            showAlert("Sucesso", "Alerta resolvido com sucesso!");
            setIncidentResolveModalVisible(false);
            setIncidentResolveMessage('');
            loadDashboardData();
        } catch (err: any) {
            showAlert("Erro", "Não foi possível resolver o alerta: " + err.message);
        } finally {
            setResolvingIncident(false);
        }
    }

    const handleArchiveMaintenance = async (id: string) => {
        try {
            const res = await maintenanceApi.updateSchedule(id, 'cancelled');
            if (!res.success) throw new Error(res.error);

            showAlert("Sucesso", "Manutenção arquivada com sucesso!");
            setActionModalVisible(false);
            loadDashboardData();
        } catch (err: any) {
            showAlert("Erro", "Não foi possível arquivar: " + err.message);
        }
    }

    const fetchArchivedMaintenances = async () => {
        setArchivedLoading(true);
        try {
            const res = await maintenanceApi.fetchSchedules();
            if (!res.success) throw new Error(res.error);

            if (res.data) {
                const trintaDiasAtras = new Date();
                trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

                const archived = res.data.filter((m: any) =>
                    m.status === 'cancelled' &&
                    new Date(m.created_at || m.scheduled_date) >= trintaDiasAtras
                );

                const ptMap: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
                setArchivedMaintenances(archived.map((m: any) => ({
                    id: m.id,
                    title: `[${ptMap[m.priority] || m.priority.split(' - ')[0]}] ${m.name}`,
                    date: new Date(m.scheduled_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
                    status: m.status,
                    raw: m
                })));
            }
        } catch (err) {
            console.error("Erro ao buscar arquivadas", err);
            showAlert("Erro", "Não foi possível carregar as manutenções arquivadas.");
        } finally {
            setArchivedLoading(false);
        }
    }

    const handleMarkAsDone = async (id: string) => {
        try {
            const res = await maintenanceApi.updateSchedule(id, 'completed');
            if (!res.success) throw new Error(res.error);
            showAlert("Sucesso", "Manutenção concluída!");
            loadDashboardData();
        } catch (err: any) {
            showAlert("Erro", "Não foi possível atualizar: " + err.message);
            console.error(err);
        }
    }

    const handleDelete = async (id: string) => {
        showConfirm(
            "Confirmar",
            "Tem certeza que deseja apagar essa manutenção?",
            async () => {
                try {
                    const res = await maintenanceApi.deleteSchedule(id);
                    if (!res.success) throw new Error(res.error);
                    showAlert("Sucesso", "Manutenção apagada com sucesso!");
                    loadDashboardData();
                } catch (err: any) {
                    showAlert("Erro", "Não foi possível apagar: " + err.message);
                    console.error(err);
                }
            },
            "Apagar",
            true
        );
    }

        const fetchMapMarkers = async (focusId?: string) => {
        try {
            const res = await markersApi.fetch()
            if (!res.success || !res.data) return

            const ms: MarkerData[] = res.data.map((row: any) => ({
                id: (row._id || row.id)?.toString(),
                latitude: row.latitude,
                longitude: row.longitude,
                title: row.title,
                description: row.description,
                address: row.address
            }))

            setMapMarkers(ms)
            if (focusId) {
                const focused = ms.find(m => m.id === focusId)
                if (focused) {
                    setMapFocusLocation({ latitude: focused.latitude, longitude: focused.longitude });
                }
            }
        } catch (e) {
            console.error("Erro ao buscar marcadores:", e)
        }
    }

    const handleMarkerDragEnd = async (id: string, coord: { latitude: number, longitude: number }) => {
        const m = mapMarkers.find(x => x.id === id);
        if (!m) return;

        // Feedback imediato na UI de que a descrição/endereço está sendo atualizada
        setMapMarkers(prev => prev.map(x => x.id === id ? { 
            ...x, 
            latitude: coord.latitude, 
            longitude: coord.longitude,
            description: "📍 Atualizando endereço..." 
        } : x));

        try {
            const user = await authLib.getUser();
            if (!user) return;

            let newDescription = m.description;
            let newAddress = m.address || {};

            // Realiza reverse geocoding para atualizar o endereço arrastado
            try {
                const headers = { 'User-Agent': 'BioDashMobileApp/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' };
                const resGeo = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coord.latitude}&lon=${coord.longitude}`, { headers });
                const geoData = await resGeo.json();

                if (geoData && geoData.address) {
                    const addr = geoData.address;
                    const logradouro = addr.road || addr.pedestrian || addr.suburb || newAddress.street || '';
                    const cep = addr.postcode || newAddress.cep || '';
                    const numero = addr.house_number || '';
                    const cidade = addr.city || addr.town || addr.village || '';
                    
                    const addressFull = `${logradouro}${numero ? ', ' + numero : ''}${cidade ? ' - ' + cidade : ''}, ${cep}, Brasil`.replace(/^,\s*/, '');
                    
                    newDescription = addressFull;
                    newAddress = {
                        cep: cep,
                        street: logradouro,
                        number: numero,
                        complement: newAddress.complement || ''
                    };
                } else {
                     newDescription = "Endereço não identificado pelo mapa";
                }
            } catch (geoError) {
                console.error("Erro na geocodificação reversa ao arrastar:", geoError);
                newDescription = "Erro ao carregar logradouro";
            }

            const updateData = {
                id,
                userId: user.id,
                title: m.title,
                description: newDescription,
                latitude: coord.latitude,
                longitude: coord.longitude,
                address: newAddress
            };

            const res = await markersApi.save(updateData);
            if (res.success) {
                setMapMarkers(prev => prev.map(x => x.id === id ? { 
                    ...x, 
                    title: m.title,
                    description: newDescription,
                    address: newAddress,
                    latitude: coord.latitude, 
                    longitude: coord.longitude 
                } : x));
            } else {
                // Reverter caso o salvamento falhe
                setMapMarkers(prev => prev.map(x => x.id === id ? { ...x, description: m.description, latitude: m.latitude, longitude: m.longitude } : x));
                showAlert("Erro", "Não foi possível salvar a nova posição.");
            }
        } catch (e) {
            console.error("Erro ao arrastar marcador:", e);
            // Reverter caso haja falha severa na rede/supabase
            setMapMarkers(prev => prev.map(x => x.id === id ? { ...x, description: m.description, latitude: m.latitude, longitude: m.longitude } : x));
        }
    };

    const handleDeleteMarker = (id: string, name: string) => {
        showConfirm(
            "Excluir Marcador",
            `Deseja remover "${name}"?`,
            async () => {
                const res = await markersApi.delete(id);
                if (!res.success) showAlert("Erro", "Não foi possível excluir");
                else fetchMapMarkers();
            },
            "Excluir",
            true
        );
    };

    const handleEditMarker = (m: any) => {
        setMarkerEditingId(m.id);
        const addr = m.address || {};

        setMarkerName(m.title || '');

        if (addr.street || addr.cep) {
            setMarkerCep(addr.cep || '');
            setMarkerAddress(addr.street || '');
            setMarkerNumber(addr.number || '');
            setMarkerComplement(addr.complement || '');
        } else {
            const full = m.description || '';
            setMarkerAddress(full.split(',')[0] || '');
            setMarkerCep('');
            setMarkerNumber('');
            setMarkerComplement('');
        }

        setMapModalVisible(true);
    };

    const handleFetchCep = async (cepText?: string) => {
        const currentCep = typeof cepText === 'string' ? cepText : markerCep;
        const cleanCep = currentCep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;

        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const cepData = await res.json();
            if (!cepData.erro) {
                const streetPart = [cepData.logradouro, cepData.bairro].filter(Boolean).join(', ');
                const cityPart = [cepData.localidade, cepData.uf].filter(Boolean).join('/');
                setMarkerAddress([streetPart, cityPart].filter(Boolean).join(' - '));
            } else {
                showAlert("Aviso", "O CEP informado não foi encontrado.");
            }
        } catch {
            showAlert("Erro", "Falha de conexão ao consultar viaCEP.");
        } finally {
            setCepLoading(false);
        }
    }

    const [data, setData] = useState<DashboardData>({
        energy: { value: 0, changePercent: '0%', increasing: true, color: colorToMetric['energy'] },
        waste: { value: 0, changePercent: '0%', increasing: true, color: colorToMetric['waste'] },
        tax: { value: 0, changePercent: '0%', increasing: true, color: colorToMetric['tax'] },
        efficiency: { value: 0, changePercent: '0%', increasing: true, color: colorToMetric['efficiency'] },
    })
    const [loading, setLoading] = useState(true)
    const [dashboardError, setDashboardError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [metricsLoading, setMetricsLoading] = useState(false)
    const [savingMetrics, setSavingMetrics] = useState(false)
    const [userEmail, setUserEmail] = useState('')
    const [selectedTab, setSelectedTab] = useState<'all' | 'waste' | 'energy' | 'tax'>('all')
    const [metricsModalVisible, setMetricsModalVisible] = useState(false)
    const [manualMetrics, setManualMetrics] = useState({
        waste: '120.0',
        energy: '92.5',
        tax: '750',
        month: new Date().getMonth().toString(),
        year: new Date().getFullYear().toString()
    })
    const [monthPickerVisible, setMonthPickerVisible] = useState(false)
    const [yearPickerVisible, setYearPickerVisible] = useState(false)
    const [referenceDate, setReferenceDate] = useState<string>('')
    // Seleção manual do mês exibido nos cards. null = mês mais recente.
    const [showMonthPicker, setShowMonthPicker] = useState(false)
    const [selectedMonth, setSelectedMonth] = useState<{ month: number; year: number } | null>(null)
    const [availableMonths, setAvailableMonths] = useState<{ month: number; year: number; label: string }[]>([])
    const [selectedChartIndex, setSelectedChartIndex] = useState<number | null>(null)
    const [alertsEnabled, setAlertsEnabled] = useState(true)

    // Estados para Cálculo de Distância entre Biodigestores
    const [isDistanceModalVisible, setDistanceModalVisible] = useState(false);
    const [distanceSourceId, setDistanceSourceId] = useState<string | null>(null);
    const [distanceTargetId, setDistanceTargetId] = useState<string | null>(null);
    const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
    const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);

    const handleOpenDistanceModal = (preSelectedId?: string) => {
        setDistanceSourceId(preSelectedId || null);
        setDistanceTargetId(null);
        setSourceDropdownOpen(false);
        setTargetDropdownOpen(false);
        setDistanceModalVisible(true);
    };

    const handleSwapBiodigesters = () => {
        const temp = distanceSourceId;
        setDistanceSourceId(distanceTargetId);
        setDistanceTargetId(temp);
        setSourceDropdownOpen(false);
        setTargetDropdownOpen(false);
    };

    const selectedSourceMarker = distanceSourceId ? mapMarkers.find(m => m.id === distanceSourceId) : null;
    const selectedTargetMarker = distanceTargetId ? mapMarkers.find(m => m.id === distanceTargetId) : null;

    // Estados para Exportação
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [pendingExportType, setPendingExportType] = useState<"pdf" | "excel" | "csv" | null>(null);
    const [exportPeriodType, setExportPeriodType] = useState<"12months" | "specific">("12months");
    const [exportMonth, setExportMonth] = useState<string>(new Date().getMonth().toString());
    const [exportYear, setExportYear] = useState<string>(new Date().getFullYear().toString());
    const [exportMonthPickerVisible, setExportMonthPickerVisible] = useState(false);
    const [exportYearPickerVisible, setExportYearPickerVisible] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    // Efeito para buscar dados existentes ao mudar mês/ano no modal
    useEffect(() => {
        if (metricsModalVisible) {
            fetchMonthlyMetrics(manualMetrics.month, manualMetrics.year);
        }
    }, [manualMetrics.month, manualMetrics.year, metricsModalVisible]);

    const fetchMonthlyMetrics = async (m: string, y: string) => {
        setMetricsLoading(true);
        try {
            const monthIdx = parseInt(m);
            const yearVal = parseInt(y);
            const startDate = new Date(yearVal, monthIdx, 1);
            const endDate = new Date(yearVal, monthIdx + 1, 0, 23, 59, 59);

            const res = await indicatorsApi.fetch();
            const rows: any[] = res.data || [];
            const data = rows.find((r: any) => {
                const d = new Date(r.measured_at);
                return d >= startDate && d <= endDate;
            });

            if (data) {
                setManualMetrics(prev => ({
                    ...prev,
                    waste: data.waste_processed?.toString() || "",
                    energy: data.energy_generated?.toString() || "",
                    tax: data.tax_savings?.toString() || ""
                }));
            } else {
                setManualMetrics(prev => ({ ...prev, waste: "", energy: "", tax: "" }));
            }
        } catch {
            setManualMetrics(prev => ({ ...prev, waste: "", energy: "", tax: "" }));
        } finally {
            setMetricsLoading(false);
        }
    };

    const handleSaveManualMetrics = async () => {
        setSavingMetrics(true);
        try {
            const monthIdx = parseInt(manualMetrics.month)
            const yearVal = parseInt(manualMetrics.year)
            const parseDecimal = (raw: string) => parseFloat(raw.replace(',', '.')) || 0

            const res = await indicatorsApi.save({
                wasteProcessed: parseDecimal(manualMetrics.waste),
                energyGenerated: parseDecimal(manualMetrics.energy),
                taxSavings: parseDecimal(manualMetrics.tax),
                month: manualMetrics.month,
                year: manualMetrics.year,
            })

            if (!res.success) throw new Error(res.error)

            await AsyncStorage.setItem('@biodash_last_edited', JSON.stringify({
                month: monthIdx,
                year: yearVal
            }));

            setMetricsModalVisible(false)
            showAlert("Sucesso", `Métricas de ${months[monthIdx].label}/${yearVal} salvas!`)
            loadDashboardData()
        } catch (err) {
            console.error('Save metrics error:', err)
            showAlert("Erro", "Não foi possível salvar as métricas no sistema.")
        } finally {
            setSavingMetrics(false)
        }
    }

    const months = [
        { value: "0", label: "Janeiro" },
        { value: "1", label: "Fevereiro" },
        { value: "2", label: "Março" },
        { value: "3", label: "Abril" },
        { value: "4", label: "Maio" },
        { value: "5", label: "Junho" },
        { value: "6", label: "Julho" },
        { value: "7", label: "Agosto" },
        { value: "8", label: "Setembro" },
        { value: "9", label: "Outubro" },
        { value: "10", label: "Novembro" },
        { value: "11", label: "Dezembro" },
    ]
    const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - 2 + i).toString())
    const { colors, theme } = useTheme()
    const { animatedStyle: fadeInStyle } = useFadeInUp()

    useEffect(() => {
        loadUser()
        loadDashboardData()
        loadPreferences()
        loadCardOrder()
        const interval = setInterval(loadDashboardData, 30_000)
        return () => clearInterval(interval)
    }, [])

    // Recarrega os cards quando o usuário troca o mês no seletor.
    const isFirstMonthRender = useRef(true)
    useEffect(() => {
        if (isFirstMonthRender.current) {
            isFirstMonthRender.current = false
            return
        }
        loadDashboardData()
    }, [selectedMonth])

    const loadPreferences = async () => {
        try {
            const saved = await AsyncStorage.getItem('@biodash_alerts_enabled');
            if (saved !== null) {
                setAlertsEnabled(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Error loading preferences:', e);
        }
    }

    const loadCardOrder = async () => {
        try {
            const saved = await AsyncStorage.getItem('@biodash_card_order')
            if (saved) {
                setCardOrder(JSON.parse(saved))
            }
        } catch (e) {
            console.error('Error loading card order', e)
        }
    }

    const saveCardOrder = async (oldOrder: CardKey[], newOrder: CardKey[]) => {
        try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            await AsyncStorage.setItem('@biodash_card_order', JSON.stringify(newOrder))
            setCardOrder(newOrder)
            setOrderModalVisible(false)
            const changed = changedOrder(oldOrder, newOrder)
            if (changed) {
                showAlert("Sucesso", "Sua visão geral foi reordenada com sucesso")
            }
        } catch (e) {
            console.error('Error saving order', e)
            showAlert('Erro', 'Não foi possível salvar a ordenação.')
        }
    }

    const changedOrder = (oldOrder: CardKey[], newOrder: CardKey[]) => {
        for (let i = 0; i < oldOrder.length; i++) {
            if (oldOrder[i] !== newOrder[i]) {
                return true
            }
        }
        return false
    }

    const resetCardOrder = async () => {
        try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            await AsyncStorage.removeItem('@biodash_card_order')
            setCardOrder(DEFAULT_CARD_ORDER)
            setTempOrder(DEFAULT_CARD_ORDER)
            setOrderModalVisible(false)
            showAlert("Sucesso", "Ordenamento restaurado ao padrão")
        } catch (e) {
            console.error('Error resetting order', e)
        }
    }

    const moveCard = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return
        if (direction === 'down' && index === tempOrder.length - 1) return

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring)
        const newOrder = [...tempOrder]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        const temp = newOrder[index]
        newOrder[index] = newOrder[swapIndex]
        newOrder[swapIndex] = temp
        setTempOrder(newOrder)
        // Omit alert here to avoid interrupting the flow, or use a toast if available.
        // Alert.alert("Sucesso", "Card reordenado com sucesso")
    }

    const openOrderModal = () => {
        setTempOrder([...cardOrder])
        setOrderModalVisible(true)
    }

    const getCardTitle = (key: CardKey) => {
        switch (key) {
            case 'waste': return 'Resíduos'
            case 'energy': return 'Energia'
            case 'tax': return 'Benefícios Aplicáveis'
            case 'efficiency': return 'Eficiência'
            default: return ''
        }
    }

        const loadUser = async () => {
        const user = await authLib.getUser()
        setUserEmail(user?.email ?? 'admin@biodash.com')
    }

        const loadDashboardData = async () => {
        setDashboardError(null)
        fetchMapMarkers()
        try {
            const IDEAL_RATIO = 0.8;

            const res = await indicatorsApi.fetch();
            if (!res.success && !res.data) {
                throw new Error(res.error || 'Não foi possível carregar os indicadores.');
            }
            const allRows: any[] = res.data || [];

            const lastEditedStr = await AsyncStorage.getItem('@biodash_last_edited');
            let lastEdited = lastEditedStr ? JSON.parse(lastEditedStr) : null;

            // Lista de meses disponíveis para o seletor (ordem decrescente).
            const monthOpts = allRows
                .map((r: any) => new Date(r.measured_at))
                .filter((d: Date) => !isNaN(d.getTime()))
                .map((d: Date) => ({
                    month: d.getMonth(),
                    year: d.getFullYear(),
                    label: `${months[d.getMonth()].label} de ${d.getFullYear()}`,
                }));
            const seen = new Set<string>();
            setAvailableMonths(monthOpts.filter((o) => {
                const k = `${o.year}-${o.month}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            }));

            let current: any = undefined;
            // A escolha manual do usuário tem prioridade sobre o último mês editado.
            if (selectedMonth && allRows.length > 0) {
                current = allRows.find((r: any) => {
                    const d = new Date(r.measured_at);
                    return d.getMonth() === selectedMonth.month && d.getFullYear() === selectedMonth.year;
                });
            }
            if (!current && lastEdited && allRows.length > 0) {
                current = allRows.find((r: any) => {
                    const d = new Date(r.measured_at);
                    return d.getMonth() === lastEdited.month && d.getFullYear() === lastEdited.year;
                });
            }
            if (!current && allRows.length > 0) {
                current = selectMostRecentIndicator(allRows);
            }

            // Pega o registro anterior para comparação (o próximo na lista descendente)
                        const currentIndex = allRows.indexOf(current);
            const previous = (currentIndex !== -1) ? allRows[currentIndex + 1] : undefined;

            const curEnergy = Number(current?.energy_generated ?? 0);
            const curWaste = Number(current?.waste_processed ?? 0);
            const curTax = Number(current?.tax_savings ?? 0);

            let curEfficiency = 0;
            if (curWaste > 0) {
                curEfficiency = Math.min(((curEnergy / curWaste) / IDEAL_RATIO) * 100, 100);
            }

            const prevEnergy = Number(previous?.energy_generated ?? 0);
            const prevWaste = Number(previous?.waste_processed ?? 0);
            const prevTax = Number(previous?.tax_savings ?? 0);

            let prevEfficiency = 0;
            if (prevWaste > 0) {
                prevEfficiency = Math.min(((prevEnergy / prevWaste) / IDEAL_RATIO) * 100, 100);
            }

            setData({
                energy: formatMetric(curEnergy, prevEnergy, 'energy'),
                waste: formatMetric(curWaste, prevWaste, 'waste'),
                tax: formatMetric(curTax, prevTax, 'tax'),
                efficiency: formatMetric(curEfficiency, prevEfficiency, 'efficiency'),
            });

            if (current?.measured_at) {
                const refDate = new Date(current.measured_at);
                setReferenceDate(`${months[refDate.getMonth()].label} de ${refDate.getFullYear()}`);
            } else {
                setReferenceDate('');
            }

            // Gráfico: compilar por mês
            const since = new Date();
            since.setMonth(since.getMonth() - 12);
            const histRows = allRows.filter((r: any) => new Date(r.measured_at) >= since);

            const byMonth = new Map<string, { date: Date; w: number; e: number; t: number }>();
            const monthShort = (d: Date) =>
                new Intl.DateTimeFormat('pt-BR', { month: 'short' })
                    .format(d).replace('.', '').replace(/^\w/, (c) => c.toUpperCase());

            for (const r of histRows) {
                const d = new Date(r.measured_at ?? r.created_at);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const acc = byMonth.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), 1), w: 0, e: 0, t: 0 };
                acc.w += Number(r.waste_processed ?? 0);
                acc.e += Number(r.energy_generated ?? 0);
                acc.t += Number(r.tax_savings ?? 0);
                byMonth.set(key, acc);
            }

            const compiledChartData = Array.from(byMonth.values())
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .slice(-12)
                .map((m) => ({
                    name: monthShort(m.date),
                    wasteProcessed: Number(m.w.toFixed(2)),
                    energyGenerated: Number(m.e.toFixed(2)),
                    taxDeduction: Number(m.t.toFixed(2)),
                }));

            setChartData(compiledChartData);

            // Manutenções
            const maintRes = await maintenanceApi.fetchSchedules();
            if (maintRes.success && maintRes.data && maintRes.data.length > 0) {
                const ptMap: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
                const activeSchedules = maintRes.data.filter((m: any) => m.status !== 'cancelled');
                setMaintenances(activeSchedules.slice(0, 5).map((m: any) => {
                    const prLevel = ptMap[m.priority] || m.priority.split(' - ')[0];
                    return {
                        id: m.id,
                        title: `[${prLevel}] ${m.name}`,
                        date: new Date(m.scheduled_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
                        status: m.status,
                        raw: m
                    };
                }));
            } else {
                setMaintenances([]);
            }

            // Incidente ativo
            const incidentRes = await maintenanceApi.fetchIncident();
            if (incidentRes.success && incidentRes.data) {
                setActiveIncident(incidentRes.data);
            } else {
                setActiveIncident(null);
            }

        } catch (err: any) {
            console.error('Error loading dashboard data:', err)
            setDashboardError(err?.message || 'Não foi possível carregar os dados do painel.')
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    const onRefresh = () => {
        setRefreshing(true)
        loadDashboardData()
    }

    const getMetricsArray = () => {
        return [
            ["Resíduos Processados (kg)", data.waste.value.toFixed(2), data.waste.changePercent],
            ["Energia Gerada (kWh)", data.energy.value.toFixed(2), data.energy.changePercent],
            ["Imposto Abatido (BRL)", `R$ ${data.tax.value.toFixed(2)}`, data.tax.changePercent],
            ["Eficiência do Sistema (%)", data.efficiency.value.toFixed(2) + "%", data.efficiency.changePercent],
        ];
    };

        const fetchExportData = async () => {
        try {
            const rows = await indicatorsApi.fetch();
            let data: any[] = rows.data || [];

            if (exportPeriodType === "12months") {
                const since = new Date();
                since.setMonth(since.getMonth() - 12);
                data = data.filter((r: any) => new Date(r.measured_at) >= since);
            } else {
                const startDate = new Date(parseInt(exportYear), parseInt(exportMonth), 1);
                const endDate = new Date(parseInt(exportYear), parseInt(exportMonth) + 1, 0, 23, 59, 59);
                data = data.filter((r: any) => {
                    const d = new Date(r.measured_at);
                    return d >= startDate && d <= endDate;
                });
            }

            return data;
        } catch (err) {
            console.error("Erro ao buscar dados para exportação:", err);
            return [];
        }
    };

    // ─── Exportação Web: helper para download via Blob ───────────────────────────
    const webDownload = (content: string, fileName: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
    };

    const handleExportPDF = async () => {
        setExportLoading(true);
        try {
            const data = await fetchExportData();
            const metrics = processExportMetrics(data);
            const periodLabel = exportPeriodType === "12months"
                ? "Últimos 12 Meses"
                : `${months[parseInt(exportMonth)].label} / ${exportYear}`;

            let chartImageURI = '';
            if (chartRef.current && chartRef.current.capture) {
                try { chartImageURI = await chartRef.current.capture(); } catch { /* chart capture não disponível na web */ }
            }

            const rowsHTML = metrics.map(m => `
                <tr style="text-align: center; border-bottom: 1px solid #ddd;">
                    <td style="padding: 12px; font-weight: bold; color: #1f2937;">${m[0]}</td>
                    <td style="padding: 12px; color: #16a34a;">${m[1]}</td>
                    <td style="padding: 12px; color: #64748b;">${m[2]}</td>
                </tr>
            `).join('');

            const history = processExportHistory(data);
            const historyHTML = history.length === 0 ? '' : `
                <div class="section" style="break-before:page;page-break-before:always;padding-top:8px;">
                <h2 style="color:#1f2937;margin-bottom:8px;">Evolução Mensal dos Indicadores</h2>
                <p style="margin:0 0 16px;color:#64748b;font-size:12px;">Série histórica que permite acompanhar a tendência ao longo do período.</p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:40px;">
                    <thead><tr style="background-color:#f0fdf4;">
                        <th style="padding:12px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Mês</th>
                        <th style="padding:12px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Energia (kWh)</th>
                        <th style="padding:12px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Resíduos (kg)</th>
                        <th style="padding:12px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Benefícios (R$)</th>
                    </tr></thead>
                    <tbody>${history.map(h => `
                        <tr style="text-align:center;border-bottom:1px solid #ddd;">
                            <td style="padding:10px;font-weight:bold;color:#1f2937;">${h.mes}</td>
                            <td style="padding:10px;color:#eab308;">${h.energia}</td>
                            <td style="padding:10px;color:#16a34a;">${h.residuos}</td>
                            <td style="padding:10px;color:#3b82f6;">${h.economia}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
                </div>`;

            const html = `
            <!DOCTYPE html>
            <html>
                <head><meta charset="utf-8"><title>BioDash - Relatório</title>
                <style>
                body{font-family:Arial,sans-serif;margin:0;padding:0;color:#333;}
                /* Preserva as cores de fundo na impressão (senão o cabeçalho sai branco). */
                *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
                /* Mantém cada seção inteira na mesma página. */
                .section{break-inside:avoid;page-break-inside:avoid;}
                table{break-inside:auto;}
                tr{break-inside:avoid;page-break-inside:avoid;}
                thead{display:table-header-group;}
                h2{break-after:avoid;page-break-after:avoid;}
                @media print{.no-print{display:none}}
                </style></head>
                <body>
                    <div style="background:#16a34a;padding:36px 30px;color:#ffffff;">
                        <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:bold;">BioDash - Relatório Analítico</h1>
                        <p style="margin:10px 0 0;color:#ffffff;font-size:14px;">Período: ${periodLabel}</p>
                        <p style="margin:4px 0 0;color:#e8f5e9;font-size:12px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                    </div>
                    <div style="padding:30px;">
                        <div class="section">
                        <h2 style="color:#1f2937;margin-bottom:20px;">Resumo de Desempenho</h2>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:40px;">
                            <thead><tr style="background-color:#f0fdf4;">
                                <th style="padding:15px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Métrica</th>
                                <th style="padding:15px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Valor Total</th>
                                <th style="padding:15px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Status</th>
                            </tr></thead>
                            <tbody>${rowsHTML}</tbody>
                        </table>
                        </div>
                        ${historyHTML}
                        ${chartImageURI ? `<div class="section" style="margin-top:24px;"><h2 style="color:#1f2937;margin-bottom:12px;">Tendências do Período</h2><img src="${chartImageURI.startsWith('data:') ? chartImageURI : 'data:image/png;base64,' + chartImageURI}" style="width:100%;max-width:600px;" /></div>` : ''}
                        <p style="margin-top:60px;font-size:11px;color:#94a3b8;text-align:center;">BioDash Intelligence Systems © ${new Date().getFullYear()}</p>
                    </div>
                </body>
            </html>`;

            if (Platform.OS === 'web') {
                // Web: abre iframe oculto e dispara window.print()
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc) {
                    doc.open();
                    doc.write(html);
                    doc.close();
                    iframe.contentWindow?.focus();
                    setTimeout(() => {
                        iframe.contentWindow?.print();
                        setTimeout(() => document.body.removeChild(iframe), 2000);
                    }, 500);
                }
            } else {
                const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
                await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Compartilhar Relatório PDF' });
            }
        } catch (error: any) {
            console.error("Erro PDF:", error);
            showAlert('Erro', 'Não foi possível gerar o PDF: ' + (error.message || String(error)));
        } finally {
            setExportLoading(false);
        }
    }

    const handleExportExcel = async () => {
        setExportLoading(true);
        try {
            const data = await fetchExportData();
            const metrics = processExportMetrics(data);
            const periodLabel = exportPeriodType === "12months"
                ? "Últimos 12 Meses"
                : `${months[parseInt(exportMonth)].label} / ${exportYear}`;

            let csvContent = "\uFEFF" + `Relatorio BioDash - ${periodLabel}\n`;
            csvContent += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
            csvContent += "Metrica;Valor Total\n";
            metrics.forEach(row => {
                csvContent += `${row[0]};${row[1].replace('R$ ', '').replace('kg', '').replace('kWh', '')}\n`;
            });

            // Série histórica: uma linha por mês, para permitir análise de tendência.
            const history = processExportHistory(data);
            if (history.length > 0) {
                csvContent += `\nEvolucao Mensal dos Indicadores\n`;
                csvContent += "Mes;Energia (kWh);Residuos (kg);Beneficios (R$)\n";
                history.forEach(h => {
                    csvContent += `${h.mes};${h.energia};${h.residuos};${h.economia}\n`;
                });
            }

            const fileName = `biodash_${periodLabel.replace(/[\s\/]/g, '_')}.csv`;

            if (Platform.OS === 'web') {
                webDownload(csvContent, fileName, 'text/csv;charset=utf-8;');
            } else {
                // @ts-ignore
                const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
                const fileUri = cacheDir + fileName;
                await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
                await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar Planilha', mimeType: 'text/comma-separated-values' });
            }
        } catch (error: any) {
            console.error("Erro Excel:", error);
            showAlert('Erro', 'Não foi possível gerar a planilha: ' + (error.message || String(error)));
        } finally {
            setExportLoading(false);
        }
    }

    const handleExportCSV = async () => {
        setExportLoading(true);
        try {
            const data = await fetchExportData();
            const metrics = processExportMetrics(data);
            const periodLabel = exportPeriodType === "12months"
                ? "Últimos 12 Meses"
                : `${months[parseInt(exportMonth)].label} / ${exportYear}`;

            let csvContent = "\uFEFF" + "Metrica;Valor Total;Status\n";
            metrics.forEach(row => {
                csvContent += `${row[0]};${row[1].replace('R$ ', '').replace('kg', '').replace('kWh', '')};${row[2]}\n`;
            });

            // S\u00E9rie hist\u00F3rica: uma linha por m\u00EAs, para permitir an\u00E1lise de tend\u00EAncia.
            const history = processExportHistory(data);
            if (history.length > 0) {
                csvContent += `\nEvolucao Mensal dos Indicadores\n`;
                csvContent += "Mes;Energia (kWh);Residuos (kg);Beneficios (R$)\n";
                history.forEach(h => {
                    csvContent += `${h.mes};${h.energia};${h.residuos};${h.economia}\n`;
                });
            }

            const fileName = `biodash_raw_${periodLabel.replace(/[\s\/]/g, '_')}.csv`;

            if (Platform.OS === 'web') {
                webDownload(csvContent, fileName, 'text/csv;charset=utf-8;');
            } else {
                // @ts-ignore
                const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
                const fileUri = cacheDir + fileName;
                await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
                await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar CSV', mimeType: 'text/csv' });
            }
        } catch (error: any) {
            console.error("Erro CSV:", error);
            showAlert('Erro', 'Não foi possível gerar o CSV: ' + (error.message || String(error)));
        } finally {
            setExportLoading(false);
        }
    }

    if (loading) {
        return (
            <View
                style={[styles.loadingContainer, { backgroundColor: colors.background }]}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel="Coletando sensores"
            >
                <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Coletando sensores" />
                <Text style={[styles.loadingText, { color: colors.primary }]}>Coletando sensores...</Text>
            </View>
        )
    }

    // Filtro de Tabs pro Gráfico
    const isHighlight = (tab: string) => selectedTab === tab

    const isSingleTab = selectedTab !== 'all';
    const chartMaxEnergy = Math.max(...chartData.map(d => d.energyGenerated), 100) * 1.1;
    const chartMaxWaste = Math.max(...chartData.map(d => d.wasteProcessed), 100) * 1.1;
    const chartMaxTax = Math.max(...chartData.map(d => d.taxDeduction), 100) * 1.1;

    const currentMaxEnergy = isSingleTab && selectedTab === 'energy' ? chartMaxEnergy : 15000;
    const currentMaxWaste = isSingleTab && selectedTab === 'waste' ? chartMaxWaste : 4000;
    const currentMaxTax = isSingleTab && selectedTab === 'tax' ? chartMaxTax : 12000;

    const chartAxisLabels = (() => {
        const formatVal = (v: number) => {
            if (v === 0) return '0';
            if (v >= 1000) return (v / 1000).toFixed(1).replace('.0', '') + 'k';
            return Math.round(v).toString();
        };
        if (selectedTab === 'energy') return [1, 0.75, 0.5, 0.25, 0].map(f => formatVal(currentMaxEnergy * f));
        if (selectedTab === 'waste') return [1, 0.75, 0.5, 0.25, 0].map(f => formatVal(currentMaxWaste * f));
        if (selectedTab === 'tax') return [1, 0.75, 0.5, 0.25, 0].map(f => formatVal(currentMaxTax * f));
        return ['100%', '75%', '50%', '25%', '0%'];
    })();

    const selectedChartPoint = selectedChartIndex !== null ? chartData[selectedChartIndex] : null;
    const isDark = theme === 'dark';

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                <Animated.View style={fadeInStyle}>
                    {dashboardError ? (
                        <View
                            style={{
                                backgroundColor: colors.dangerBg,
                                borderColor: colors.dangerBorder,
                                borderWidth: 1,
                                borderRadius: 12,
                                padding: 14,
                                marginBottom: 16,
                                gap: 8,
                            }}
                            accessibilityRole="alert"
                            accessibilityLiveRegion="assertive"
                        >
                            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 14 }}>
                                Erro ao carregar dados do painel
                            </Text>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{dashboardError}</Text>
                            <TouchableOpacity
                                onPress={() => void loadDashboardData()}
                                style={{
                                    alignSelf: 'flex-start',
                                    backgroundColor: colors.primary,
                                    paddingHorizontal: 14,
                                    minHeight: 44,
                                    justifyContent: 'center',
                                    borderRadius: 8,
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Tentar carregar painel novamente"
                            >
                                <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 13 }}>
                                    Tentar novamente
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {/* Header movido pro MainTabs App.tsx, então exibimos apenas um título local */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">Dashboard</Text>
                            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Visão geral do biodigestor.</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                style={{ backgroundColor: colors.cardBackground, minWidth: 44, minHeight: 44, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}
                                onPress={openOrderModal}
                                accessibilityRole="button"
                                accessibilityLabel="Reordenar cartões do painel"
                            >
                                <MaterialCommunityIcons name="sort-variant" size={20} color={colors.text} importantForAccessibility="no" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ backgroundColor: colors.primary, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                onPress={() => setMetricsModalVisible(true)}
                                accessibilityRole="button"
                                accessibilityLabel="Atualizar métricas manualmente"
                            >
                                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.onPrimary} importantForAccessibility="no" />
                                <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: 'bold' }}>Atualizar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {referenceDate ? (
                        <TouchableOpacity
                            onPress={() => setShowMonthPicker(true)}
                            activeOpacity={0.7}
                            style={{
                                marginBottom: 12,
                                minHeight: 44,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.primary,
                                backgroundColor: colors.cardBackground,
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Dados referentes a ${referenceDate}. Toque para alterar o mês.`}
                            accessibilityState={{ expanded: showMonthPicker }}
                        >
                            <MaterialCommunityIcons name="calendar-month" size={16} color={colors.primary} importantForAccessibility="no" />
                            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>
                                Dados referentes a {referenceDate}
                            </Text>
                            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.primary} style={{ marginLeft: 4 }} importantForAccessibility="no" />
                        </TouchableOpacity>
                    ) : null}

                    <View style={styles.grid}>
                        {cardOrder.map((key) => {
                            switch (key) {
                                case 'waste':
                                    return <StatCard key="waste" title="Resíduos" value={data.waste.value.toFixed(1)} unit="kg" changePercent={data.waste.changePercent} increasing={data.waste.increasing} iconName="water-outline" color={isDark ? '#4ade80' : '#15803d'} bgColor="#dcfce7" />
                                case 'energy':
                                    return <StatCard key="energy" title="Energia" value={data.energy.value.toFixed(1)} unit="kWh" changePercent={data.energy.changePercent} increasing={data.energy.increasing} iconName="lightning-bolt" color={isDark ? '#facc15' : '#a16207'} bgColor="#fef9c3" />
                                case 'tax':
                                    return <StatCard key="tax" title="Benefícios Aplicáveis" value={`R$ ${data.tax.value.toFixed(0)}`} unit="" changePercent={data.tax.changePercent} increasing={data.tax.increasing} iconName="currency-usd" color={isDark ? '#60a5fa' : '#1d4ed8'} bgColor="#dbeafe" />
                                case 'efficiency':
                                    return <StatCard key="efficiency" title="Eficiência" value={data.efficiency.value.toFixed(1)} unit="%" changePercent={data.efficiency.changePercent} increasing={data.efficiency.increasing} iconName="leaf" color={isDark ? '#34d399' : '#047857'} bgColor="#bbf7d0" />
                                default:
                                    return null
                            }
                        })}
                    </View>

                    {/* Visão Geral (Múltiplas Métricas) */}
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]} accessibilityRole="header">
                        Visão Geral de Desempenho
                    </Text>
                    <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Comparativo de Energia, Resíduos e Benefícios Aplicáveis.</Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer} accessibilityRole="tablist">
                        <TouchableOpacity
                            style={[styles.tab, { backgroundColor: isHighlight('all') ? colors.primary : colors.iconBg }]}
                            onPress={() => setSelectedTab('all')}
                            accessibilityRole="tab"
                            accessibilityLabel="Todas Métricas"
                            accessibilityState={{ selected: isHighlight('all') }}
                        >
                            <Text style={[styles.tabText, { color: isHighlight('all') ? colors.onPrimary : colors.text }]}>Todas Métricas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, { backgroundColor: isHighlight('waste') ? colors.primary : colors.iconBg }]}
                            onPress={() => setSelectedTab('waste')}
                            accessibilityRole="tab"
                            accessibilityLabel="Resíduos"
                            accessibilityState={{ selected: isHighlight('waste') }}
                        >
                            <Text style={[styles.tabText, { color: isHighlight('waste') ? colors.onPrimary : colors.text }]}>Resíduos</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, { backgroundColor: isHighlight('energy') ? colors.primary : colors.iconBg }]}
                            onPress={() => setSelectedTab('energy')}
                            accessibilityRole="tab"
                            accessibilityLabel="Energia"
                            accessibilityState={{ selected: isHighlight('energy') }}
                        >
                            <Text style={[styles.tabText, { color: isHighlight('energy') ? colors.onPrimary : colors.text }]}>Energia</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, { backgroundColor: isHighlight('tax') ? colors.primary : colors.iconBg }]}
                            onPress={() => setSelectedTab('tax')}
                            accessibilityRole="tab"
                            accessibilityLabel="Benefícios Aplicáveis"
                            accessibilityState={{ selected: isHighlight('tax') }}
                        >
                            <Text style={[styles.tabText, { color: isHighlight('tax') ? colors.onPrimary : colors.text }]}>Benefícios Aplicáveis</Text>
                        </TouchableOpacity>
                    </ScrollView>

                    <View style={[styles.card, { backgroundColor: colors.cardBackground, marginTop: 16 }]}>
                        {selectedTab === 'all' && (
                            <View style={styles.legendRow}>
                                <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: isDark ? '#facc15' : '#ca8a04' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Energia</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: isDark ? '#4ade80' : '#15803d' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Resíduos</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: isDark ? '#60a5fa' : '#1d4ed8' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Benefícios Aplicáveis</Text></View>
                            </View>
                        )}

                        <ViewShot ref={chartRef} options={{ format: "jpg", quality: 0.9, result: 'base64' }}>
                            <View style={[styles.chartMockup, { backgroundColor: colors.cardBackground, paddingLeft: 36, position: 'relative' }]}>
                                {/* Grid Horizontal com Valores (Eixo Y) e Linhas Verticais */}
                                {chartData.length > 0 && (
                                    <View style={{ position: 'absolute', top: 0, bottom: 20, left: 4, right: 4, zIndex: 0 }} pointerEvents="none" importantForAccessibility="no-hide-descendants">
                                        <View style={{ flex: 1, justifyContent: 'space-between' }}>
                                            {chartAxisLabels.map((valStr, idx) => (
                                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <Text style={{ width: 28, fontSize: 10, color: colors.textMuted, textAlign: 'right', marginRight: 4 }} numberOfLines={1}>{valStr}</Text>
                                                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border, opacity: 0.3 }} />
                                                </View>
                                            ))}
                                        </View>
                                        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 32, right: 0, flexDirection: 'row', justifyContent: 'space-around' }}>
                                            {chartData.map((_, i) => (
                                                <View key={i} style={{ width: 1, height: '100%', backgroundColor: colors.border, opacity: 0.2 }} />
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {chartData.length === 0 ? (
                                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', height: 180 }}>
                                        <Text style={{ color: colors.textMuted }}>Nenhum dado registrado para o gráfico.</Text>
                                    </View>
                                ) : (
                                    chartData.map((point, index) => {
                                        const hEnergy = Math.min(Math.max((point.energyGenerated / currentMaxEnergy) * 100, 5), 100);
                                        const hWaste = Math.min(Math.max((point.wasteProcessed / currentMaxWaste) * 100, 5), 100);
                                        const hTax = Math.min(Math.max((point.taxDeduction / currentMaxTax) * 100, 5), 100);

                                        return (
                                            <MultiBar
                                                key={index}
                                                month={point.name}
                                                vals={[hEnergy, hWaste, hTax]}
                                                selectedTab={selectedTab}
                                                isHighlight={index === selectedChartIndex}
                                                isAnySelected={selectedChartIndex !== null}
                                                onPress={() => setSelectedChartIndex(selectedChartIndex === index ? null : index)}
                                                details={{
                                                    waste: point.wasteProcessed,
                                                    energy: point.energyGenerated,
                                                    tax: point.taxDeduction
                                                }}
                                            />
                                        );
                                    })
                                )}
                            </View>
                        </ViewShot>

                        {selectedChartPoint && (
                            <View
                                style={{
                                    marginTop: 12,
                                    padding: 10,
                                    borderRadius: 10,
                                    backgroundColor: colors.background,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                }}
                                accessibilityLiveRegion="polite"
                            >
                                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                                    {selectedChartPoint.name}:
                                </Text>
                                {(selectedTab === 'all' || selectedTab === 'energy') && (
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#facc15' : '#a16207' }}>
                                        Energia {selectedChartPoint.energyGenerated} kWh
                                    </Text>
                                )}
                                {(selectedTab === 'all' || selectedTab === 'waste') && (
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#4ade80' : '#15803d' }}>
                                        Resíduos {selectedChartPoint.wasteProcessed} kg
                                    </Text>
                                )}
                                {(selectedTab === 'all' || selectedTab === 'tax') && (
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#60a5fa' : '#1d4ed8' }}>
                                        Benefícios R$ {selectedChartPoint.taxDeduction}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Incidentes de Manutenção */}
                    {activeIncident && (
                        <View
                            style={{ backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1, padding: 16, borderRadius: 12, marginBottom: 24, flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}
                            accessibilityRole="alert"
                        >
                            <MaterialCommunityIcons name="alert-circle" size={28} color={colors.danger} style={{ marginRight: 12, marginTop: 2 }} importantForAccessibility="no" />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.danger, fontWeight: 'bold', fontSize: 15, marginBottom: 4 }} accessibilityRole="header">
                                    Incidente Operacional Detectado
                                </Text>
                                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>
                                    Foi detectado {activeIncident.notifications_sent || 'múltiplos'} alertas críticos de temperatura. Uma inspeção técnica é fortemente recomendada.
                                </Text>
                                {activeIncident.first_alert_at && (
                                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                                        Primeiro alerta: {new Date(activeIncident.first_alert_at).toLocaleString('pt-BR')}
                                    </Text>
                                )}
                                {activeIncident.last_alert_at && (
                                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                                        Último alerta: {new Date(activeIncident.last_alert_at).toLocaleString('pt-BR')}
                                    </Text>
                                )}
                                <TouchableOpacity
                                    style={{ marginTop: 12, backgroundColor: '#b91c1c', minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' }}
                                    onPress={() => setIncidentResolveModalVisible(true)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Marcar alerta como resolvido"
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Marcar alerta como resolvido</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Manutenção Agendada */}
                    <View
                        style={{
                            flexDirection: isSmallScreen ? 'column' : 'row',
                            justifyContent: 'space-between',
                            alignItems: isSmallScreen ? 'flex-start' : 'center',
                            marginTop: 8,
                            marginBottom: 12,
                        }}
                    >
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]} accessibilityRole="header">
                                Manutenções Agendadas
                            </Text>
                            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Desempenho operacional em tempo real.</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => {
                                fetchArchivedMaintenances();
                                setArchivedModalVisible(true);
                            }}
                            style={{
                                backgroundColor: colors.cardBackground,
                                minHeight: 44,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginTop: isSmallScreen ? 10 : 0,
                                width: isSmallScreen ? '100%' : undefined,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Exibir manutenções arquivadas"
                        >
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: 'bold' }} numberOfLines={1}>Exibir arquivadas</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                        {maintenances.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                                Nenhuma manutenção agendada.
                            </Text>
                        ) : (
                            maintenances.map((item, index) => (
                                <React.Fragment key={item.id}>
                                    <View style={styles.maintenanceItem}>
                                        <TouchableOpacity
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44 }}
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                setSelectedMaintenance(item);
                                                setActionModalVisible(true);
                                            }}
                                            onLongPress={() => {
                                                setSelectedMaintenance(item);
                                                setActionModalVisible(true);
                                            }}
                                            delayLongPress={250}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${item.title}, agendada para ${item.date}, status ${item.status === 'pending' ? 'Pendente' : 'Concluído'}`}
                                            accessibilityHint="Toque para abrir opções de edição, conclusão ou exclusão"
                                        >
                                            <View style={[styles.maintenanceDot, item.status === 'completed' && { backgroundColor: '#15803d' }]} importantForAccessibility="no" />
                                            <View style={{ flex: 1, marginRight: 8 }}>
                                                <Text style={[styles.maintenanceTitle, { color: colors.text }]}>{item.title}</Text>
                                                <Text style={[styles.maintenanceDate, { color: colors.textMuted }]}>{item.date}</Text>
                                            </View>
                                            <Text style={item.status === 'pending' ? styles.statusPending : [styles.statusDone, { backgroundColor: colors.primaryLight, color: colors.primaryDark }]}>
                                                {item.status === 'pending' ? 'Pendente' : 'Concluído'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
                                            onPress={() => {
                                                setSelectedMaintenance(item);
                                                setActionModalVisible(true);
                                            }}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Opções para ${item.title}`}
                                        >
                                            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.textMuted} importantForAccessibility="no" />
                                        </TouchableOpacity>
                                    </View>
                                    {index < maintenances.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                                </React.Fragment>
                            ))
                        )}
                    </View>

                    {/* Exportar Relatórios (Movido para antes do mapa) */}
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]} accessibilityRole="header">
                        Exportar Relatórios
                    </Text>
                    <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Gere métricas oficiais para análise externa.</Text>
                    <View style={[styles.gridExport, { marginBottom: 12 }]}>
                        <TouchableOpacity
                            style={[
                                styles.exportCard,
                                {
                                    borderColor: isDark ? '#991b1b' : '#fca5a5',
                                    backgroundColor: isDark ? '#450a0a' : '#fef2f2',
                                },
                            ]}
                            onPress={() => {
                                setPendingExportType("pdf");
                                setExportModalVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Gerar relatório em PDF"
                        >
                            <MaterialCommunityIcons name="file-pdf-box" size={28} color={isDark ? '#fca5a5' : '#b91c1c'} style={{ marginBottom: 8 }} importantForAccessibility="no" />
                            <Text style={[styles.exportText, { color: isDark ? '#fca5a5' : '#b91c1c' }]}>Gerar PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.exportCard,
                                {
                                    borderColor: isDark ? '#166534' : '#86efac',
                                    backgroundColor: isDark ? '#052e16' : '#f0fdf4',
                                },
                            ]}
                            onPress={() => {
                                setPendingExportType("excel");
                                setExportModalVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Gerar relatório em Excel"
                        >
                            <MaterialCommunityIcons name="file-excel-box" size={28} color={isDark ? '#86efac' : '#15803d'} style={{ marginBottom: 8 }} importantForAccessibility="no" />
                            <Text style={[styles.exportText, { color: isDark ? '#86efac' : '#15803d' }]}>Gerar Excel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.exportCard,
                                {
                                    borderColor: isDark ? '#1e40af' : '#93c5fd',
                                    backgroundColor: isDark ? '#082f49' : '#eff6ff',
                                },
                            ]}
                            onPress={() => {
                                setPendingExportType("csv");
                                setExportModalVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Gerar relatório em CSV"
                        >
                            <MaterialCommunityIcons name="file-delimited" size={28} color={isDark ? '#7dd3fc' : '#1d4ed8'} style={{ marginBottom: 8 }} importantForAccessibility="no" />
                            <Text style={[styles.exportText, { color: isDark ? '#7dd3fc' : '#1d4ed8' }]}>Gerar CSV</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Mapa (Cross-Platform) */}
                    <View
                        style={{
                            flexDirection: isSmallScreen ? 'column' : 'row',
                            justifyContent: 'space-between',
                            alignItems: isSmallScreen ? 'flex-start' : 'center',
                            marginTop: 32,
                        }}
                    >
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
                                Localização da Empresa
                            </Text>
                            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Unidade ativa do biodigestor.</Text>
                        </View>
                        <View
                            style={{
                                flexDirection: 'row',
                                gap: 8,
                                marginBottom: 16,
                                marginTop: isSmallScreen ? 10 : 0,
                                flexWrap: 'wrap',
                                justifyContent: isSmallScreen ? 'space-between' : 'flex-end',
                                width: isSmallScreen ? '100%' : undefined,
                            }}
                        >
                            <TouchableOpacity
                                style={{
                                    backgroundColor: colors.primary,
                                    minHeight: 44,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: isSmallScreen ? '48%' : undefined,
                                    justifyContent: 'center',
                                }}
                                onPress={() => handleOpenDistanceModal()}
                                accessibilityRole="button"
                                accessibilityLabel="Calcular distância entre biodigestores"
                            >
                                <MaterialCommunityIcons name="ruler" size={16} color={colors.onPrimary} importantForAccessibility="no" />
                                <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>Calcular distância</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    backgroundColor: colors.primary,
                                    minHeight: 44,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    width: isSmallScreen ? '48%' : undefined,
                                    justifyContent: 'center',
                                }}
                                onPress={() => {
                                    setMarkerEditingId(null);
                                    setMarkerName('');
                                    setMarkerCep('');
                                    setMarkerAddress('');
                                    setMarkerNumber('');
                                    setMarkerComplement('');
                                    setMapModalVisible(true);
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Adicionar marcador no mapa"
                            >
                                <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '600' }}>+ Adicionar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>

                {/* Map Add Modal */}
                <Modal
                    visible={isMapModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => {
                        if (savingMarker) return;
                        setMapModalVisible(false);
                        setMarkerEditingId(null);
                    }}
                >
                    <KeyboardAvoidingView
                        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View
                            accessibilityViewIsModal
                            style={{ backgroundColor: colors.cardBackground, width: '100%', maxWidth: 440, maxHeight: '90%', padding: 24, borderRadius: 16 }}
                        >
                            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                <View style={styles.modalHeader}>
                                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, flex: 1 }} accessibilityRole="header">
                                        {markerEditingId ? 'Editar Marcador' : 'Novo Marcador de Instalação'}
                                    </Text>
                                    <TouchableOpacity
                                        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                        onPress={() => {
                                            if (savingMarker) return;
                                            setMapModalVisible(false);
                                            setMarkerEditingId(null);
                                        }}
                                        disabled={savingMarker}
                                        accessibilityRole="button"
                                        accessibilityLabel="Fechar formulário de marcador"
                                    >
                                        <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>Busque pelo CEP ou preencha o local do equipamento.</Text>

                                <View style={{ marginBottom: 16 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Nome do Equipamento / Cliente *</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                        placeholder="Ex: Unidade Sul"
                                        placeholderTextColor={colors.textMuted}
                                        returnKeyType="next"
                                        accessibilityLabel="Nome do Equipamento ou Cliente obrigatório"
                                        value={markerName}
                                        onChangeText={setMarkerName}
                                    />
                                </View>

                                <View style={{ marginBottom: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>CEP</Text>
                                        {cepLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} accessibilityLabel="Buscando CEP" />}
                                    </View>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                        placeholder="00000-000"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        maxLength={9}
                                        returnKeyType="next"
                                        accessibilityLabel="CEP"
                                        value={markerCep}
                                        onChangeText={(text) => {
                                            const digits = text.replace(/\D/g, '').slice(0, 8);
                                            const masked = digits.replace(/(\d{5})(\d)/, '$1-$2');
                                            setMarkerCep(masked);
                                            if (digits.length === 8) {
                                                handleFetchCep(masked);
                                            }
                                        }}
                                    />
                                </View>

                                <View style={{ marginBottom: 16 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Endereço *</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14, backgroundColor: colors.background }}
                                        placeholder="Rua, Bairro..."
                                        placeholderTextColor={colors.textMuted}
                                        returnKeyType="next"
                                        accessibilityLabel="Endereço obrigatório"
                                        value={markerAddress}
                                        onChangeText={setMarkerAddress}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Nº</Text>
                                        <TextInput
                                            style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                            placeholder="123 ou S/N"
                                            placeholderTextColor={colors.textMuted}
                                            returnKeyType="next"
                                            accessibilityLabel="Número do endereço"
                                            value={markerNumber}
                                            onChangeText={setMarkerNumber}
                                        />
                                    </View>
                                    <View style={{ flex: 2 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Complemento</Text>
                                        <TextInput
                                            style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                            placeholder="Opcional (Ex: Km 42)"
                                            placeholderTextColor={colors.textMuted}
                                            returnKeyType="done"
                                            accessibilityLabel="Complemento opcional"
                                            value={markerComplement}
                                            onChangeText={setMarkerComplement}
                                        />
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => { setMapModalVisible(false); setMarkerEditingId(null); }}
                                        disabled={savingMarker}
                                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Cancelar"
                                        accessibilityState={{ disabled: savingMarker }}
                                    >
                                        <Text style={{ color: colors.textMuted, fontWeight: 'bold' }}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        disabled={savingMarker}
                                        onPress={async () => {
                                            if (!markerName.trim() || !markerAddress.trim()) {
                                                showAlert("Aviso", "Informe o nome do equipamento e o endereço antes de salvar.");
                                                return;
                                            }
                                            let lat: number | undefined, lon: number | undefined;
                                            setSavingMarker(true);
                                            try {
                                                const headers = {
                                                    'User-Agent': 'BioDashMobileApp/1.0',
                                                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                                                };

                                                const cleanAddress = markerAddress.replace(/[-/]/g, ',');
                                                const addressQuery = `${cleanAddress}, ${markerNumber || ''}, Brasil`;
                                                let geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}`, { headers });
                                                let geoData = await geoRes.json();

                                                if (geoData && geoData.length > 0) {
                                                    lat = parseFloat(geoData[0].lat);
                                                    lon = parseFloat(geoData[0].lon);
                                                } else if (markerCep) {
                                                    geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${markerCep}, Brasil`)}`, { headers });
                                                    geoData = await geoRes.json();
                                                    if (geoData && geoData.length > 0) {
                                                        lat = parseFloat(geoData[0].lat);
                                                        lon = parseFloat(geoData[0].lon);
                                                    }
                                                }

                                                const user = await authLib.getUser();
                                                if (user) {
                                                    const addressFull = `${markerAddress.trim()}${markerNumber.trim() ? ', ' + markerNumber.trim() : ''}${markerComplement.trim() ? ' - ' + markerComplement.trim() : ''}${markerCep ? ', ' + markerCep : ''}, Brasil`.replace(/'/g, "");
                                                    const addressJson = {
                                                        cep: markerCep,
                                                        street: markerAddress.trim(),
                                                        number: markerNumber.trim(),
                                                        complement: markerComplement.trim()
                                                    };

                                                    const markerPayload = {
                                                        id: markerEditingId,
                                                        userId: user.id,
                                                        title: markerName.trim(),
                                                        description: addressFull,
                                                        latitude: lat || (markerEditingId ? mapMarkers.find(x => x.id === markerEditingId)?.latitude : 0),
                                                        longitude: lon || (markerEditingId ? mapMarkers.find(x => x.id === markerEditingId)?.longitude : 0),
                                                        address: addressJson
                                                    };

                                                    const res = await markersApi.save(markerPayload);
                                                    if (res.success && res.data) {
                                                        await fetchMapMarkers((res.data._id || res.data.id)?.toString());
                                                    } else {
                                                        await fetchMapMarkers();
                                                    }

                                                    setMapModalVisible(false);
                                                    setMarkerEditingId(null);
                                                    setMarkerName(''); setMarkerCep(''); setMarkerAddress(''); setMarkerNumber(''); setMarkerComplement('');
                                                    showAlert("Sucesso", "Localização salva!");
                                                }
                                            } catch (e: any) {
                                                showAlert("Erro", "Falha ao salvar: " + e.message);
                                            } finally {
                                                setSavingMarker(false);
                                            }
                                        }}
                                        style={{ backgroundColor: colors.primary, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, opacity: savingMarker ? 0.7 : 1 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={savingMarker ? 'Salvando marcador, aguarde' : (markerEditingId ? 'Atualizar Dados' : 'Salvar no Mapa')}
                                        accessibilityState={{ disabled: savingMarker, busy: savingMarker }}
                                    >
                                        {savingMarker ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontWeight: 'bold', fontSize: 15 }}>{markerEditingId ? 'Atualizar Dados' : 'Salvar no Mapa'}</Text>}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* Distance Calculation Modal */}
                <Modal
                    visible={isDistanceModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => {
                        setDistanceModalVisible(false);
                        setDistanceSourceId(null);
                        setDistanceTargetId(null);
                    }}
                >
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                        <View accessibilityViewIsModal style={{ backgroundColor: colors.cardBackground, width: '92%', padding: 24, borderRadius: 16, maxHeight: '85%' }}>
                            <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                                <View style={styles.modalHeader}>
                                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, flex: 1 }} accessibilityRole="header">
                                        Calcular Distância entre Biodigestores
                                    </Text>
                                    <TouchableOpacity
                                        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                        onPress={() => {
                                            setDistanceModalVisible(false);
                                            setDistanceSourceId(null);
                                            setDistanceTargetId(null);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Fechar cálculo de distância"
                                    >
                                        <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>
                                    Selecione dois biodigestores cadastrados para mensurar a distância geográfica entre eles.
                                </Text>

                                {/* Select A - Origem */}
                                <View style={{ marginBottom: 16, zIndex: 100 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
                                        Biodigestor de Origem (A)
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setSourceDropdownOpen(!sourceDropdownOpen);
                                            setTargetDropdownOpen(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            paddingHorizontal: 12,
                                            paddingVertical: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Biodigestor de Origem: ${distanceSourceId ? selectedSourceMarker?.title : 'nenhum selecionado'}`}
                                        accessibilityState={{ expanded: sourceDropdownOpen }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDark ? '#4ade80' : '#15803d' }} importantForAccessibility="no" />
                                            <Text style={{ color: distanceSourceId ? colors.text : colors.textMuted }}>
                                                {distanceSourceId
                                                    ? selectedSourceMarker?.title
                                                    : "Selecione o biodigestor de origem..."}
                                            </Text>
                                        </View>
                                        <MaterialCommunityIcons
                                            name={sourceDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                            size={18}
                                            color={colors.textMuted}
                                            importantForAccessibility="no"
                                        />
                                    </TouchableOpacity>

                                    {selectedSourceMarker && (
                                        <View
                                            style={{
                                                marginTop: 8,
                                                backgroundColor: colors.background,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                paddingVertical: 8,
                                                paddingHorizontal: 10,
                                            }}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#4ade80' : '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>
                                                Endereço da origem
                                            </Text>
                                            {getMarkerAddressLines(selectedSourceMarker).map((line, index) => (
                                                <Text key={`source-address-${selectedSourceMarker.id}-${index}`} style={{ fontSize: 12, color: colors.text, marginBottom: index === getMarkerAddressLines(selectedSourceMarker).length - 1 ? 0 : 2 }}>
                                                    {line}
                                                </Text>
                                            ))}
                                        </View>
                                    )}

                                    {sourceDropdownOpen && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                backgroundColor: colors.cardBackground,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: 6,
                                                maxHeight: 180,
                                                overflow: 'scroll',
                                                zIndex: 9999,
                                                elevation: 30,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.25,
                                                shadowRadius: 8,
                                                shadowOffset: { width: 0, height: 4 }
                                            }}
                                        >
                                            <ScrollView nestedScrollEnabled={true}>
                                                {mapMarkers.length === 0 ? (
                                                    <View style={{ padding: 12 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Nenhum biodigestor cadastrado.</Text>
                                                    </View>
                                                ) : (
                                                    mapMarkers.map((m) => (
                                                        <TouchableOpacity
                                                            key={m.id}
                                                            onPress={() => {
                                                                setDistanceSourceId(m.id);
                                                                setSourceDropdownOpen(false);
                                                            }}
                                                            style={{
                                                                minHeight: 44,
                                                                justifyContent: 'center',
                                                                paddingVertical: 12,
                                                                paddingHorizontal: 16,
                                                                backgroundColor: distanceSourceId === m.id ? colors.primaryLight : 'transparent',
                                                                borderBottomWidth: 1,
                                                                borderBottomColor: colors.border,
                                                            }}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={m.title}
                                                            accessibilityState={{ selected: distanceSourceId === m.id }}
                                                        >
                                                            <Text style={{
                                                                color: distanceSourceId === m.id ? colors.primaryDark : colors.text,
                                                                fontWeight: distanceSourceId === m.id ? '700' : '400',
                                                                fontSize: 13
                                                            }}>
                                                                {m.title}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))
                                                )}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                {/* Swap Button */}
                                <View style={{ alignItems: 'center', marginVertical: 4, zIndex: 50 }}>
                                    <TouchableOpacity
                                        onPress={handleSwapBiodigesters}
                                        style={{
                                            backgroundColor: colors.background,
                                            width: 44,
                                            height: 44,
                                            borderRadius: 22,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            elevation: 2,
                                            shadowColor: '#000',
                                            shadowOpacity: 0.1,
                                            shadowRadius: 2,
                                            shadowOffset: { width: 0, height: 1 }
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Inverter biodigestor de origem e destino"
                                    >
                                        <MaterialCommunityIcons name="swap-vertical" size={20} color={colors.primary} importantForAccessibility="no" />
                                    </TouchableOpacity>
                                </View>

                                {/* Select B - Destino */}
                                <View style={{ marginBottom: 24, zIndex: 10 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
                                        Biodigestor de Destino (B)
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setTargetDropdownOpen(!targetDropdownOpen);
                                            setSourceDropdownOpen(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            paddingHorizontal: 12,
                                            paddingVertical: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Biodigestor de Destino: ${distanceTargetId ? selectedTargetMarker?.title : 'nenhum selecionado'}`}
                                        accessibilityState={{ expanded: targetDropdownOpen }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDark ? '#60a5fa' : '#1d4ed8' }} importantForAccessibility="no" />
                                            <Text style={{ color: distanceTargetId ? colors.text : colors.textMuted }}>
                                                {distanceTargetId
                                                    ? selectedTargetMarker?.title
                                                    : "Selecione o biodigestor de destino..."}
                                            </Text>
                                        </View>
                                        <MaterialCommunityIcons
                                            name={targetDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                            size={18}
                                            color={colors.textMuted}
                                            importantForAccessibility="no"
                                        />
                                    </TouchableOpacity>

                                    {selectedTargetMarker && (
                                        <View
                                            style={{
                                                marginTop: 8,
                                                backgroundColor: colors.background,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                paddingVertical: 8,
                                                paddingHorizontal: 10,
                                            }}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#60a5fa' : '#1d4ed8', textTransform: 'uppercase', marginBottom: 4 }}>
                                                Endereço do destino
                                            </Text>
                                            {getMarkerAddressLines(selectedTargetMarker).map((line, index) => (
                                                <Text key={`target-address-${selectedTargetMarker.id}-${index}`} style={{ fontSize: 12, color: colors.text, marginBottom: index === getMarkerAddressLines(selectedTargetMarker).length - 1 ? 0 : 2 }}>
                                                    {line}
                                                </Text>
                                            ))}
                                        </View>
                                    )}

                                    {targetDropdownOpen && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                backgroundColor: colors.cardBackground,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: 6,
                                                maxHeight: 180,
                                                overflow: 'scroll',
                                                zIndex: 9999,
                                                elevation: 30,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.25,
                                                shadowRadius: 8,
                                                shadowOffset: { width: 0, height: 4 }
                                            }}
                                        >
                                            <ScrollView nestedScrollEnabled={true}>
                                                {mapMarkers.length === 0 ? (
                                                    <View style={{ padding: 12 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Nenhum biodigestor cadastrado.</Text>
                                                    </View>
                                                ) : (
                                                    (() => {
                                                        const availableMarkers = mapMarkers.filter((m) => m.id !== distanceSourceId);
                                                        if (availableMarkers.length === 0) {
                                                            return (
                                                                <View style={{ padding: 12 }}>
                                                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                                                        Nenhum outro biodigestor disponível.
                                                                    </Text>
                                                                </View>
                                                            );
                                                        }
                                                        return availableMarkers.map((m) => (
                                                            <TouchableOpacity
                                                                key={m.id}
                                                                onPress={() => {
                                                                    setDistanceTargetId(m.id);
                                                                    setTargetDropdownOpen(false);
                                                                }}
                                                                style={{
                                                                    minHeight: 44,
                                                                    justifyContent: 'center',
                                                                    paddingVertical: 12,
                                                                    paddingHorizontal: 16,
                                                                    backgroundColor: distanceTargetId === m.id ? colors.primaryLight : 'transparent',
                                                                    borderBottomWidth: 1,
                                                                    borderBottomColor: colors.border,
                                                                }}
                                                                accessibilityRole="button"
                                                                accessibilityLabel={m.title}
                                                                accessibilityState={{ selected: distanceTargetId === m.id }}
                                                            >
                                                                <Text style={{
                                                                    color: distanceTargetId === m.id ? colors.primaryDark : colors.text,
                                                                    fontWeight: distanceTargetId === m.id ? '700' : '400',
                                                                    fontSize: 13
                                                                }}>
                                                                    {m.title}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ));
                                                    })()
                                                )}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                {/* Results View */}
                                {(() => {
                                    if (!distanceSourceId || !distanceTargetId) {
                                        return (
                                            <View style={{
                                                backgroundColor: colors.background,
                                                padding: 16,
                                                borderRadius: 12,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginBottom: 24,
                                                borderStyle: 'dashed'
                                            }}>
                                                <MaterialCommunityIcons name="map-marker-distance" size={32} color={colors.textMuted} style={{ marginBottom: 6 }} importantForAccessibility="no" />
                                                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
                                                    Selecione ambos os biodigestores acima para calcular.
                                                </Text>
                                            </View>
                                        );
                                    }

                                    if (distanceSourceId === distanceTargetId) {
                                        return (
                                            <View
                                                style={{
                                                    backgroundColor: isDark ? '#422006' : '#fffbeb',
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderWidth: 1,
                                                    borderColor: isDark ? '#854d0e' : '#fef3c7',
                                                    marginBottom: 24,
                                                    flexDirection: 'row',
                                                    gap: 8
                                                }}
                                                accessibilityRole="alert"
                                            >
                                                <MaterialCommunityIcons name="alert" size={20} color={isDark ? '#fde047' : '#b45309'} importantForAccessibility="no" />
                                                <Text style={{ color: isDark ? '#fde047' : '#92400e', fontSize: 13, fontWeight: '600' }}>
                                                    Aviso: Selecione dois biodigestores diferentes.
                                                </Text>
                                            </View>
                                        );
                                    }

                                    const sourceNode = mapMarkers.find(m => m.id === distanceSourceId);
                                    const targetNode = mapMarkers.find(m => m.id === distanceTargetId);

                                    if (!sourceNode || !targetNode) return null;

                                    const distanceKm = calculateHaversineDistance(
                                        sourceNode.latitude, sourceNode.longitude,
                                        targetNode.latitude, targetNode.longitude
                                    );

                                    const formattedDistance = distanceKm < 1
                                        ? `${Math.round(distanceKm * 1000)} m`
                                        : `${distanceKm.toFixed(1)} km`;

                                    return (
                                        <View style={{ marginBottom: 24 }} accessibilityLiveRegion="polite">
                                            <View style={{
                                                backgroundColor: colors.background,
                                                borderRadius: 14,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                padding: 16,
                                                elevation: 2,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.05,
                                                shadowRadius: 4,
                                                shadowOffset: { width: 0, height: 2 }
                                            }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#4ade80' : '#15803d', textTransform: 'uppercase' }}>Origem</Text>
                                                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>
                                                            {sourceNode.title}
                                                        </Text>
                                                    </View>

                                                    <View style={{ paddingHorizontal: 12, alignItems: 'center' }}>
                                                        <MaterialCommunityIcons name="ray-start-end" size={20} color={colors.primary} importantForAccessibility="no" />
                                                    </View>

                                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#60a5fa' : '#1d4ed8', textTransform: 'uppercase' }}>Destino</Text>
                                                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.text }} numberOfLines={1}>
                                                            {targetNode.title}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />

                                                <View style={{ alignItems: 'center', marginTop: 8 }}>
                                                    <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>Distância Calculada</Text>
                                                    <Text style={{ fontSize: 26, fontWeight: '900', color: colors.primary }}>
                                                        {formattedDistance}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })()}

                                {/* Actions */}
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setDistanceModalVisible(false);
                                            setDistanceSourceId(null);
                                            setDistanceTargetId(null);
                                        }}
                                        style={{
                                            minHeight: 44,
                                            justifyContent: 'center',
                                            paddingVertical: 12,
                                            paddingHorizontal: 24,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            backgroundColor: colors.background
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Fechar"
                                    >
                                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>
                                            Fechar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {/* Lista de Locais Acima do Mapa */}
                {mapMarkers.length > 0 && (
                    <View style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {mapMarkers.map((m) => (
                            <View
                                key={m.id}
                                style={{
                                    backgroundColor: colors.cardBackground,
                                    paddingLeft: 4,
                                    paddingRight: 4,
                                    paddingVertical: 2,
                                    borderRadius: 24,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    elevation: 2,
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 2
                                }}
                            >
                                <TouchableOpacity
                                    onPress={() => {
                                        setMapFocusLocation({ latitude: m.latitude, longitude: m.longitude });
                                    }}
                                    onLongPress={() => handleOpenDistanceModal(m.id)}
                                    delayLongPress={500}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        minHeight: 40,
                                        paddingLeft: 10,
                                        paddingRight: 8,
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Centralizar mapa em ${m.title}`}
                                    accessibilityHint="Mantenha pressionado para calcular distância a partir deste biodigestor"
                                >
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginRight: 8 }} importantForAccessibility="no" />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{m.title}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => handleEditMarker(m)}
                                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8', marginRight: 6 }}
                                    hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Editar ${m.title}`}
                                >
                                    <MaterialCommunityIcons name="pencil" size={16} color="#fff" importantForAccessibility="no" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => handleDeleteMarker(m.id, m.title)}
                                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b91c1c' }}
                                    hitSlop={{ top: 4, bottom: 4, left: 2, right: 4 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Excluir ${m.title}`}
                                >
                                    <MaterialCommunityIcons name="close" size={16} color="#fff" importantForAccessibility="no" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <View style={[styles.card, { padding: 0, overflow: 'hidden', height: 250, backgroundColor: colors.cardBackground, marginBottom: 10 }]}>
                    <MapComponent
                        markers={mapMarkers}
                        focusLocation={mapFocusLocation}
                        onMarkerDragEnd={handleMarkerDragEnd}
                    />
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                    Dica: Segure e arraste o marcador para ajustar a posição manual.
                </Text>

                <View style={styles.footer}>
                    <Text style={styles.footerText}></Text>
                </View>
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Modal de Atualização Manual de Métricas */}
            <Modal visible={metricsModalVisible} animationType="slide" transparent={true} onRequestClose={() => !savingMetrics && setMetricsModalVisible(false)}>
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View
                        accessibilityViewIsModal
                        style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', maxHeight: '90%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Math.max(insets.bottom, 24) }]}
                    >
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">Atualizar Métricas</Text>
                                <TouchableOpacity
                                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                    onPress={() => setMetricsModalVisible(false)}
                                    disabled={savingMetrics}
                                    accessibilityRole="button"
                                    accessibilityLabel="Fechar atualização de métricas"
                                >
                                    <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                                </TouchableOpacity>
                            </View>
                            <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>Insira os valores consolidados para o período selecionado.</Text>

                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, zIndex: 10 }}>
                                <View style={{ flex: 1, position: 'relative' }}>
                                    <Text style={[styles.label, { color: colors.text, fontSize: 12 }]}>Mês</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setMonthPickerVisible(!monthPickerVisible);
                                            setYearPickerVisible(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            paddingHorizontal: 12,
                                            paddingVertical: 10,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Mês selecionado: ${months[parseInt(manualMetrics.month)].label}`}
                                        accessibilityState={{ expanded: monthPickerVisible }}
                                    >
                                        <Text style={{ color: colors.text }}>{months[parseInt(manualMetrics.month)].label}</Text>
                                        <MaterialCommunityIcons name={monthPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>

                                    {monthPickerVisible && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                width: 260,
                                                backgroundColor: colors.cardBackground,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: 6,
                                                padding: 10,
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                zIndex: 9999,
                                                elevation: 25,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.3,
                                                shadowRadius: 10,
                                            }}
                                        >
                                            {months.map((m) => (
                                                <TouchableOpacity
                                                    key={m.value}
                                                    activeOpacity={0.7}
                                                    onPress={() => {
                                                        setManualMetrics({ ...manualMetrics, month: m.value });
                                                        setMonthPickerVisible(false);
                                                    }}
                                                    style={{
                                                        width: '33.3%',
                                                        minHeight: 44,
                                                        paddingVertical: 12,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        backgroundColor: manualMetrics.month === m.value ? colors.primary : 'transparent',
                                                        borderRadius: 8,
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={m.label}
                                                    accessibilityState={{ selected: manualMetrics.month === m.value }}
                                                >
                                                    <Text style={{
                                                        color: manualMetrics.month === m.value ? colors.onPrimary : colors.text,
                                                        fontWeight: '700',
                                                        fontSize: 12
                                                    }}>
                                                        {m.label.substring(0, 3)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={{ width: 100, position: 'relative' }}>
                                    <Text style={[styles.label, { color: colors.text, fontSize: 12 }]}>Ano</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setYearPickerVisible(!yearPickerVisible);
                                            setMonthPickerVisible(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            paddingHorizontal: 12,
                                            paddingVertical: 10,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Ano selecionado: ${manualMetrics.year}`}
                                        accessibilityState={{ expanded: yearPickerVisible }}
                                    >
                                        <Text style={{ color: colors.text }}>{manualMetrics.year}</Text>
                                        <MaterialCommunityIcons name={yearPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>

                                    {yearPickerVisible && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                right: 0,
                                                width: 180,
                                                backgroundColor: colors.cardBackground,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: 6,
                                                padding: 10,
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                justifyContent: 'center',
                                                zIndex: 9999,
                                                elevation: 25,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.3,
                                                shadowRadius: 10,
                                            }}
                                        >
                                            {years.map((y) => (
                                                <TouchableOpacity
                                                    key={y}
                                                    activeOpacity={0.7}
                                                    onPress={() => {
                                                        setManualMetrics({ ...manualMetrics, year: y });
                                                        setYearPickerVisible(false);
                                                    }}
                                                    style={{
                                                        minHeight: 44,
                                                        justifyContent: 'center',
                                                        paddingHorizontal: 14,
                                                        paddingVertical: 10,
                                                        margin: 4,
                                                        backgroundColor: manualMetrics.year === y ? colors.primary : colors.background,
                                                        borderRadius: 8,
                                                        borderWidth: 1,
                                                        borderColor: colors.inputBorder
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={y}
                                                    accessibilityState={{ selected: manualMetrics.year === y }}
                                                >
                                                    <Text style={{
                                                        color: manualMetrics.year === y ? colors.onPrimary : colors.text,
                                                        fontWeight: '700',
                                                        fontSize: 13
                                                    }}>
                                                        {y}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </View>

                            {metricsLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }} accessibilityLiveRegion="polite">
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Carregando valores do período...</Text>
                                </View>
                            ) : null}

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                <View style={[styles.formGroup, { width: '48%' }]}>
                                    <Text style={[styles.label, { color: colors.text }]}>Resíduos (kg)</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]}
                                        keyboardType="numeric"
                                        placeholder="Ex: 120.0"
                                        placeholderTextColor={colors.textMuted}
                                        accessibilityLabel="Resíduos processados em quilogramas"
                                        value={manualMetrics.waste}
                                        onChangeText={t => setManualMetrics({ ...manualMetrics, waste: t })}
                                    />
                                </View>
                                <View style={[styles.formGroup, { width: '48%' }]}>
                                    <Text style={[styles.label, { color: colors.text }]}>Energia (kWh)</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]}
                                        keyboardType="numeric"
                                        placeholder="Ex: 92.5"
                                        placeholderTextColor={colors.textMuted}
                                        accessibilityLabel="Energia gerada em quilowatt-hora"
                                        value={manualMetrics.energy}
                                        onChangeText={t => setManualMetrics({ ...manualMetrics, energy: t })}
                                    />
                                </View>
                                <View style={[styles.formGroup, { width: '100%' }]}>
                                    <Text style={[styles.label, { color: colors.text }]}>Benefícios Aplicáveis (R$)</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]}
                                        keyboardType="numeric"
                                        placeholder="Ex: 750.00"
                                        placeholderTextColor={colors.textMuted}
                                        accessibilityLabel="Benefícios aplicáveis em reais"
                                        value={manualMetrics.tax}
                                        onChangeText={t => setManualMetrics({ ...manualMetrics, tax: t })}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: colors.primary, minHeight: 48, justifyContent: 'center', opacity: savingMetrics ? 0.7 : 1 }]}
                                onPress={handleSaveManualMetrics}
                                disabled={savingMetrics}
                                accessibilityRole="button"
                                accessibilityLabel={savingMetrics ? 'Salvando dados, aguarde' : 'Salvar Dados'}
                                accessibilityState={{ disabled: savingMetrics, busy: savingMetrics }}
                            >
                                {savingMetrics ? (
                                    <ActivityIndicator size="small" color={colors.onPrimary} />
                                ) : (
                                    <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Salvar Dados</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal >

            {/* Seleção do mês exibido nos cards do dashboard */}
            <Modal
                visible={showMonthPicker}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowMonthPicker(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 16 }]}>
                    <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => setShowMonthPicker(false)} />
                    <View
                        accessibilityViewIsModal
                        style={{ backgroundColor: colors.cardBackground, width: '90%', maxWidth: 420, maxHeight: '75%', borderRadius: 16, overflow: 'hidden', alignSelf: 'center' }}
                    >
                        <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }} accessibilityRole="header">Selecionar Período</Text>
                                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>Escolha o mês exibido nos indicadores</Text>
                            </View>
                            <TouchableOpacity
                                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                onPress={() => setShowMonthPicker(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar seletor de período"
                            >
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView>
                            <TouchableOpacity
                                style={{ minHeight: 48, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}
                                onPress={() => {
                                    AsyncStorage.removeItem('@biodash_last_edited').catch(() => {});
                                    setSelectedMonth(null);
                                    setShowMonthPicker(false);
                                }}
                                accessibilityRole="radio"
                                accessibilityLabel="Mês mais recente"
                                accessibilityState={{ checked: selectedMonth === null, selected: selectedMonth === null }}
                            >
                                <MaterialCommunityIcons
                                    name={selectedMonth === null ? 'radiobox-marked' : 'radiobox-blank'}
                                    size={20}
                                    color={selectedMonth === null ? colors.primary : colors.textMuted}
                                    style={{ marginRight: 12 }}
                                    importantForAccessibility="no"
                                />
                                <Text style={{ fontSize: 15, color: selectedMonth === null ? colors.primary : colors.text, fontWeight: selectedMonth === null ? 'bold' : 'normal' }}>
                                    Mês mais recente
                                </Text>
                            </TouchableOpacity>

                            {availableMonths.map((opt) => {
                                const isSel = selectedMonth?.month === opt.month && selectedMonth?.year === opt.year;
                                return (
                                    <TouchableOpacity
                                        key={`${opt.year}-${opt.month}`}
                                        style={{ minHeight: 48, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}
                                        onPress={() => { setSelectedMonth({ month: opt.month, year: opt.year }); setShowMonthPicker(false); }}
                                        accessibilityRole="radio"
                                        accessibilityLabel={opt.label}
                                        accessibilityState={{ checked: isSel, selected: isSel }}
                                    >
                                        <MaterialCommunityIcons
                                            name={isSel ? 'radiobox-marked' : 'radiobox-blank'}
                                            size={20}
                                            color={isSel ? colors.primary : colors.textMuted}
                                            style={{ marginRight: 12 }}
                                            importantForAccessibility="no"
                                        />
                                        <Text style={{ fontSize: 15, color: isSel ? colors.primary : colors.text, fontWeight: isSel ? 'bold' : 'normal' }}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                            <TouchableOpacity
                                style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: colors.background }}
                                onPress={() => setShowMonthPicker(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar"
                            >
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Fechar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={actionModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setActionModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => setActionModalVisible(false)} />
                    <View accessibilityViewIsModal style={{ width: '90%', alignSelf: 'center' }}>
                        <View style={{ backgroundColor: colors.cardBackground, borderRadius: 16, overflow: 'hidden' }}>
                            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }} accessibilityRole="header">Opções de Manutenção</Text>
                                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{selectedMaintenance?.title}</Text>
                            </View>

                            {selectedMaintenance?.status === 'pending' && (
                                <TouchableOpacity
                                    style={{ minHeight: 52, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                    onPress={() => {
                                        setActionModalVisible(false);
                                        if (selectedMaintenance) {
                                            telemetryRef.current?.edit(selectedMaintenance.raw);
                                        }
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Editar Informações"
                                >
                                    <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} style={{ marginRight: 8 }} importantForAccessibility="no" />
                                    <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>Editar Informações</Text>
                                </TouchableOpacity>
                            )}

                            {selectedMaintenance?.status === 'pending' && (
                                <TouchableOpacity
                                    style={{ minHeight: 52, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                    onPress={() => {
                                        setActionModalVisible(false);
                                        if (selectedMaintenance) handleMarkAsDone(selectedMaintenance.id);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Marcar como Concluída"
                                >
                                    <MaterialCommunityIcons name="check-circle" size={20} color={isDark ? '#4ade80' : '#15803d'} style={{ marginRight: 8 }} importantForAccessibility="no" />
                                    <Text style={{ fontSize: 16, color: isDark ? '#4ade80' : '#15803d', fontWeight: 'bold' }}>Marcar como Concluída</Text>
                                </TouchableOpacity>
                            )}

                            {selectedMaintenance?.status === 'completed' && (
                                <TouchableOpacity
                                    style={{ minHeight: 52, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                    onPress={() => {
                                        if (selectedMaintenance) handleArchiveMaintenance(selectedMaintenance.id);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Arquivar Manutenção"
                                >
                                    <MaterialCommunityIcons name="archive-arrow-down" size={20} color={isDark ? '#c4b5fd' : '#6d28d9'} style={{ marginRight: 8 }} importantForAccessibility="no" />
                                    <Text style={{ fontSize: 16, color: isDark ? '#c4b5fd' : '#6d28d9', fontWeight: 'bold' }}>Arquivar Manutenção</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={{ minHeight: 52, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                onPress={() => {
                                    setActionModalVisible(false);
                                    if (selectedMaintenance) handleDelete(selectedMaintenance.id);
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Apagar Agenda"
                            >
                                <MaterialCommunityIcons name="delete-outline" size={20} color={colors.danger} style={{ marginRight: 8 }} importantForAccessibility="no" />
                                <Text style={{ fontSize: 16, color: colors.danger, fontWeight: 'bold' }}>Apagar Agenda</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={{ backgroundColor: colors.cardBackground, minHeight: 52, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}
                            onPress={() => setActionModalVisible(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Cancelar"
                        >
                            <Text style={{ fontSize: 16, color: isDark ? '#60a5fa' : '#1d4ed8', fontWeight: 'bold' }}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal >

            {/* Modal de Resolução de Incidente */}
            <Modal
                visible={incidentResolveModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => !resolvingIncident && setIncidentResolveModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 16 }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View accessibilityViewIsModal style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', maxWidth: 420, borderRadius: 16 }]}>
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, flex: 1 }} accessibilityRole="header">
                                    Resolver Alerta Crítico
                                </Text>
                                <TouchableOpacity
                                    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                    onPress={() => {
                                        if (resolvingIncident) return;
                                        setIncidentResolveModalVisible(false);
                                        setIncidentResolveMessage('');
                                    }}
                                    disabled={resolvingIncident}
                                    accessibilityRole="button"
                                    accessibilityLabel="Fechar resolução de alerta"
                                >
                                    <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                                </TouchableOpacity>
                            </View>
                            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>Descreva brevemente como o problema foi resolvido.</Text>

                            <Text style={[styles.label, { color: colors.text }]}>Ação tomada *</Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background, height: 100, marginBottom: 20 }]}
                                value={incidentResolveMessage}
                                onChangeText={setIncidentResolveMessage}
                                placeholder="Ex: Válvula inspecionada e temperatura estabilizada."
                                placeholderTextColor={colors.textMuted}
                                multiline
                                textAlignVertical="top"
                                accessibilityLabel="Descrição da ação tomada obrigatória"
                            />

                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity
                                    style={[styles.cancelBtn, { borderColor: colors.inputBorder, flex: 1, minHeight: 44, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: resolvingIncident ? 0.6 : 1 }]}
                                    onPress={() => { setIncidentResolveModalVisible(false); setIncidentResolveMessage(''); }}
                                    disabled={resolvingIncident}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cancelar"
                                    accessibilityState={{ disabled: resolvingIncident }}
                                >
                                    <Text style={[styles.cancelText, { color: colors.text, fontWeight: '600' }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary, minHeight: 44, marginTop: 0, paddingVertical: 12, justifyContent: 'center', opacity: resolvingIncident ? 0.7 : 1 }]}
                                    onPress={handleResolveIncident}
                                    disabled={resolvingIncident}
                                    accessibilityRole="button"
                                    accessibilityLabel={resolvingIncident ? 'Confirmando resolução, aguarde' : 'Confirmar resolução'}
                                    accessibilityState={{ disabled: resolvingIncident, busy: resolvingIncident }}
                                >
                                    {resolvingIncident ? (
                                        <ActivityIndicator size="small" color={colors.onPrimary} />
                                    ) : (
                                        <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Confirmar</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Modal de Manutenções Arquivadas */}
            <Modal visible={archivedModalVisible} animationType="slide" transparent={true} onRequestClose={() => setArchivedModalVisible(false)}>
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View accessibilityViewIsModal style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, height: '70%', paddingBottom: Math.max(insets.bottom, 20) }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">Manutenções Arquivadas</Text>
                            <TouchableOpacity
                                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                onPress={() => setArchivedModalVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar manutenções arquivadas"
                            >
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>Histórico dos últimos 30 dias.</Text>

                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            {archivedLoading ? (
                                <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }} accessibilityLiveRegion="polite">
                                    <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Carregando manutenções arquivadas" />
                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Carregando manutenções arquivadas...</Text>
                                </View>
                            ) : archivedMaintenances.length === 0 ? (
                                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>Nenhuma manutenção arquivada nos últimos 30 dias.</Text>
                            ) : (
                                archivedMaintenances.map((item) => (
                                    <View key={item.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                        <Text style={[styles.maintenanceTitle, { color: colors.text }]}>{item.title}</Text>
                                        <Text style={[styles.maintenanceDate, { color: colors.textMuted, marginTop: 4 }]}>{item.date}</Text>
                                        <Text style={{ color: isDark ? '#c4b5fd' : '#6d28d9', fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>Arquivado</Text>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal de Configuração de Exportação */}
            <Modal
                visible={exportModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => !exportLoading && setExportModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View accessibilityViewIsModal style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Math.max(insets.bottom, 24) }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">Configurar Relatório</Text>
                            <TouchableOpacity
                                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                onPress={() => setExportModalVisible(false)}
                                disabled={exportLoading}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar configuração de relatório"
                            >
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 20 }]}>
                            Escolha o período para o arquivo {pendingExportType?.toUpperCase()}.
                        </Text>

                        <View style={{ gap: 12, marginBottom: 24 }} accessibilityRole="radiogroup" accessibilityLabel="Período do relatório">
                            <TouchableOpacity
                                onPress={() => setExportPeriodType("12months")}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    minHeight: 56,
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: exportPeriodType === "12months" ? colors.primary : colors.inputBorder,
                                    backgroundColor: exportPeriodType === "12months" ? colors.primary + '15' : 'transparent'
                                }}
                                accessibilityRole="radio"
                                accessibilityLabel="Últimos 12 Meses: Resumo consolidado do último ano"
                                accessibilityState={{ checked: exportPeriodType === "12months", selected: exportPeriodType === "12months" }}
                            >
                                <View style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    borderWidth: 2,
                                    borderColor: exportPeriodType === "12months" ? colors.primary : colors.textMuted,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: 12
                                }} importantForAccessibility="no">
                                    {exportPeriodType === "12months" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                                <View>
                                    <Text style={{ fontWeight: 'bold', color: colors.text }}>Últimos 12 Meses</Text>
                                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Resumo consolidado do último ano</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setExportPeriodType("specific")}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    minHeight: 56,
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: exportPeriodType === "specific" ? colors.primary : colors.inputBorder,
                                    backgroundColor: exportPeriodType === "specific" ? colors.primary + '15' : 'transparent'
                                }}
                                accessibilityRole="radio"
                                accessibilityLabel="Mês Específico: Dados de um período único"
                                accessibilityState={{ checked: exportPeriodType === "specific", selected: exportPeriodType === "specific" }}
                            >
                                <View style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    borderWidth: 2,
                                    borderColor: exportPeriodType === "specific" ? colors.primary : colors.textMuted,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: 12
                                }} importantForAccessibility="no">
                                    {exportPeriodType === "specific" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                                <View>
                                    <Text style={{ fontWeight: 'bold', color: colors.text }}>Mês Específico</Text>
                                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Dados de um período único</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        {exportPeriodType === "specific" && (
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                                <View style={{ flex: 1, position: 'relative' }}>
                                    <Text style={[styles.label, { color: colors.text, fontSize: 12 }]}>Mês</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setExportMonthPickerVisible(!exportMonthPickerVisible);
                                            setExportYearPickerVisible(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            padding: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Mês para exportação: ${months[parseInt(exportMonth)].label}`}
                                        accessibilityState={{ expanded: exportMonthPickerVisible }}
                                    >
                                        <Text style={{ color: colors.text }}>{months[parseInt(exportMonth)].label}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>

                                    {exportMonthPickerVisible && (
                                        <View style={{
                                            position: 'absolute', bottom: '100%', left: 0, width: 220,
                                            backgroundColor: colors.cardBackground, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                                            padding: 8, flexDirection: 'row', flexWrap: 'wrap', zIndex: 1000, elevation: 10
                                        }}>
                                            {months.map((m) => (
                                                <TouchableOpacity
                                                    key={m.value}
                                                    onPress={() => { setExportMonth(m.value); setExportMonthPickerVisible(false); }}
                                                    style={{ width: '33.3%', minHeight: 44, justifyContent: 'center', paddingVertical: 10, alignItems: 'center' }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={m.label}
                                                    accessibilityState={{ selected: exportMonth === m.value }}
                                                >
                                                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: exportMonth === m.value ? 'bold' : 'normal' }}>{m.label.substring(0, 3)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={{ width: 100, position: 'relative' }}>
                                    <Text style={[styles.label, { color: colors.text, fontSize: 12 }]}>Ano</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setExportYearPickerVisible(!exportYearPickerVisible);
                                            setExportMonthPickerVisible(false);
                                        }}
                                        style={{
                                            backgroundColor: colors.background,
                                            minHeight: 44,
                                            padding: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.inputBorder,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Ano para exportação: ${exportYear}`}
                                        accessibilityState={{ expanded: exportYearPickerVisible }}
                                    >
                                        <Text style={{ color: colors.text }}>{exportYear}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} importantForAccessibility="no" />
                                    </TouchableOpacity>

                                    {exportYearPickerVisible && (
                                        <View style={{
                                            position: 'absolute', bottom: '100%', right: 0, width: 120,
                                            backgroundColor: colors.cardBackground, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                                            padding: 8, zIndex: 1000, elevation: 10
                                        }}>
                                            {years.map((y) => (
                                                <TouchableOpacity
                                                    key={y}
                                                    onPress={() => { setExportYear(y); setExportYearPickerVisible(false); }}
                                                    style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 10, alignItems: 'center' }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={y}
                                                    accessibilityState={{ selected: exportYear === y }}
                                                >
                                                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: exportYear === y ? 'bold' : 'normal' }}>{y}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={async () => {
                                try {
                                    if (pendingExportType === "pdf") await handleExportPDF();
                                    else if (pendingExportType === "excel") await handleExportExcel();
                                    else if (pendingExportType === "csv") await handleExportCSV();
                                } finally {
                                    setExportModalVisible(false);
                                }
                            }}
                            disabled={exportLoading}
                            style={[styles.primaryButton, { backgroundColor: colors.primary, minHeight: 48, justifyContent: 'center', flexDirection: 'row', gap: 10, opacity: exportLoading ? 0.7 : 1 }]}
                            accessibilityRole="button"
                            accessibilityLabel={exportLoading ? 'Processando relatório, aguarde' : 'Gerar Arquivo'}
                            accessibilityState={{ disabled: exportLoading, busy: exportLoading }}
                        >
                            {exportLoading && <ActivityIndicator size="small" color={colors.onPrimary} />}
                            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>{exportLoading ? "Processando..." : "Gerar Arquivo"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal de Ordenação dos Cards */}
            <Modal visible={isOrderModalVisible} animationType="slide" transparent={true} onRequestClose={() => setOrderModalVisible(false)}>
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View accessibilityViewIsModal style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Math.max(insets.bottom, 24) }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">Ordenar Visão Geral</Text>
                            <TouchableOpacity
                                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                onPress={() => setOrderModalVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar ordenação dos cartões"
                            >
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>Altere a ordem de exibição dos painéis principais.</Text>

                        <View style={{ gap: 8, marginBottom: 24 }}>
                            {tempOrder.map((key, index) => {
                                const iconMap: Record<CardKey, string> = { waste: 'water-outline', energy: 'lightning-bolt', tax: 'currency-usd', efficiency: 'leaf' };
                                const cardTitle = getCardTitle(key);

                                return (
                                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colorToMetric[key], padding: 12, borderRadius: 8 }}>
                                        <MaterialCommunityIcons name={iconMap[key] as any} size={18} color="#fff" style={{ marginRight: 8 }} importantForAccessibility="no" />
                                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' }}>{index + 1}. {cardTitle}</Text>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            <TouchableOpacity
                                                style={{
                                                    width: 44,
                                                    height: 44,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: index === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)',
                                                    borderRadius: 8,
                                                    borderWidth: 1,
                                                    borderColor: index === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'
                                                }}
                                                onPress={() => moveCard(index, 'up')}
                                                disabled={index === 0}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Mover ${cardTitle} para cima`}
                                                accessibilityState={{ disabled: index === 0 }}
                                            >
                                                <MaterialCommunityIcons name="chevron-up" size={20} color={index === 0 ? 'rgba(255,255,255,0.4)' : '#fff'} importantForAccessibility="no" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={{
                                                    width: 44,
                                                    height: 44,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: index === tempOrder.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)',
                                                    borderRadius: 8,
                                                    borderWidth: 1,
                                                    borderColor: index === tempOrder.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'
                                                }}
                                                onPress={() => moveCard(index, 'down')}
                                                disabled={index === tempOrder.length - 1}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Mover ${cardTitle} para baixo`}
                                                accessibilityState={{ disabled: index === tempOrder.length - 1 }}
                                            >
                                                <MaterialCommunityIcons name="chevron-down" size={20} color={index === tempOrder.length - 1 ? 'rgba(255,255,255,0.4)' : '#fff'} importantForAccessibility="no" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )
                            })}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                style={[styles.cancelBtn, { borderColor: colors.inputBorder, flex: 1, minHeight: 44, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }]}
                                onPress={resetCardOrder}
                                accessibilityRole="button"
                                accessibilityLabel="Restaurar Ordem Padrão"
                            >
                                <Text style={[styles.cancelText, { color: colors.text, fontWeight: '600' }]}>Restaurar Padrão</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary, minHeight: 44, marginTop: 0, justifyContent: 'center' }]}
                                onPress={() => saveCardOrder(cardOrder, tempOrder)}
                                accessibilityRole="button"
                                accessibilityLabel="Salvar Ordem"
                            >
                                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Salvar Ordem</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <TelemetryWidget
                ref={telemetryRef}
                onAddMaintenance={() => loadDashboardData()}
                alertsEnabled={alertsEnabled}
                activeBiodigester={mapMarkers[0]}
                onNavigateNotifications={onNavigateNotifications}
            />
        </View>
    )
}

const TelemetryWidget = React.forwardRef<any, { onAddMaintenance?: () => void, alertsEnabled: boolean, activeBiodigester?: any, onNavigateNotifications?: () => void }>(({ onAddMaintenance, alertsEnabled, activeBiodigester, onNavigateNotifications }, ref) => {
    const { colors, theme } = useTheme();
    const isDark = theme === 'dark';
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [temp, setTemp] = useState(35.5);
    const [pressure, setPressure] = useState(1.45);
    const [ph, setPh] = useState(7.1);
    const [h2s, setH2s] = useState(120);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [cycleCount, setCycleCount] = useState(0);
    const [simSensor, setSimSensor] = useState<'auto' | 'temp' | 'pressure' | 'ph' | 'h2s'>('auto');
    const [expanded, setExpanded] = useState(false);
    const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
    const [maintenanceStep, setMaintenanceStep] = useState(1);
    const [submittingMaintenance, setSubmittingMaintenance] = useState(false);
    const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
    const dismissedAlertKeyRef = useRef<string | null>(null);
    const [maintenanceForm, setMaintenanceForm] = useState({
        name: '',
        email: '',
        phone: '',
        priority: 'Média - Problema técnico',
        description: '',
        date: '',
        time: ''
    });

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (mounted) setReduceMotionEnabled(enabled);
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, []);

    React.useImperativeHandle(ref, () => ({
        edit: (item: any) => {
            setEditingId(item.id);
            const dt = new Date(item.scheduled_date);
            setMaintenanceForm({
                name: item.name || '',
                email: item.email || '',
                phone: item.phone || '',
                priority: item.priority || 'Média - Problema técnico',
                description: item.description || '',
                date: dt.toLocaleDateString('pt-BR'),
                time: dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
            setMaintenanceModalVisible(true);
            setMaintenanceStep(1);
        },
        open: () => {
            setEditingId(null);
            setMaintenanceForm({
                name: '',
                email: '',
                phone: '',
                priority: 'Média - Problema técnico',
                description: '',
                date: '',
                time: ''
            });
            setMaintenanceStep(1);
            setExpanded(true);
        }
    }));

    const handleNextStep = () => {
        if (maintenanceStep === 1 && !maintenanceForm.name.trim()) {
            showAlert("Aviso", "Por favor, preencha o Nome Completo antes de continuar.");
            return;
        }
        setMaintenanceStep(s => s + 1);
    };

    const handleScheduleMaintenance = async () => {
        if (!maintenanceForm.name.trim() || !maintenanceForm.date.trim() || !maintenanceForm.time.trim()) {
            showAlert("Erro", "Por favor, preencha nome, data (DD/MM/AAAA) e hora (HH:MM).");
            return;
        }

        const parsed = parseStrictScheduleDateTime(maintenanceForm.date, maintenanceForm.time);
        if ('error' in parsed) {
            showAlert("Erro", parsed.error);
            return;
        }

        setSubmittingMaintenance(true);
        try {
            if (editingId) {
                const res = await maintenanceApi.updateSchedule(editingId, 'pending');
                if (!res.success) {
                    showAlert("Erro ao atualizar", res.error || 'Erro desconhecido');
                    return;
                }
            } else {
                const res = await maintenanceApi.createSchedule({
                    name: maintenanceForm.name.trim(),
                    priority: maintenanceForm.priority,
                    scheduledDate: parsed.iso,
                });
                if (!res.success) {
                    showAlert("Erro ao salvar", res.error || 'Erro desconhecido');
                    return;
                }
            }

            if (onAddMaintenance) {
                onAddMaintenance();
            }

            showAlert("Sucesso", editingId ? "Manutenção atualizada!" : "Manutenção agendada com sucesso!");
            setMaintenanceModalVisible(false);
            setEditingId(null);
            setMaintenanceStep(1);
            setMaintenanceForm({ name: '', email: '', phone: '', priority: 'Média - Problema técnico', description: '', date: '', time: '' });
        } catch {
            showAlert("Erro", "Não foi possível agendar a manutenção. Tente novamente.");
        } finally {
            setSubmittingMaintenance(false);
        }
    }

    // Animação para o ícone M/Alerta
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const lastRecordedAlertRef = useRef<Record<string, number>>({});
    const [lastSavedAlertText, setLastSavedAlertText] = useState<string | null>(null);

    // Gravação de Ocorrência no Histórico do Banco de Dados
    const recordOccurrence = async (
        sensorType: string,
        readingValue: number,
        anomalyInfo: { alertLevel: string; threshold: number; unit: string; description: string }
    ) => {
        try {
            const { recorded } = await recordTelemetryOccurrence({
                sensorType,
                readingValue,
                anomalyInfo,
                activeBiodigester,
                lastRecordedMap: lastRecordedAlertRef.current,
                cooldownMs: 15000,
            });

            if (recorded) {
                const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setLastSavedAlertText(`Registrado no histórico às ${hora}`);
            }
        } catch (err) {
            console.error('[Telemetry] Erro ao gravar ocorrência:', err);
        }
    };

    // Helper para teste direto de níveis (dispara e registra ocorrência imediatamente)
    const handleTestLevel = (level: 'info' | 'low' | 'medium' | 'critical') => {
        const target = simSensor === 'auto' ? 'temp' : simSensor;
        let sType = 'temperatura';
        let val = 35.5;
        dismissedAlertKeyRef.current = null;

        if (level === 'info') {
            setTimeElapsed(0);
            setLastSavedAlertText(null);
            if (target === 'temp') { setTemp(35.5); sType = 'temperatura'; val = 35.5; }
            if (target === 'pressure') { setPressure(1.45); sType = 'pressao'; val = 1.45; }
            if (target === 'ph') { setPh(7.10); sType = 'ph'; val = 7.10; }
            if (target === 'h2s') { setH2s(120); sType = 'h2s'; val = 120; }
        } else if (level === 'low') {
            setTimeElapsed(5);
            if (target === 'temp') { setTemp(38.0); sType = 'temperatura'; val = 38.0; }
            if (target === 'pressure') { setPressure(1.68); sType = 'pressao'; val = 1.68; }
            if (target === 'ph') { setPh(6.62); sType = 'ph'; val = 6.62; }
            if (target === 'h2s') { setH2s(290); sType = 'h2s'; val = 290; }
            const c = classifySensorReading(sType, val);
            recordOccurrence(sType, val, c);
        } else if (level === 'medium') {
            setTimeElapsed(8);
            if (target === 'temp') { setTemp(39.3); sType = 'temperatura'; val = 39.3; }
            if (target === 'pressure') { setPressure(1.83); sType = 'pressao'; val = 1.83; }
            if (target === 'ph') { setPh(6.32); sType = 'ph'; val = 6.32; }
            if (target === 'h2s') { setH2s(520); sType = 'h2s'; val = 520; }
            const c = classifySensorReading(sType, val);
            recordOccurrence(sType, val, c);
        } else if (level === 'critical') {
            setTimeElapsed(11);
            if (target === 'temp') { setTemp(41.4); sType = 'temperatura'; val = 41.4; }
            if (target === 'pressure') { setPressure(2.05); sType = 'pressao'; val = 2.05; }
            if (target === 'ph') { setPh(5.85); sType = 'ph'; val = 5.85; }
            if (target === 'h2s') { setH2s(780); sType = 'h2s'; val = 780; }
            const c = classifySensorReading(sType, val);
            recordOccurrence(sType, val, c);
            if (alertsEnabled) setExpanded(true);
        }
    };

    // Loop de Simulação Cíclica dos 4 Sensores
    useEffect(() => {
        const interval = setInterval(() => {
            setCycleCount((prev) => prev + 1);
            setTimeElapsed((prev) => (prev + 1) % 16);

            let targetSensor = simSensor;
            if (simSensor === 'auto') {
                const autoIndex = Math.floor(cycleCount / 16) % 4;
                targetSensor = autoIndex === 0 ? 'temp' : autoIndex === 1 ? 'pressure' : autoIndex === 2 ? 'ph' : 'h2s';
            }

            if (targetSensor === 'temp') {
                if (timeElapsed >= 4 && timeElapsed <= 6) {
                    setTemp(38.0 + (Math.random() - 0.5) * 0.4);
                } else if (timeElapsed >= 7 && timeElapsed <= 9) {
                    setTemp(39.3 + (Math.random() - 0.5) * 0.4);
                } else if (timeElapsed >= 10 && timeElapsed <= 12) {
                    setTemp(41.4 + (Math.random() - 0.5) * 0.4);
                } else if (timeElapsed >= 13) {
                    setTemp((prev) => Math.max(35.2, prev - 1.8));
                } else {
                    setTemp(35.4 + (Math.random() - 0.5) * 0.4);
                }
            } else {
                setTemp((prev) => Math.max(35.0, Math.min(36.2, prev + (Math.random() - 0.5) * 0.2)));
            }

            if (targetSensor === 'pressure') {
                if (timeElapsed >= 4 && timeElapsed <= 6) {
                    setPressure(1.68 + (Math.random() - 0.5) * 0.04);
                } else if (timeElapsed >= 7 && timeElapsed <= 9) {
                    setPressure(1.83 + (Math.random() - 0.5) * 0.04);
                } else if (timeElapsed >= 10 && timeElapsed <= 12) {
                    setPressure(2.05 + (Math.random() - 0.5) * 0.06);
                } else if (timeElapsed >= 13) {
                    setPressure((prev) => Math.max(1.45, prev - 0.18));
                } else {
                    setPressure(1.45 + (Math.random() - 0.5) * 0.04);
                }
            } else {
                setPressure((prev) => Math.max(1.40, Math.min(1.50, prev + (Math.random() - 0.5) * 0.02)));
            }

            if (targetSensor === 'ph') {
                if (timeElapsed >= 4 && timeElapsed <= 6) {
                    setPh(6.62 + (Math.random() - 0.5) * 0.05);
                } else if (timeElapsed >= 7 && timeElapsed <= 9) {
                    setPh(6.32 + (Math.random() - 0.5) * 0.05);
                } else if (timeElapsed >= 10 && timeElapsed <= 12) {
                    setPh(5.85 + (Math.random() - 0.5) * 0.08);
                } else if (timeElapsed >= 13) {
                    setPh((prev) => Math.min(7.10, prev + 0.35));
                } else {
                    setPh(7.10 + (Math.random() - 0.5) * 0.05);
                }
            } else {
                setPh((prev) => Math.max(7.00, Math.min(7.20, prev + (Math.random() - 0.5) * 0.02)));
            }

            if (targetSensor === 'h2s') {
                if (timeElapsed >= 4 && timeElapsed <= 6) {
                    setH2s(Math.round(290 + (Math.random() - 0.5) * 30));
                } else if (timeElapsed >= 7 && timeElapsed <= 9) {
                    setH2s(Math.round(520 + (Math.random() - 0.5) * 40));
                } else if (timeElapsed >= 10 && timeElapsed <= 12) {
                    setH2s(Math.round(780 + (Math.random() - 0.5) * 40));
                } else if (timeElapsed >= 13) {
                    setH2s((prev) => Math.max(120, prev - 180));
                } else {
                    setH2s(Math.round(115 + (Math.random() - 0.5) * 15));
                }
            } else {
                setH2s((prev) => Math.round(Math.max(100, Math.min(130, prev + (Math.random() - 0.5) * 6))));
            }
        }, 2200);
        return () => clearInterval(interval);
    }, [timeElapsed, simSensor, cycleCount]);

    const {
        classifications: {
            temperatura: tempClass,
            pressao: pressClass,
            ph: phClass,
            h2s: h2sClass,
        },
        highestAlert,
        isCritical,
        isMedium,
        isLow,
    } = evaluateTelemetryReadings({
        temperatura: temp,
        pressao: pressure,
        ph,
        h2s,
    });

    useEffect(() => {
        if (!isCritical) {
            dismissedAlertKeyRef.current = null;
        }
        if (highestAlert && highestAlert.isAnomaly) {
            const sType = highestAlert.unit === '°C' ? 'temperatura' : highestAlert.unit === 'bar' ? 'pressao' : highestAlert.unit === 'pH' ? 'ph' : 'h2s';
            const rVal = highestAlert.unit === '°C' ? temp : highestAlert.unit === 'bar' ? pressure : highestAlert.unit === 'pH' ? ph : h2s;
            const alertCycleKey = `${sType}_${highestAlert.alertLevel}`;

            if (isCritical && alertsEnabled && dismissedAlertKeyRef.current !== alertCycleKey) {
                setExpanded(true);
            }

            recordOccurrence(sType, rVal, highestAlert);
        }
    }, [highestAlert?.alertLevel, highestAlert?.unit, isCritical]);

    useEffect(() => {
        if (isCritical && !expanded && !reduceMotionEnabled) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
            pulseAnim.stopAnimation();
        }
    }, [isCritical, expanded, reduceMotionEnabled]);

    const renderSensorTag = (level: string, label: string) => {
        const info = getCriticalityBadgeInfo(level, theme);
        return (
            <View style={{ backgroundColor: info.bgColor, borderColor: info.borderColor, borderWidth: 0.5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: info.color }}>{label.toUpperCase()}</Text>
            </View>
        );
    };

    const sensorValueColor = (level: string) => getCriticalityBadgeInfo(level, theme).color;
    const highestBadge = highestAlert ? getCriticalityBadgeInfo(highestAlert.alertLevel, theme) : null;
    const ctaFillColor = isCritical ? '#b91c1c' : isMedium ? '#c2410c' : '#854d0e';

    return (
        <View style={{ position: 'absolute', bottom: Math.max(insets.bottom + 84, 100), right: 16, zIndex: 999, alignItems: 'flex-end' }}>
            {expanded && (
                <View style={{ width: Math.min(310, windowWidth - 32), maxHeight: '65%', backgroundColor: colors.cardBackground, borderRadius: 14, padding: 16, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: isCritical ? colors.dangerBorder : isMedium ? '#fdba74' : colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <MaterialCommunityIcons name="access-point" size={16} color={colors.primary} importantForAccessibility="no" />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} accessibilityRole="header">
                                Monitoramento de Sensores
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10, marginTop: -8 }}
                            onPress={() => {
                                if (highestAlert) {
                                    const sType = highestAlert.unit === '°C' ? 'temperatura' : highestAlert.unit === 'bar' ? 'pressao' : highestAlert.unit === 'pH' ? 'ph' : 'h2s';
                                    dismissedAlertKeyRef.current = `${sType}_${highestAlert.alertLevel}`;
                                }
                                setExpanded(false);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Fechar monitoramento de sensores"
                        >
                            <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} importantForAccessibility="no" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Linhas de Dados dos 4 Sensores */}
                        <View style={{ gap: 9, marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialCommunityIcons name="thermometer" size={15} color={colors.textMuted} importantForAccessibility="no" />
                                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Temperatura</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: tempClass.alertLevel === 'info' ? colors.text : sensorValueColor(tempClass.alertLevel), fontWeight: 'bold', fontSize: 13 }}>
                                        {temp.toFixed(1)}°C
                                    </Text>
                                    {renderSensorTag(tempClass.alertLevel, tempClass.label)}
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialCommunityIcons name="gauge" size={15} color={colors.textMuted} importantForAccessibility="no" />
                                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Pressão</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: pressClass.alertLevel === 'info' ? colors.text : sensorValueColor(pressClass.alertLevel), fontWeight: 'bold', fontSize: 13 }}>
                                        {pressure.toFixed(2)} bar
                                    </Text>
                                    {renderSensorTag(pressClass.alertLevel, pressClass.label)}
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialCommunityIcons name="water-percent" size={15} color={colors.textMuted} importantForAccessibility="no" />
                                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>pH Biomassa</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: phClass.alertLevel === 'info' ? colors.text : sensorValueColor(phClass.alertLevel), fontWeight: 'bold', fontSize: 13 }}>
                                        {ph.toFixed(1)}
                                    </Text>
                                    {renderSensorTag(phClass.alertLevel, phClass.label)}
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialCommunityIcons name="molecule" size={15} color={colors.textMuted} importantForAccessibility="no" />
                                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>H2S (Gás)</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ color: h2sClass.alertLevel === 'info' ? colors.text : sensorValueColor(h2sClass.alertLevel), fontWeight: 'bold', fontSize: 13 }}>
                                        {h2s.toFixed(0)} ppm
                                    </Text>
                                    {renderSensorTag(h2sClass.alertLevel, h2sClass.label)}
                                </View>
                            </View>
                        </View>

                        {/* Barra de Seleção de Sensor Simulado */}
                        <View style={{ backgroundColor: colors.background, padding: 8, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 6 }}>
                                SIMULAR SENSOR: {simSensor.toUpperCase()}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                                {[
                                    { key: 'auto', label: 'Auto' },
                                    { key: 'temp', label: 'Temp' },
                                    { key: 'pressure', label: 'Pressão' },
                                    { key: 'ph', label: 'pH' },
                                    { key: 'h2s', label: 'H2S' },
                                ].map((s) => {
                                    const selected = simSensor === s.key;
                                    return (
                                        <TouchableOpacity
                                            key={s.key}
                                            style={{
                                                flex: 1,
                                                minHeight: 36,
                                                justifyContent: 'center',
                                                paddingVertical: 4,
                                                alignItems: 'center',
                                                borderRadius: 6,
                                                backgroundColor: selected ? colors.primary : colors.cardBackground,
                                                borderWidth: 1,
                                                borderColor: selected ? colors.primary : colors.border
                                            }}
                                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                                            onPress={() => setSimSensor(s.key as any)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Simular sensor ${s.label}`}
                                            accessibilityState={{ selected }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '600', color: selected ? colors.onPrimary : colors.text }}>
                                                {s.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Teste Rápido de Nível */}
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                                {[
                                    { key: 'info', label: 'Normal' },
                                    { key: 'low', label: 'Atenção' },
                                    { key: 'medium', label: 'Médio' },
                                    { key: 'critical', label: 'Crítico' },
                                ].map((lvl) => {
                                    const lvlColor = getCriticalityBadgeInfo(lvl.key, theme).color;
                                    return (
                                        <TouchableOpacity
                                            key={lvl.key}
                                            style={{
                                                flex: 1,
                                                minHeight: 36,
                                                justifyContent: 'center',
                                                paddingVertical: 4,
                                                alignItems: 'center',
                                                borderRadius: 6,
                                                borderWidth: 1,
                                                borderColor: lvlColor
                                            }}
                                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                                            onPress={() => handleTestLevel(lvl.key as any)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Testar nível ${lvl.label}`}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: lvlColor }}>
                                                {lvl.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Alerta / Anomalia Embutido com Classificação */}
                        {highestAlert && highestAlert.isAnomaly && highestBadge && (
                            <View
                                style={{
                                    backgroundColor: highestBadge.bgColor,
                                    padding: 10,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: highestBadge.borderColor
                                }}
                                accessibilityRole="alert"
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                    <Text style={{ color: highestBadge.color, fontWeight: 'bold', fontSize: 12 }}>
                                        {highestAlert.label}: {highestAlert.unit === '°C' ? 'Temperatura' : highestAlert.unit === 'bar' ? 'Pressão' : highestAlert.unit === 'pH' ? 'pH' : 'H2S'}
                                    </Text>
                                </View>
                                <Text style={{ color: colors.text, fontSize: 12, lineHeight: 16, marginBottom: 8 }}>
                                    {highestAlert.description}
                                </Text>
                                {lastSavedAlertText && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, backgroundColor: colors.cardBackground, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 }}>
                                        <MaterialCommunityIcons name="check-circle" size={12} color={colors.primary} importantForAccessibility="no" />
                                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
                                            {lastSavedAlertText}
                                        </Text>
                                    </View>
                                )}
                                <View style={{ gap: 6 }}>
                                    <TouchableOpacity
                                        style={{
                                            backgroundColor: ctaFillColor,
                                            minHeight: 44,
                                            justifyContent: 'center',
                                            paddingVertical: 8,
                                            borderRadius: 6,
                                            alignItems: 'center'
                                        }}
                                        onPress={() => {
                                            const sName = highestAlert.unit === '°C' ? 'Sensor Temperatura' : highestAlert.unit === 'bar' ? 'Sensor Pressão' : highestAlert.unit === 'pH' ? 'Sensor pH' : 'Sensor H2S';
                                            setMaintenanceForm(prev => ({
                                                ...prev,
                                                name: `Manutenção - ${sName}`,
                                                priority: isCritical ? 'Urgente - Problema técnico' : isMedium ? 'Alta - Problema técnico' : 'Média - Problema técnico',
                                                description: highestAlert.description
                                            }));
                                            setMaintenanceModalVisible(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Solicitar Manutenção"
                                    >
                                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Solicitar Manutenção</Text>
                                    </TouchableOpacity>

                                    {onNavigateNotifications && (
                                        <TouchableOpacity
                                            style={{
                                                borderWidth: 1,
                                                borderColor: highestBadge.color,
                                                minHeight: 44,
                                                paddingVertical: 6,
                                                borderRadius: 6,
                                                alignItems: 'center',
                                                flexDirection: 'row',
                                                justifyContent: 'center',
                                                gap: 4
                                            }}
                                            onPress={onNavigateNotifications}
                                            accessibilityRole="button"
                                            accessibilityLabel="Ver Histórico de Alertas"
                                        >
                                            <MaterialCommunityIcons name="history" size={14} color={highestBadge.color} importantForAccessibility="no" />
                                            <Text style={{ color: highestBadge.color, fontWeight: '700', fontSize: 12 }}>
                                                Ver Histórico de Alertas →
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}

            {/* Modal de Agendamento de Manutenção */}
            <Modal
                visible={maintenanceModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => !submittingMaintenance && setMaintenanceModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 16 }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View accessibilityViewIsModal style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', maxWidth: 400 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]} accessibilityRole="header">
                                {editingId ? 'Editar Manutenção' : 'Agendar Manutenção'}
                            </Text>
                            <TouchableOpacity
                                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
                                onPress={() => setMaintenanceModalVisible(false)}
                                disabled={submittingMaintenance}
                                accessibilityRole="button"
                                accessibilityLabel="Fechar agendamento de manutenção"
                            >
                                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} importantForAccessibility="no" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ width: '100%', maxHeight: 450 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {/* Indicador de passos */}
                            <View
                                style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 10 }}
                                accessible
                                accessibilityLabel={`Etapa ${maintenanceStep} de 3`}
                            >
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 1 ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 1 ? colors.onPrimary : colors.textMuted, fontSize: 12, fontWeight: 'bold' }}>1</Text></View>
                                <View style={{ flex: 1, height: 3, backgroundColor: maintenanceStep >= 2 ? colors.primary : colors.border }} />
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 2 ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 2 ? colors.onPrimary : colors.textMuted, fontSize: 12, fontWeight: 'bold' }}>2</Text></View>
                                <View style={{ flex: 1, height: 3, backgroundColor: maintenanceStep >= 3 ? colors.primary : colors.border }} />
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 3 ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 3 ? colors.onPrimary : colors.textMuted, fontSize: 12, fontWeight: 'bold' }}>3</Text></View>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 5, marginBottom: 20 }}>
                                <Text style={{ fontSize: 11, color: colors.textMuted }}>Dados</Text>
                                <Text style={{ fontSize: 11, color: colors.textMuted }}>Problema</Text>
                                <Text style={{ fontSize: 11, color: colors.textMuted }}>Agenda</Text>
                            </View>

                            {maintenanceStep === 1 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]} accessibilityRole="header">Seus dados</Text>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Nome Completo *</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background }]}
                                            value={maintenanceForm.name}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, name: t })}
                                            placeholder="Ex: João da Silva"
                                            placeholderTextColor={colors.textMuted}
                                            accessibilityLabel="Nome Completo obrigatório"
                                        />
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Email (Opcional)</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background }]}
                                            value={maintenanceForm.email}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, email: t })}
                                            placeholder="Ex: joao@email.com"
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            placeholderTextColor={colors.textMuted}
                                            accessibilityLabel="Email opcional"
                                        />
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Telefone (Opcional)</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background }]}
                                            value={maintenanceForm.phone}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, phone: t })}
                                            placeholder="Ex: 11 99999-9999"
                                            keyboardType="phone-pad"
                                            placeholderTextColor={colors.textMuted}
                                            accessibilityLabel="Telefone opcional"
                                        />
                                    </View>
                                </View>
                            )}

                            {maintenanceStep === 2 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]} accessibilityRole="header">Descreva o problema</Text>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Prioridade</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Prioridade da manutenção">
                                            {['Baixa', 'Média', 'Alta', 'Urgente'].map((level) => {
                                                const isSelected = maintenanceForm.priority.startsWith(level);
                                                return (
                                                    <TouchableOpacity
                                                        key={level}
                                                        style={[
                                                            styles.urgencyBtn,
                                                            { borderColor: colors.inputBorder, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
                                                            isSelected && { backgroundColor: level === 'Alta' || level === 'Urgente' ? colors.dangerBg : colors.primaryLight, borderColor: level === 'Alta' || level === 'Urgente' ? colors.danger : colors.primary }
                                                        ]}
                                                        onPress={() => setMaintenanceForm({ ...maintenanceForm, priority: `${level} - Problema técnico` })}
                                                        accessibilityRole="radio"
                                                        accessibilityLabel={`Prioridade ${level}`}
                                                        accessibilityState={{ selected: isSelected, checked: isSelected }}
                                                    >
                                                        <Text style={[
                                                            { fontSize: 12, color: colors.text },
                                                            isSelected && { color: level === 'Alta' || level === 'Urgente' ? colors.danger : colors.primaryDark, fontWeight: 'bold' }
                                                        ]}>{level}</Text>
                                                    </TouchableOpacity>
                                                )
                                            })}
                                        </View>
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Descrição Detalhada (Opcional)</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background, height: 90 }]}
                                            value={maintenanceForm.description}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, description: t })}
                                            placeholder="Descreva o que está ocorrendo..."
                                            placeholderTextColor={colors.textMuted}
                                            multiline
                                            textAlignVertical="top"
                                            accessibilityLabel="Descrição detalhada opcional"
                                        />
                                    </View>
                                </View>
                            )}

                            {maintenanceStep === 3 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]} accessibilityRole="header">Quando podemos te ajudar?</Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.formGroup, { flex: 1 }]}>
                                            <Text style={[styles.label, { color: colors.text }]}>Data Preferida *</Text>
                                            <TextInput
                                                style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background }]}
                                                value={maintenanceForm.date}
                                                onChangeText={(t) => {
                                                    let val = t.replace(/\D/g, '');
                                                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                                                    if (val.length > 5) val = val.slice(0, 5) + '/' + val.slice(5, 9);
                                                    setMaintenanceForm({ ...maintenanceForm, date: val })
                                                }}
                                                placeholder="DD/MM/AAAA"
                                                keyboardType="numeric"
                                                maxLength={10}
                                                placeholderTextColor={colors.textMuted}
                                                accessibilityLabel="Data preferida obrigatória no formato dia, mês e ano"
                                            />
                                        </View>
                                        <View style={[styles.formGroup, { flex: 1 }]}>
                                            <Text style={[styles.label, { color: colors.text }]}>Horário *</Text>
                                            <TextInput
                                                style={[styles.input, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.background }]}
                                                value={maintenanceForm.time}
                                                onChangeText={(t) => {
                                                    let val = t.replace(/\D/g, '');
                                                    if (val.length > 2) val = val.slice(0, 2) + ':' + val.slice(2, 4);
                                                    setMaintenanceForm({ ...maintenanceForm, time: val })
                                                }}
                                                placeholder="HH:MM"
                                                keyboardType="numeric"
                                                maxLength={5}
                                                placeholderTextColor={colors.textMuted}
                                                accessibilityLabel="Horário obrigatório no formato hora e minuto"
                                            />
                                        </View>
                                    </View>

                                    <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ fontWeight: 'bold', color: colors.text, marginBottom: 8, fontSize: 13 }}>Resumo do agendamento:</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}><Text style={{ fontWeight: '500' }}>Nome:</Text> {maintenanceForm.name}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}><Text style={{ fontWeight: '500' }}>Prioridade:</Text> {maintenanceForm.priority.split(' - ')[0]}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}><Text style={{ fontWeight: '500' }}>Data:</Text> {maintenanceForm.date} às {maintenanceForm.time}</Text>
                                    </View>
                                </View>
                            )}

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                                {maintenanceStep > 1 ? (
                                    <TouchableOpacity
                                        style={[styles.primaryButton, { flex: 0.4, minHeight: 44, justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.inputBorder }]}
                                        onPress={() => setMaintenanceStep(s => s - 1)}
                                        disabled={submittingMaintenance}
                                        accessibilityRole="button"
                                        accessibilityLabel="Voltar para etapa anterior"
                                    >
                                        <Text style={[styles.primaryButtonText, { color: colors.text }]}>Voltar</Text>
                                    </TouchableOpacity>
                                ) : <View style={{ flex: 0.4 }} />}

                                {maintenanceStep < 3 ? (
                                    <TouchableOpacity
                                        style={[styles.primaryButton, { flex: 0.5, minHeight: 44, justifyContent: 'center', backgroundColor: colors.primary }]}
                                        onPress={handleNextStep}
                                        accessibilityRole="button"
                                        accessibilityLabel="Avançar para próxima etapa"
                                    >
                                        <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Próximo</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        style={[styles.primaryButton, { flex: 0.6, minHeight: 44, justifyContent: 'center', backgroundColor: colors.primary, opacity: submittingMaintenance ? 0.7 : 1 }]}
                                        onPress={handleScheduleMaintenance}
                                        disabled={submittingMaintenance}
                                        accessibilityRole="button"
                                        accessibilityLabel={submittingMaintenance ? 'Confirmando agendamento, aguarde' : 'Confirmar agendamento'}
                                        accessibilityState={{ disabled: submittingMaintenance, busy: submittingMaintenance }}
                                    >
                                        {submittingMaintenance ? (
                                            <ActivityIndicator size="small" color={colors.onPrimary} />
                                        ) : (
                                            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Confirmar</Text>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {!expanded && (
                <TouchableOpacity
                    style={{
                        backgroundColor: isCritical ? '#b91c1c' : isMedium ? '#c2410c' : isLow ? '#854d0e' : colors.cardBackground,
                        minHeight: 44,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 30,
                        elevation: 5,
                        shadowColor: '#000',
                        shadowOpacity: 0.2,
                        borderWidth: 1,
                        borderColor: isCritical ? '#991b1b' : isMedium ? '#9a3412' : isLow ? '#713f12' : colors.border
                    }}
                    onPress={() => setExpanded(true)}
                    accessibilityRole="button"
                    accessibilityLabel={
                        isCritical
                            ? 'Alerta Crítico de sensores. Toque para abrir o monitoramento.'
                            : isMedium
                            ? 'Alerta Médio de sensores. Toque para abrir o monitoramento.'
                            : isLow
                            ? 'Atenção nos sensores. Toque para abrir o monitoramento.'
                            : 'Monitoramento de sensores. Toque para abrir.'
                    }
                    accessibilityLiveRegion={isCritical ? 'assertive' : 'none'}
                    accessibilityState={{ expanded }}
                >
                    {isCritical ? (
                        <Animated.View style={{ transform: [{ scale: pulseAnim }] }} importantForAccessibility="no">
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', position: 'absolute', top: -2, right: -2 }} />
                            <MaterialCommunityIcons name="alert" size={18} color="#fff" />
                        </Animated.View>
                    ) : isMedium ? (
                        <MaterialCommunityIcons name="alert-outline" size={18} color="#fff" importantForAccessibility="no" />
                    ) : isLow ? (
                        <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#fff" importantForAccessibility="no" />
                    ) : (
                        <MaterialCommunityIcons name="access-point" size={18} color={colors.text} importantForAccessibility="no" />
                    )}
                    <Text style={{ fontWeight: '700', color: (isCritical || isMedium || isLow) ? '#fff' : colors.text, fontSize: 13 }}>
                        {isCritical ? 'Alerta Crítico' : isMedium ? 'Alerta Médio' : isLow ? 'Atenção' : 'Sensores'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
});


function MultiBar({ month, vals, selectedTab, isHighlight, onPress, details, isAnySelected }: {
    month: string,
    vals: number[],
    selectedTab: string,
    isHighlight?: boolean,
    onPress?: () => void,
    details?: { waste: number, energy: number, tax: number },
    isAnySelected?: boolean
}) {
    const { colors, theme } = useTheme();
    const isDark = theme === 'dark';
    const energyColor = isDark ? '#facc15' : '#ca8a04';
    const wasteColor = isDark ? '#4ade80' : '#15803d';
    const taxColor = isDark ? '#60a5fa' : '#1d4ed8';

    const spokenSummary = details
        ? `${month}: Energia ${details.energy} quilowatt-hora, Resíduos ${details.waste} quilogramas, Benefícios ${details.tax} reais`
        : month;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            style={styles.chartBarContainer}
            accessibilityRole="button"
            accessibilityLabel={spokenSummary}
            accessibilityState={{ selected: !!isHighlight }}
        >
            {isHighlight && (
                <View style={{ position: 'absolute', top: 0, bottom: 20, width: 1, backgroundColor: colors.primary, opacity: 0.5, zIndex: 0 }} importantForAccessibility="no" />
            )}
            <View style={styles.barsArea} importantForAccessibility="no-hide-descendants">
                {(selectedTab === 'all' || selectedTab === 'energy') && <View style={[styles.chartBar, { height: `${vals[0]}%`, backgroundColor: energyColor }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
                {(selectedTab === 'all' || selectedTab === 'waste') && <View style={[styles.chartBar, { height: `${vals[1]}%`, backgroundColor: wasteColor }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
                {(selectedTab === 'all' || selectedTab === 'tax') && <View style={[styles.chartBar, { height: `${vals[2]}%`, backgroundColor: taxColor }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
            </View>
            <Text style={[styles.chartLabel, { color: colors.textMuted }, isHighlight && { color: colors.primary, fontWeight: 'bold' }]}>{month}</Text>
        </TouchableOpacity>
    )
}

function StatCard({ title, value, unit, changePercent, increasing, iconName, color, bgColor }: any) {
    const { colors, theme } = useTheme();
    const isDark = theme === 'dark';
    const iconBackground = isDark ? colors.iconBg : bgColor;
    const trendColor = increasing ? (isDark ? '#4ade80' : '#15803d') : (isDark ? '#f87171' : '#b91c1c');
    const spokenTrend = `${increasing ? 'aumento de' : 'queda de'} ${changePercent.trim()}`;

    return (
        <View
            accessible
            accessibilityLabel={`${title}: ${value}${unit ? ` ${unit}` : ''}, ${spokenTrend}`}
            style={[styles.card, { width: '48%', backgroundColor: colors.cardBackground }]}
        >
            <View style={styles.cardHeader}>
                <View style={[styles.iconBg, { backgroundColor: iconBackground }]} importantForAccessibility="no">
                    <MaterialCommunityIcons name={iconName || 'alert'} size={24} color={color} importantForAccessibility="no" />
                </View>
            </View>
            <View style={styles.cardValue}>
                <Text style={[styles.valueText, { color }]} numberOfLines={1}>{value}</Text>
                {unit ? <Text style={[styles.unitText, { color }]}>{unit}</Text> : null}
            </View>
            <View style={{ marginTop: 4 }}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{title}</Text>
            </View>
            <View style={[styles.changeBadge, { marginTop: 8 }]}>
                <Text style={{ color: trendColor, fontSize: 12, fontWeight: '700' }}>
                    {increasing ? '▲' : '▼'}{changePercent}
                </Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#4ade80',
        fontSize: 14,
    },
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 14,
    },
    card: {
        borderRadius: 18,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
    },
    iconBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 18,
    },
    cardValue: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
    },
    valueText: {
        fontSize: 26,
        fontWeight: '800',
    },
    unitText: {
        fontSize: 12,
        fontWeight: '600',
    },
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    // Chart
    legendRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendColor: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
    },
    chartMockup: {
        flexDirection: 'row',
        height: 130,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    chartBarContainer: {
        alignItems: 'center',
        flex: 1,
        height: '100%',
        justifyContent: 'flex-end',
    },
    barsArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 100,
        gap: 1,
        marginBottom: 8,
    },
    chartBar: {
        width: 5,
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
    },
    chartLabel: {
        fontSize: 10,
        color: '#94a3b8',
    },
    // Manutenção
    maintenanceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    maintenanceDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#facc15',
        marginRight: 12,
    },
    maintenanceTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1e293b',
    },
    maintenanceDate: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    statusPending: {
        fontSize: 11,
        fontWeight: '700',
        color: '#854d0e',
        backgroundColor: '#fef08a',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDone: {
        fontSize: 11,
        fontWeight: '700',
        color: '#15803d',
        backgroundColor: '#dcfce7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    divider: {
        height: 1,
        backgroundColor: '#f1f5f9',
    },
    // Export
    gridExport: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'space-between',
    },
    exportCard: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exportIcon: {
        fontSize: 18,
        marginBottom: 6,
    },
    exportText: {
        fontSize: 12,
        fontWeight: '700',
    },
    footer: {
        marginTop: 24,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#86efac',
    },
    // Tabs Gráfico
    tabsContainer: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    tab: {
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
    },
    // Modal Geral (Map and Maintenance)
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        width: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    modalSubtitle: {
        fontSize: 13,
    },
    modalClose: {
        fontSize: 20,
        color: '#94a3b8',
        fontWeight: 'bold',
        padding: 4,
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
    },
    urgencyBtn: {
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    primaryButton: {
        backgroundColor: '#16a34a',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    cancelBtn: {
        borderWidth: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelText: {
        fontWeight: '600',
        fontSize: 15,
    },
});
