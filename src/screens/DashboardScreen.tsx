import React, { useEffect, useState, useRef } from 'react'
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Modal,
    TextInput,
    Animated,
    Dimensions,
    FlatList,
    LayoutAnimation,
    Platform,
    UIManager
} from 'react-native'
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ViewShot from 'react-native-view-shot'
import { supabase } from '../lib/supabase'
import MapComponent from '../components/MapComponent'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme } from '../context/ThemeContext'

interface MetricData {
    value: number
    changePercent: string
    increasing: boolean,
    color: string
}

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

const IDEAL_RATIO = 0.8

function calculateChange(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
}

function formatMetric(current: number, previous: number, key: CardKey): MetricData {
    const change = calculateChange(current, previous)
    return {
        value: current,
        changePercent: `${Math.abs(change).toFixed(1)}% `,
        increasing: change >= 0,
        color: colorToMetric[key]
    }
}

type CardKey = 'waste' | 'energy' | 'tax' | 'efficiency'
const DEFAULT_CARD_ORDER: CardKey[] = ['waste', 'energy', 'tax', 'efficiency']

const colorToMetric: Record<CardKey, string> = {
    'waste': '#2563eb', // Emerald (Cool Green)
    'energy': '#d97706', // Cool Blue
    'tax': '#e11d48', // Rose (Cooler Red)
    'efficiency': '#10b981',  // Amber (Cooler Yellow/Orange)
}

export default function DashboardScreen() {
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
    const [chartData, setChartData] = useState<ChartPoint[]>([])

    // States for custom card ordering
    const [cardOrder, setCardOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)
    const [isOrderModalVisible, setOrderModalVisible] = useState(false)
    const [tempOrder, setTempOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)

    interface MarkerData { id: string; latitude: number; longitude: number; title: string; description: string; rawAddress?: any; }
    const [mapMarkers, setMapMarkers] = useState<MarkerData[]>([]);
    const [mapFocusLocation, setMapFocusLocation] = useState<{ latitude: number, longitude: number } | undefined>(undefined);

    interface MaintenanceItem { id: string; title: string; date: string; status: string; raw: any; }
    const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceItem | null>(null);

    const handleMarkAsDone = async (id: string) => {
        try {
            console.log("Marking as done:", id);
            const { error } = await supabase
                .from('maintenance_schedules')
                .update({ status: 'done' })
                .eq('id', id);

            if (error) throw error;

            console.log("Update success");
            Alert.alert("Sucesso", "Manutenção concluída!", [{ text: "OK", onPress: () => loadDashboardData() }]);
        } catch (err: any) {
            Alert.alert("Erro", "Não foi possível atualizar: " + err.message);
            console.error(err);
        }
    }

    const handleDelete = async (id: string) => {
        Alert.alert("Confirmar", "Tem certeza que deseja apagar essa manutenção?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Apagar", style: "destructive", onPress: async () => {
                    try {
                        console.log("Deleting maintenance:", id);
                        const { error } = await supabase
                            .from('maintenance_schedules')
                            .delete()
                            .eq('id', id);

                        if (error) throw error;

                        console.log("Delete success");
                        Alert.alert("Sucesso", "Manutenção apagada com sucesso!", [{ text: "OK", onPress: () => loadDashboardData() }]);
                    } catch (err: any) {
                        Alert.alert("Erro", "Não foi possível apagar: " + err.message);
                        console.error(err);
                    }
                }
            }
        ]);
    }

    const fetchMapMarkers = async (focusId?: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('biodigestor_maps')
                .select('id, address')
                .eq('user_id', user.id)
                .order('id', { ascending: false })

            if (error || !data) return

            const ms: MarkerData[] = []
            for (const row of data) {
                const addr = row.address as any
                const fullAddress = addr?.full_address || JSON.stringify(row.address)

                if (addr?.lat && addr?.lon) {
                    const marker = {
                        id: row.id.toString(),
                        latitude: parseFloat(addr.lat),
                        longitude: parseFloat(addr.lon),
                        title: addr?.nome || fullAddress.split(',')[0],
                        description: fullAddress,
                        rawAddress: addr
                    };
                    ms.push(marker);

                    if (focusId && focusId === marker.id) {
                        setMapFocusLocation({ latitude: marker.latitude, longitude: marker.longitude });
                    }
                }
            }
            setMapMarkers(ms)
        } catch (e) {
            console.error("Erro ao buscar marcadores:", e)
        }
    }

    const handleMarkerDragEnd = async (id: string, coord: { latitude: number, longitude: number }) => {
        const m = mapMarkers.find(x => x.id === id);
        if (!m || !m.rawAddress) return;
        const newAddr = { ...m.rawAddress, lat: coord.latitude, lon: coord.longitude };
        const { error } = await supabase.from('biodigestor_maps').update({ address: newAddr }).eq('id', parseInt(id));
        if (!error) {
            setMapMarkers(prev => prev.map(x => x.id === id ? { ...x, latitude: coord.latitude, longitude: coord.longitude } : x));
        }
    };

    const handleDeleteMarker = (id: string, name: string) => {
        Alert.alert("Excluir Marcador", `Deseja remover "${name}"?`, [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Excluir", style: "destructive", onPress: async () => {
                    const { error } = await supabase.from('biodigestor_maps').delete().eq('id', parseInt(id));
                    if (error) Alert.alert("Erro", "Não foi possível excluir");
                    else fetchMapMarkers();
                }
            }
        ]);
    };

    const handleEditMarker = (m: any) => {
        setMarkerEditingId(m.id);
        const addr = m.rawAddress || {};

        // Nome: prioriza o que está no JSON 'nome', senão usa o título do marcador
        setMarkerName(addr.nome || m.title || '');

        // Se temos dados granulares, usamos eles
        if (addr.logradouro || addr.cep) {
            setMarkerCep(addr.cep || '');
            setMarkerAddress(addr.logradouro || '');
            setMarkerNumber(addr.numero || '');
            setMarkerComplement(addr.complemento || '');
        } else {
            // Fallback para dados antigos que só tinham full_address
            const full = addr.full_address || m.description || '';
            setMarkerAddress(full.split(',')[0] || '');
            setMarkerCep('');
            setMarkerNumber('');
            setMarkerComplement('');
        }

        setMapModalVisible(true);
    };

    const handleFetchCep = async () => {
        const cleanCep = markerCep.replace(/\D/g, '');
        if (cleanCep.length !== 8) {
            Alert.alert("Aviso", "Digite um CEP válido com 8 dígitos.");
            return;
        }
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const cepData = await res.json();
            if (!cepData.erro) {
                setMarkerAddress(`${cepData.logradouro}, ${cepData.bairro} - ${cepData.localidade}/${cepData.uf}`);
            } else {
                Alert.alert("Erro", "CEP não encontrado.");
            }
        } catch (err) {
            Alert.alert("Erro", "Falha ao consultar viaCEP.");
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
    const [refreshing, setRefreshing] = useState(false)
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
    const [selectedChartIndex, setSelectedChartIndex] = useState<number | null>(null)
    const [alertsEnabled, setAlertsEnabled] = useState(true)

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
        try {
            const monthIdx = parseInt(m);
            const yearVal = parseInt(y);
            const startDate = new Date(yearVal, monthIdx, 1).toISOString();
            const endDate = new Date(yearVal, monthIdx + 1, 0, 23, 59, 59).toISOString();

            const { data, error } = await supabase
                .from('biodigester_indicators')
                .select('*')
                .gte('measured_at', startDate)
                .lte('measured_at', endDate)
                .limit(1)
                .single();

            if (data && !error) {
                setManualMetrics(prev => ({
                    ...prev,
                    waste: data.waste_processed?.toString() || "",
                    energy: data.energy_generated?.toString() || "",
                    tax: data.tax_savings?.toString() || ""
                }));
            } else {
                setManualMetrics(prev => ({ ...prev, waste: "", energy: "", tax: "" }));
            }
        } catch (e) {
            setManualMetrics(prev => ({ ...prev, waste: "", energy: "", tax: "" }));
        }
    };

    const handleSaveManualMetrics = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Não autenticado")

            const monthIdx = parseInt(manualMetrics.month)
            const yearVal = parseInt(manualMetrics.year)

            // Define a data como o dia 15 do mês para evitar problemas de fuso e centralizar no gráfico
            const measuredDate = new Date(yearVal, monthIdx, 15)
            const isoDate = measuredDate.toISOString()

            // Verifica se já existe registro para este mês/ano
            const startDate = new Date(yearVal, monthIdx, 1).toISOString()
            const endDate = new Date(yearVal, monthIdx + 1, 0, 23, 59, 59).toISOString()

            const { data: existing } = await supabase
                .from('biodigester_indicators')
                .select('id')
                .eq('user_id', user.id)
                .gte('measured_at', startDate)
                .lte('measured_at', endDate)
                .limit(1)
                .single()

            let saveError
            if (existing) {
                // UPDATE
                const { error } = await supabase
                    .from('biodigester_indicators')
                    .update({
                        waste_processed: parseFloat(manualMetrics.waste) || 0,
                        energy_generated: parseFloat(manualMetrics.energy) || 0,
                        tax_savings: parseFloat(manualMetrics.tax) || 0,
                        measured_at: isoDate
                    })
                    .eq('id', existing.id)
                saveError = error
            } else {
                // INSERT
                const { error } = await supabase
                    .from('biodigester_indicators')
                    .insert([{
                        user_id: user.id,
                        waste_processed: parseFloat(manualMetrics.waste) || 0,
                        energy_generated: parseFloat(manualMetrics.energy) || 0,
                        tax_savings: parseFloat(manualMetrics.tax) || 0,
                        measured_at: isoDate
                    }])
                saveError = error
            }

            if (saveError) throw saveError

            // Persiste o último mês/ano editado
            await AsyncStorage.setItem('@biodash_last_edited', JSON.stringify({
                month: monthIdx,
                year: yearVal
            }));

            setMetricsModalVisible(false)
            Alert.alert("Sucesso", `Métricas de ${months[monthIdx].label}/${yearVal} salvas!`)
            loadDashboardData()
        } catch (err) {
            console.error('Save metrics error:', err)
            Alert.alert("Erro", "Não foi possível salvar as métricas no sistema.")
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

    useEffect(() => {
        loadUser()
        loadDashboardData()
        loadPreferences()
        loadCardOrder()
        const interval = setInterval(loadDashboardData, 30_000)
        return () => clearInterval(interval)
    }, [])

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
                Alert.alert("Sucesso", "Sua visão geral foi reordenada com sucesso")
            }
        } catch (e) {
            console.error('Error saving order', e)
            Alert.alert('Erro', 'Não foi possível salvar a ordenação.')
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
            Alert.alert("Sucesso", "Ordenamento restaurado ao padrão")
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
            case 'tax': return 'Impostos'
            case 'efficiency': return 'Eficiência'
            default: return ''
        }
    }

    const loadUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setUserEmail(user?.email ?? 'admin@biodash.com')
    }

    const loadDashboardData = async () => {
        fetchMapMarkers()
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser()
            if (!currentUser) return;
            const IDEAL_RATIO = 0.8;

            // --- BUSCA OS 2 ÚLTIMOS REGISTROS PARA OS CARDS DO TOPO ---
            // Prioridade: Mês atual > Último registro
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

            let query = supabase
                .from("biodigester_indicators")
                .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                .order("measured_at", { ascending: false, nullsFirst: false });

            if (currentUser) {
                query = query.eq('user_id', currentUser.id);
            }

            let { data: allRows, error } = await query;

            if (error) throw error;

            // Tenta recuperar qual foi o último mês editado
            const lastEditedStr = await AsyncStorage.getItem('@biodash_last_edited');
            let lastEdited = lastEditedStr ? JSON.parse(lastEditedStr) : null;

            let current = undefined;
            if (lastEdited && allRows) {
                current = allRows.find(r => {
                    const d = new Date(r.measured_at);
                    return d.getMonth() === lastEdited.month && d.getFullYear() === lastEdited.year;
                });
            }

            // Se não achou o editado, ou não tem, usa o mais recente por data de medição
            if (!current && allRows && allRows.length > 0) {
                current = allRows[0];
            }

            // Pega o registro anterior para comparação (o próximo na lista descendente)
            const currentIndex = allRows?.indexOf(current!) ?? -1;
            const previous = (currentIndex !== -1 && allRows) ? allRows[currentIndex + 1] : undefined;

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

            // --- BUSCA HISTÓRICO DE 12 MESES PARA O GRÁFICO ---
            const since = new Date();
            since.setMonth(since.getMonth() - 12);

            let chartQuery = supabase
                .from("biodigester_indicators")
                .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                .eq('user_id', currentUser.id)
                .gte("measured_at", since.toISOString())
                .order("measured_at", { ascending: true });

            let chartRes = await chartQuery;

            if (chartRes.error) {
                const fb = await supabase
                    .from("biodigester_indicators")
                    .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                    .eq('user_id', currentUser.id)
                    .gte("created_at", since.toISOString())
                    .order("created_at", { ascending: true });
                if (fb.error) throw fb.error;
                chartRes = { data: fb.data, error: null, count: null, status: 200, statusText: "OK" };
            }

            const rowsHistory = chartRes.data ?? [];
            const byMonth = new Map<string, { date: Date; w: number; e: number; t: number }>();

            const monthShort = (d: Date) =>
                new Intl.DateTimeFormat("pt-BR", { month: "short" })
                    .format(d)
                    .replace(".", "")
                    .replace(/^\w/, (c) => c.toUpperCase());

            for (const r of rowsHistory) {
                const whenStr = r.measured_at ?? r.created_at;
                if (!whenStr) continue;
                const d = new Date(whenStr);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

            // --- BUSCA MANUTENÇÕES DO SUPABASE ---
            if (currentUser) {
                const { data: maintData } = await supabase
                    .from('maintenance_schedules')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (maintData && maintData.length > 0) {
                    const ptMap: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
                    setMaintenances(maintData.map((m: any) => {
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
            }

        } catch (err) {
            console.error('Error loading dashboard data:', err)
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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            let query = supabase
                .from("biodigester_indicators")
                .select("*")
                .eq("user_id", user.id)
                .order("measured_at", { ascending: true });

            if (exportPeriodType === "12months") {
                const since = new Date();
                since.setMonth(since.getMonth() - 12);
                query = query.gte("measured_at", since.toISOString());
            } else {
                const startDate = new Date(parseInt(exportYear), parseInt(exportMonth), 1).toISOString();
                const endDate = new Date(parseInt(exportYear), parseInt(exportMonth) + 1, 0, 23, 59, 59).toISOString();
                query = query.gte("measured_at", startDate).lte("measured_at", endDate);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erro ao buscar dados para exportação:", err);
            return [];
        }
    };

    const processExportMetrics = (data: any[]) => {
        if (data.length === 0) {
            return [
                ["Métrica", "Valor Total", "Variação"],
                ["Sem dados no período", "-", "-"],
            ];
        }

        const totals = data.reduce((acc, curr) => ({
            waste: acc.waste + Number(curr.waste_processed || 0),
            energy: acc.energy + Number(curr.energy_generated || 0),
            tax: acc.tax + Number(curr.tax_savings || 0),
        }), { waste: 0, energy: 0, tax: 0 });

        return [
            ["Resíduos Processados (kg)", totals.waste.toFixed(2), "-"],
            ["Energia Gerada (kWh)", totals.energy.toFixed(2), "-"],
            ["Imposto Abatido (BRL)", `R$ ${totals.tax.toFixed(2)}`, "-"],
            ["Total de Registros", data.length.toString(), "-"],
        ];
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
                chartImageURI = await chartRef.current.capture();
            }

            const rowsHTML = metrics.map(m => `
                <tr style="text-align: center; border-bottom: 1px solid #ddd;">
                    <td style="padding: 12px; font-weight: bold; color: #1f2937;">${m[0]}</td>
                    <td style="padding: 12px; color: #16a34a;">${m[1]}</td>
                    <td style="padding: 12px; color: #64748b;">${m[2]}</td>
                </tr>
            `).join('');

            const html = `
            <html>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #333;">
                    <div style="background-color: #16a34a; padding: 40px 30px; color: white;">
                        <h1 style="margin: 0; font-size: 28px;">BioDash - Relatório Analítico</h1>
                        <p style="margin-top: 8px; opacity: 0.9;">Período: ${periodLabel}</p>
                        <p style="margin-top: 4px; opacity: 0.8; font-size: 12px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <h2 style="color: #1f2937; margin-bottom: 20px;">Resumo de Desempenho</h2>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background-color: #f0fdf4;">
                                    <th style="padding: 15px; text-align: center; color: #16a34a; font-weight: 800; border-bottom: 2px solid #16a34a;">Métrica</th>
                                    <th style="padding: 15px; text-align: center; color: #16a34a; font-weight: 800; border-bottom: 2px solid #16a34a;">Valor Total</th>
                                    <th style="padding: 15px; text-align: center; color: #16a34a; font-weight: 800; border-bottom: 2px solid #16a34a;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHTML}
                            </tbody>
                        </table>

                        ${chartImageURI ? `
                            <h2 style="color: #1f2937; margin-bottom: 20px;">Tendências do Período</h2>
                            <div style="text-align: center; background: #fbfbfb; padding: 20px; border-radius: 12px; border: 1px solid #eee;">
                                <img src="data:image/png;base64,${chartImageURI}" style="width: 100%; max-width: 600px;" />
                            </div>
                        ` : ''}

                        <div style="margin-top: 40px; padding: 20px; background-color: #f8fafc; border-radius: 12px; border-left: 5px solid #16a34a;">
                            <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
                                Este relatório contém dados consolidados das unidades de biodigestão monitoradas via BioDash. 
                                Para análises granulares, exportações por unidade ou ferramentas de BI, utilize a plataforma BioDash Web.
                            </p>
                        </div>
                        <p style="margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center;">BioDash Intelligence Systems © ${new Date().getFullYear()}</p>
                    </div>
                </body>
            </html>
            `;
            const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
            await Sharing.shareAsync(uri, { dialogTitle: 'Compartilhar Relatório PDF' });
        } catch (error: any) {
            console.error("Erro PDF:", error);
            Alert.alert('Erro', 'Não foi possível gerar o PDF: ' + (error.message || String(error)));
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

            const fileName = `biodash_${periodLabel.replace(/[\s\/]/g, '_')}.csv`;
            // @ts-ignore
            const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const fileUri = cacheDir + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
            await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar Planilha', mimeType: 'text/comma-separated-values' });
        } catch (error: any) {
            console.error("Erro Excel:", error);
            Alert.alert('Erro', 'Não foi possível gerar a planilha: ' + (error.message || String(error)));
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

            // Add BOM for better compatibility with Excel and change delimiter to semicolon
            let csvContent = "\uFEFF" + "Metrica;Valor Total\n";
            metrics.forEach(row => {
                csvContent += `${row[0]};${row[1].replace('R$ ', '').replace('kg', '').replace('kWh', '')}\n`;
            });

            const fileName = `biodash_raw_${periodLabel.replace(/[\s\/]/g, '_')}.csv`;
            // @ts-ignore
            const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const fileUri = cacheDir + fileName;
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
            await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar CSV', mimeType: 'text/csv' });
        } catch (error: any) {
            console.error("Erro CSV:", error);
            Alert.alert('Erro', 'Não foi possível gerar o CSV: ' + (error.message || String(error)));
        } finally {
            setExportLoading(false);
        }
    }

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.primary }]}>Coletando sensores...</Text>
            </View>
        )
    }

    // Filtro de Tabs pro Gráfico
    const isHighlight = (tab: string) => selectedTab === tab

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Header movido pro MainTabs App.tsx, então exibimos apenas um título local */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Dashboard</Text>
                        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Visão geral do biodigestor.</Text>
                    </View>
                    <TouchableOpacity
                        style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        onPress={() => setMetricsModalVisible(true)}
                    >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✏️ Atualizar</Text>
                    </TouchableOpacity>
                </View>

                {referenceDate ? (
                    <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13, flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialCommunityIcons name="calendar-month" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                            Dados referentes a {referenceDate}
                        </Text>
                    </View>
                ) : null}

                {/* Cards dinâmicos e ordenáveis */}
                <View style={styles.grid}>
                    <StatCard title="Resíduos" value={data.waste.value.toFixed(1)} unit="kg" changePercent={data.waste.changePercent} increasing={data.waste.increasing} emoji="💧" color="#22c55e" bgColor="#dcfce7" />
                    <StatCard title="Energia" value={data.energy.value.toFixed(1)} unit="kWh" changePercent={data.energy.changePercent} increasing={data.energy.increasing} emoji="⚡" color="#eab308" bgColor="#fef9c3" />
                    <StatCard title="Impostos" value={`R$ ${data.tax.value.toFixed(0)}`} unit="" changePercent={data.tax.changePercent} increasing={data.tax.increasing} emoji="💰" color="#3b82f6" bgColor="#dbeafe" />
                    <StatCard title="Eficiência" value={data.efficiency.value.toFixed(1)} unit="%" changePercent={data.efficiency.changePercent} increasing={data.efficiency.increasing} emoji="🌿" color="#16a34a" bgColor="#bbf7d0" />
                </View>

                {/* Visão Geral (Múltiplas Métricas) */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Visão Geral de Desempenho</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Comparativo de Energia, Resíduos e Impostos abatidos.</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
                    <TouchableOpacity style={[styles.tab, isHighlight('all') && { backgroundColor: colors.primary }]} onPress={() => setSelectedTab('all')}>
                        <Text style={[styles.tabText, isHighlight('all') ? { color: '#fff' } : { color: colors.textMuted }]}>Todas Métricas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, isHighlight('waste') && { backgroundColor: colors.primary }]} onPress={() => setSelectedTab('waste')}>
                        <Text style={[styles.tabText, isHighlight('waste') ? { color: '#fff' } : { color: colors.textMuted }]}>Resíduos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, isHighlight('energy') && { backgroundColor: colors.primary }]} onPress={() => setSelectedTab('energy')}>
                        <Text style={[styles.tabText, isHighlight('energy') ? { color: '#fff' } : { color: colors.textMuted }]}>Energia</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, isHighlight('tax') && { backgroundColor: colors.primary }]} onPress={() => setSelectedTab('tax')}>
                        <Text style={[styles.tabText, isHighlight('tax') ? { color: '#fff' } : { color: colors.textMuted }]}>Impostos</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={[styles.card, { backgroundColor: colors.cardBackground, marginTop: 16 }]}>
                    {selectedTab === 'all' && (
                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#eab308' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Energia</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#22c55e' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Resíduos</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Impostos</Text></View>
                        </View>
                    )}

                    <ViewShot ref={chartRef} options={{ format: "jpg", quality: 0.9, result: 'base64' }}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => setSelectedChartIndex(null)}
                            style={[styles.chartMockup, { backgroundColor: colors.cardBackground }]}
                        >
                            {chartData.length === 0 ? (
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', height: 180 }}>
                                    <Text style={{ color: colors.textMuted }}>Nenhum dado registrado para o gráfico.</Text>
                                </View>
                            ) : (
                                chartData.map((point, index) => {
                                    // Vamos calcular proporções para a altura da barra ser pelo menos visível.
                                    // Isso é uma simplificação para fins visuais no RN, usando um "teto" flexível
                                    // igual fizemos no mock anterior, limitando a 100% de altura para não quebrar o layout.
                                    const hEnergy = Math.min(Math.max((point.energyGenerated / 15000) * 100, 5), 100);
                                    const hWaste = Math.min(Math.max((point.wasteProcessed / 4000) * 100, 5), 100);
                                    const hTax = Math.min(Math.max((point.taxDeduction / 12000) * 100, 5), 100);

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
                        </TouchableOpacity>
                    </ViewShot>
                </View>

                {/* Manutenção Agendada */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>Manutenções Agendadas</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Desempenho operacional em tempo real.</Text>
                <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                    {maintenances.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <TouchableOpacity
                                style={styles.maintenanceItem}
                                activeOpacity={0.7}
                                onLongPress={() => {
                                    setSelectedMaintenance(item);
                                    setActionModalVisible(true);
                                }}
                                delayLongPress={250}
                            >
                                <View style={[styles.maintenanceDot, item.status === 'done' && { backgroundColor: '#16a34a' }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.maintenanceTitle, { color: colors.text }]}>{item.title}</Text>
                                    <Text style={[styles.maintenanceDate, { color: colors.textMuted }]}>{item.date}</Text>
                                </View>
                                <Text style={item.status === 'pending' ? styles.statusPending : [styles.statusDone, { backgroundColor: colors.primaryLight, color: colors.primaryDark }]}>
                                    {item.status === 'pending' ? 'Pendente' : 'Concluído'}
                                </Text>
                            </TouchableOpacity>
                            {index < maintenances.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* Exportar Relatórios (Movido para antes do mapa) */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Exportar Relatórios</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Gere métricas oficiais para análise externa.</Text>
                <View style={[styles.gridExport, { marginBottom: 12 }]}>
                    <TouchableOpacity
                        style={[styles.exportCard, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}
                        onPress={() => {
                            setPendingExportType("pdf");
                            setExportModalVisible(true);
                        }}
                    >
                        <MaterialCommunityIcons name="file-pdf-box" size={28} color="#dc2626" style={{ marginBottom: 8 }} />
                        <Text style={[styles.exportText, { color: '#dc2626' }]}>Gerar PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.exportCard, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}
                        onPress={() => {
                            setPendingExportType("excel");
                            setExportModalVisible(true);
                        }}
                    >
                        <MaterialCommunityIcons name="file-excel-box" size={28} color="#16a34a" style={{ marginBottom: 8 }} />
                        <Text style={[styles.exportText, { color: '#16a34a' }]}>Gerar Excel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.exportCard, { borderColor: '#93c5fd', backgroundColor: '#eff6ff' }]}
                        onPress={() => {
                            setPendingExportType("csv");
                            setExportModalVisible(true);
                        }}
                    >
                        <MaterialCommunityIcons name="file-delimited" size={28} color="#2563eb" style={{ marginBottom: 8 }} />
                        <Text style={[styles.exportText, { color: '#2563eb' }]}>Gerar CSV</Text>
                    </TouchableOpacity>
                </View>

                {/* Mapa (Cross-Platform) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
                    <View>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Localização da Empresa</Text>
                        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Unidade ativa do biodigestor.</Text>
                    </View>
                    <TouchableOpacity
                        style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 16 }}
                        onPress={() => {
                            setMarkerEditingId(null);
                            setMarkerName('');
                            setMarkerCep('');
                            setMarkerAddress('');
                            setMarkerNumber('');
                            setMarkerComplement('');
                            setMapModalVisible(true);
                        }}
                    >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>+ Adicionar</Text>
                    </TouchableOpacity>
                </View>

                {/* Map Add Modal */}
                <Modal visible={isMapModalVisible} transparent animationType="fade">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.cardBackground, width: '90%', padding: 24, borderRadius: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>Novo Marcador de Instalação</Text>
                            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>Busque pelo CEP ou preencha o local do equipamento.</Text>

                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Nome do Equipamento / Cliente</Text>
                                <TextInput
                                    style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                    placeholder="Ex: Unidade Sul"
                                    placeholderTextColor={colors.textMuted}
                                    value={markerName}
                                    onChangeText={setMarkerName}
                                />
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>CEP</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                        placeholder="00000-000"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        value={markerCep}
                                        onChangeText={setMarkerCep}
                                    />
                                </View>
                                <View style={{ justifyContent: 'flex-end' }}>
                                    <TouchableOpacity style={{ backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10, justifyContent: 'center' }} onPress={handleFetchCep} disabled={cepLoading}>
                                        {cepLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Buscar</Text>}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                                <View style={{ flex: 2 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Endereço</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14, backgroundColor: colors.background }}
                                        placeholder="Rua, Bairro..."
                                        placeholderTextColor={colors.textMuted}
                                        value={markerAddress}
                                        onChangeText={setMarkerAddress}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Nº</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                        placeholder="123"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        value={markerNumber}
                                        onChangeText={setMarkerNumber}
                                    />
                                </View>
                            </View>


                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Complemento</Text>
                                    <TextInput
                                        style={{ borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 10, color: colors.text, fontSize: 14 }}
                                        placeholder="Opcional (Ex: Km 42)"
                                        placeholderTextColor={colors.textMuted}
                                        value={markerComplement}
                                        onChangeText={setMarkerComplement}
                                    />
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                                <TouchableOpacity onPress={() => { setMapModalVisible(false); setMarkerEditingId(null); }} style={{ padding: 10, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.textMuted, fontWeight: 'bold' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={async () => {
                                        let lat: number | undefined, lon: number | undefined;
                                        try {
                                            setCepLoading(true);
                                            const headers = {
                                                'User-Agent': 'BioDashMobileApp/1.0',
                                                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                                            };

                                            // Geocodificação (apenas se for novo marcador ou se o endereço mudou)
                                            if (!markerEditingId) {
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
                                            }

                                            const { data: { user } } = await supabase.auth.getUser();
                                            if (user) {
                                                const addressFull = `${markerAddress}${markerNumber ? ', ' + markerNumber : ''}${markerComplement ? ' - ' + markerComplement : ''}, ${markerCep}, Brasil`.replace(/'/g, "");
                                                const addressJson = {
                                                    nome: markerName,
                                                    full_address: addressFull,
                                                    lat: lat || (markerEditingId ? mapMarkers.find(x => x.id === markerEditingId)?.latitude : undefined),
                                                    lon: lon || (markerEditingId ? mapMarkers.find(x => x.id === markerEditingId)?.longitude : undefined),
                                                    cep: markerCep,
                                                    logradouro: markerAddress,
                                                    numero: markerNumber,
                                                    complemento: markerComplement
                                                };

                                                if (markerEditingId) {
                                                    await supabase.from('biodigestor_maps').update({ address: addressJson }).eq('id', parseInt(markerEditingId));
                                                    await fetchMapMarkers(markerEditingId);
                                                } else {
                                                    const { data: newRows } = await supabase.from('biodigestor_maps').insert([{ user_id: user.id, address: addressJson }]).select('id');
                                                    if (newRows && newRows[0]) {
                                                        await fetchMapMarkers(newRows[0].id.toString());
                                                    } else {
                                                        await fetchMapMarkers();
                                                    }
                                                }

                                                setMapModalVisible(false);
                                                setMarkerEditingId(null);
                                                setMarkerName(''); setMarkerCep(''); setMarkerAddress(''); setMarkerNumber(''); setMarkerComplement('');
                                                setTimeout(() => Alert.alert("Sucesso", "Localização salva!"), 500);
                                            }
                                        } catch (e: any) {
                                            Alert.alert("Erro", "Falha ao salvar: " + e.message);
                                        } finally {
                                            setCepLoading(false);
                                        }
                                    }}
                                    style={{ backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
                                >
                                    {cepLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{markerEditingId ? 'Atualizar Dados' : 'Salvar no Mapa'}</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Lista de Locais Acima do Mapa (Novo Requisito) */}
                {/* Lista de Locais (Refinada - Flex Wrap) */}
                {mapMarkers.length > 0 && (
                    <View style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {mapMarkers.map((m) => (
                            <TouchableOpacity
                                key={m.id}
                                onPress={() => {
                                    setMapFocusLocation({ latitude: m.latitude, longitude: m.longitude });
                                }}
                                style={{
                                    backgroundColor: colors.cardBackground,
                                    paddingLeft: 14,
                                    paddingRight: 8,
                                    paddingVertical: 8,
                                    borderRadius: 20,
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
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a', marginRight: 8 }} />
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, marginRight: 8 }}>{m.title}</Text>

                                <TouchableOpacity onPress={() => handleEditMarker(m)} style={{ padding: 6, backgroundColor: '#3b82f6', borderRadius: 10, marginRight: 6 }}>
                                    <MaterialCommunityIcons name="pencil" size={14} color="#fff" />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => handleDeleteMarker(m.id, m.title)} style={{ padding: 6, backgroundColor: '#dc2626', borderRadius: 10 }}>
                                    <MaterialCommunityIcons name="close" size={14} color="#fff" />
                                </TouchableOpacity>
                            </TouchableOpacity>
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
            <Modal visible={metricsModalVisible} animationType="slide" transparent={true} onRequestClose={() => setMetricsModalVisible(false)}>
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Atualizar Métricas</Text>
                            <TouchableOpacity onPress={() => setMetricsModalVisible(false)}>
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
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
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <Text style={{ color: colors.text }}>{months[parseInt(manualMetrics.month)].label}</Text>
                                    <MaterialCommunityIcons name={monthPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
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
                                                    paddingVertical: 12,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: manualMetrics.month === m.value ? colors.primary : 'transparent',
                                                    borderRadius: 8,
                                                }}
                                            >
                                                <Text style={{
                                                    color: manualMetrics.month === m.value ? '#fff' : colors.text,
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
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <Text style={{ color: colors.text }}>{manualMetrics.year}</Text>
                                    <MaterialCommunityIcons name={yearPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
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
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 10,
                                                    margin: 4,
                                                    backgroundColor: manualMetrics.year === y ? colors.primary : colors.background,
                                                    borderRadius: 8,
                                                    borderWidth: 1,
                                                    borderColor: colors.border
                                                }}
                                            >
                                                <Text style={{
                                                    color: manualMetrics.year === y ? '#fff' : colors.text,
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

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                            <View style={[styles.formGroup, { width: '48%' }]}>
                                <Text style={[styles.label, { color: colors.text }]}>Resíduos (kg)</Text>
                                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={manualMetrics.waste} onChangeText={t => setManualMetrics({ ...manualMetrics, waste: t })} />
                            </View>
                            <View style={[styles.formGroup, { width: '48%' }]}>
                                <Text style={[styles.label, { color: colors.text }]}>Energia (kWh)</Text>
                                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={manualMetrics.energy} onChangeText={t => setManualMetrics({ ...manualMetrics, energy: t })} />
                            </View>
                            <View style={[styles.formGroup, { width: '100%' }]}>
                                <Text style={[styles.label, { color: colors.text }]}>Impostos Abatidos (R$)</Text>
                                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} keyboardType="numeric" value={manualMetrics.tax} onChangeText={t => setManualMetrics({ ...manualMetrics, tax: t })} />
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSaveManualMetrics}>
                            <Text style={styles.primaryButtonText}>Salvar Dados</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal >

            {/* Action Menu (Long Press) */}
            <Modal
                visible={actionModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setActionModalVisible(false)}
            >
                <TouchableOpacity
                    style={[styles.modalOverlay, { justifyContent: 'flex-end', paddingBottom: 30 }]}
                    activeOpacity={1}
                    onPress={() => setActionModalVisible(false)}
                >
                    <View style={[{ backgroundColor: colors.cardBackground, width: '90%', borderRadius: 16, overflow: 'hidden', alignSelf: 'center' }]} onStartShouldSetResponder={() => true}>
                        <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>Opções de Manutenção</Text>
                            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{selectedMaintenance?.title}</Text>
                        </View>

                        {selectedMaintenance?.status === 'pending' && (
                            <TouchableOpacity
                                style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                onPress={() => {
                                    setActionModalVisible(false);
                                    if (selectedMaintenance) {
                                        telemetryRef.current?.edit(selectedMaintenance.raw);
                                    }
                                }}
                            >
                                <MaterialCommunityIcons name="pencil" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>Editar Informações</Text>
                            </TouchableOpacity>
                        )}

                        {selectedMaintenance?.status === 'pending' && (
                            <TouchableOpacity
                                style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                                onPress={() => {
                                    setActionModalVisible(false);
                                    if (selectedMaintenance) handleMarkAsDone(selectedMaintenance.id);
                                }}
                            >
                                <MaterialCommunityIcons name="check-circle" size={20} color="#16a34a" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 16, color: '#16a34a', fontWeight: 'bold' }}>Marcar como Concluída</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={{ paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                            onPress={() => {
                                setActionModalVisible(false);
                                if (selectedMaintenance) handleDelete(selectedMaintenance.id);
                            }}
                        >
                            <MaterialCommunityIcons name="delete-outline" size={20} color="#dc2626" style={{ marginRight: 8 }} />
                            <Text style={{ fontSize: 16, color: '#dc2626', fontWeight: 'bold' }}>Apagar Agenda</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={{ backgroundColor: colors.cardBackground, width: '90%', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 12, alignSelf: 'center' }}
                        onPress={() => setActionModalVisible(false)}
                    >
                        <Text style={{ fontSize: 16, color: '#3b82f6', fontWeight: 'bold' }}>Cancelar</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal >

            {/* Modal de Configuração de Exportação */}
            <Modal
                visible={exportModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setExportModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Configurar Relatório</Text>
                            <TouchableOpacity onPress={() => setExportModalVisible(false)}>
                                <MaterialCommunityIcons name="close" size={24} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 20 }]}>
                            Escolha o período para o arquivo {pendingExportType?.toUpperCase()}.
                        </Text>

                        <View style={{ gap: 12, marginBottom: 24 }}>
                            <TouchableOpacity
                                onPress={() => setExportPeriodType("12months")}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: exportPeriodType === "12months" ? colors.primary : colors.border,
                                    backgroundColor: exportPeriodType === "12months" ? colors.primary + '10' : 'transparent'
                                }}
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
                                }}>
                                    {exportPeriodType === "12months" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                                <View>
                                    <Text style={{ fontWeight: 'bold', color: colors.text }}>Últimos 12 Meses</Text>
                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Resumo consolidado do último ano</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setExportPeriodType("specific")}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: 16,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: exportPeriodType === "specific" ? colors.primary : colors.border,
                                    backgroundColor: exportPeriodType === "specific" ? colors.primary + '10' : 'transparent'
                                }}
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
                                }}>
                                    {exportPeriodType === "specific" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />}
                                </View>
                                <View>
                                    <Text style={{ fontWeight: 'bold', color: colors.text }}>Mês Específico</Text>
                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Dados de um período único</Text>
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
                                            padding: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <Text style={{ color: colors.text }}>{months[parseInt(exportMonth)].label}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />
                                    </TouchableOpacity>

                                    {exportMonthPickerVisible && (
                                        <View style={{
                                            position: 'absolute', bottom: '100%', left: 0, width: 200,
                                            backgroundColor: colors.cardBackground, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                                            padding: 8, flexDirection: 'row', flexWrap: 'wrap', zIndex: 1000, elevation: 10
                                        }}>
                                            {months.map((m) => (
                                                <TouchableOpacity
                                                    key={m.value}
                                                    onPress={() => { setExportMonth(m.value); setExportMonthPickerVisible(false); }}
                                                    style={{ width: '33.3%', paddingVertical: 10, alignItems: 'center' }}
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
                                            padding: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            flexDirection: 'row',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <Text style={{ color: colors.text }}>{exportYear}</Text>
                                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />
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
                                                    style={{ paddingVertical: 10, alignItems: 'center' }}
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
                            onPress={() => {
                                setExportModalVisible(false);
                                if (pendingExportType === "pdf") handleExportPDF();
                                else if (pendingExportType === "excel") handleExportExcel();
                                else if (pendingExportType === "csv") handleExportCSV();
                            }}
                            disabled={exportLoading}
                            style={[styles.primaryButton, { backgroundColor: colors.primary, flexDirection: 'row', gap: 10, marginBottom: 30 }]}
                        >
                            {exportLoading && <ActivityIndicator size="small" color="#fff" />}
                            <Text style={styles.primaryButtonText}>{exportLoading ? "Processando..." : "Gerar Arquivo"}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal de Ordenação dos Cards */}
            <Modal visible={isOrderModalVisible} animationType="slide" transparent={true} onRequestClose={() => setOrderModalVisible(false)}>
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Ordenar Visão Geral</Text>
                            <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>Altere a ordem de exibição dos painéis principais.</Text>

                        <View style={{ gap: 8, marginBottom: 24 }}>
                            {tempOrder.map((key, index) => {
                                let emoji = '';
                                if (key === 'waste') emoji = '💧';
                                if (key === 'energy') emoji = '⚡';
                                if (key === 'tax') emoji = '💰';
                                if (key === 'efficiency') emoji = '🌿';

                                return (
                                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: data[key].color, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' }}>{index + 1}. {emoji} {getCardTitle(key)}</Text>
                                        <View style={{ flexDirection: 'row', gap: 4 }}>
                                            <TouchableOpacity
                                                style={{ backgroundColor: index === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: index === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)' }}
                                                onPress={() => moveCard(index, 'up')}
                                                disabled={index === 0}
                                            >
                                                <MaterialCommunityIcons name="chevron-up" size={20} color={index === 0 ? 'rgba(255,255,255,0.4)' : '#fff'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={{ backgroundColor: index === tempOrder.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: index === tempOrder.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)' }}
                                                onPress={() => moveCard(index, 'down')}
                                                disabled={index === tempOrder.length - 1}
                                            >
                                                <MaterialCommunityIcons name="chevron-down" size={20} color={index === tempOrder.length - 1 ? 'rgba(255,255,255,0.4)' : '#fff'} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )
                            })}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border, flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' }]} onPress={resetCardOrder}>
                                <Text style={[styles.cancelText, { color: colors.textMuted, fontWeight: '600' }]}>Restaurar Padrão</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary, marginTop: 0 }]} onPress={() => saveCardOrder(cardOrder, tempOrder)}>
                                <Text style={styles.primaryButtonText}>Salvar Ordem</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <TelemetryWidget
                ref={telemetryRef}
                onAddMaintenance={() => loadDashboardData()}
                alertsEnabled={alertsEnabled}
            />
        </View>
    )
}

const TelemetryWidget = React.forwardRef<any, { onAddMaintenance?: () => void, alertsEnabled: boolean }>(({ onAddMaintenance, alertsEnabled }, ref) => {
    const { colors } = useTheme();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [temp, setTemp] = useState(35);
    const [pressure, setPressure] = useState(1.5);
    const [ph, setPh] = useState(7.0);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
    const [maintenanceStep, setMaintenanceStep] = useState(1);
    const [alertSent, setAlertSent] = useState(false);
    const [maintenanceForm, setMaintenanceForm] = useState({
        name: '',
        email: '',
        phone: '',
        priority: 'Média - Problema técnico',
        description: '',
        date: '',
        time: ''
    });

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

    const handleScheduleMaintenance = async () => {
        if (!maintenanceForm.name || !maintenanceForm.date || !maintenanceForm.time) {
            Alert.alert("Erro", "Por favor, preencha nome, data (DD/MM/AAAA) e hora (HH:MM).");
            return;
        }

        let dtIso = '';
        try {
            const parts = maintenanceForm.date.split('/');
            if (parts.length === 3) {
                const [dd, mm, yyyy] = parts;
                dtIso = new Date(`${yyyy}-${mm}-${dd}T${maintenanceForm.time}:00`).toISOString();
            } else {
                throw new Error("Formato inválido");
            }
        } catch {
            Alert.alert("Erro", "Formato de data inválido. Use DD/MM/AAAA.");
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                if (editingId) {
                    const { error } = await supabase.from('maintenance_schedules').update({
                        name: maintenanceForm.name,
                        email: maintenanceForm.email,
                        phone: maintenanceForm.phone,
                        priority: maintenanceForm.priority,
                        description: maintenanceForm.description,
                        scheduled_date: dtIso
                    }).eq('id', editingId);

                    if (error) {
                        Alert.alert("Erro ao atualizar", "Erro no banco: " + error.message);
                        return;
                    }
                } else {
                    const { error } = await supabase.from('maintenance_schedules').insert([{
                        user_id: user.id,
                        name: maintenanceForm.name,
                        email: maintenanceForm.email,
                        phone: maintenanceForm.phone,
                        priority: maintenanceForm.priority,
                        description: maintenanceForm.description,
                        scheduled_date: dtIso,
                        status: 'pending'
                    }]);

                    if (error) {
                        Alert.alert("Erro ao salvar", "Erro no banco: " + error.message);
                        return;
                    }
                }
            } else {
                Alert.alert("Aviso", "Usuário não autenticado. Faça login novamente.");
                return;
            }

            if (onAddMaintenance) {
                onAddMaintenance(); // Trigger fetch
            }

            Alert.alert("Sucesso", editingId ? "Manutenção atualizada!" : "Manutenção agendada com sucesso!");
            setMaintenanceModalVisible(false);
            setEditingId(null);
            setMaintenanceStep(1);
            setMaintenanceForm({ name: '', email: '', phone: '', priority: 'Média - Problema técnico', description: '', date: '', time: '' });
        } catch (error) {
            console.log(error);
            Alert.alert("Erro", "Não foi possível agendar a manutenção. Tente novamente.");
        }
    }

    // Animação para o ícone M/Alerta
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeElapsed((prev) => (prev + 1) % 13);
            if (timeElapsed >= 5 && timeElapsed < 10) {
                setTemp((prev) => prev + 1.5);
            } else if (timeElapsed >= 10) {
                setTemp((prev) => Math.max(35, prev - 1.2));
            } else {
                setTemp((prev) => Math.max(34.5, Math.min(35.5, prev + (Math.random() - 0.5) * 0.5)));
            }
            setPressure((prev) => Math.max(1.3, Math.min(1.7, prev + (Math.random() - 0.5) * 0.1)));
            setPh((prev) => Math.max(6.8, Math.min(7.2, prev + (Math.random() - 0.5) * 0.1)));
        }, 2000);
        return () => clearInterval(interval);
    }, [timeElapsed]);

    // Força abrir automaticamente se tiver temperatura crítica
    useEffect(() => {
        if (temp > 40) {
            if (alertsEnabled) {
                setExpanded(true);
            }
            if (!alertSent) {
                setAlertSent(true);
                supabase.auth.getUser().then(({ data: { user } }) => {
                    if (user) {
                        supabase.from('sensor_alerts').insert([{
                            user_id: user.id,
                            sensor_type: 'Temperatura',
                            message: `Temperatura atingiu ${temp.toFixed(1)}°C - Risco Crítico`,
                            alert_level: 'critico'
                        }]).then();
                    }
                });
            }
        } else if (temp < 38) {
            setAlertSent(false);
        }
    }, [temp, alertSent]);

    // Ativa animação
    useEffect(() => {
        if (temp > 40 && !expanded) {
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
    }, [temp, expanded]);

    const isCritical = temp > 40;

    return (
        <View style={{ position: 'absolute', bottom: 100, right: 20, zIndex: 999, alignItems: 'flex-end' }}>
            {expanded && (
                <View style={{ width: 280, backgroundColor: colors.cardBackground, borderRadius: 12, padding: 16, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: isCritical ? '#fecaca' : colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Monitoramento</Text>
                        <TouchableOpacity onPress={() => setExpanded(false)}>
                            <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Linhas de Dados */}
                    <View style={{ gap: 12, marginBottom: isCritical ? 16 : 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>🌡️ Temperatura</Text>
                            <Text style={{ color: isCritical ? '#dc2626' : colors.text, fontWeight: 'bold' }}>{temp.toFixed(1)}°C</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>⏱️ Pressão</Text>
                            <Text style={{ color: colors.text, fontWeight: 'bold' }}>{pressure.toFixed(2)} bar</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>💧 pH</Text>
                            <Text style={{ color: colors.text, fontWeight: 'bold' }}>{ph.toFixed(1)}</Text>
                        </View>
                    </View>

                    {/* Alerta Crítico Embutido */}
                    {isCritical && (
                        <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' }}>
                            <Text style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>⚠️ Temperatura Crítica!</Text>
                            <Text style={{ color: '#991b1b', fontSize: 11, marginBottom: 10 }}>Notificação enviada ao responsável.</Text>
                            <TouchableOpacity style={{ backgroundColor: '#dc2626', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => setMaintenanceModalVisible(true)}>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Solicitar Manutenção</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* Modal de Agendamento de Manutenção */}
            <Modal
                visible={maintenanceModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setMaintenanceModalVisible(false)}
            >
                <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '90%', maxWidth: 400 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Agendar Manutenção</Text>
                            <TouchableOpacity onPress={() => setMaintenanceModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ width: '100%', maxHeight: 450 }} showsVerticalScrollIndicator={false}>
                            {/* Indicador de passos */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 10 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 1 ? '#16a34a' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 1 ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 'bold' }}>1</Text></View>
                                <View style={{ flex: 1, height: 3, backgroundColor: maintenanceStep >= 2 ? '#16a34a' : '#e5e7eb' }} />
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 2 ? '#16a34a' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 2 ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 'bold' }}>2</Text></View>
                                <View style={{ flex: 1, height: 3, backgroundColor: maintenanceStep >= 3 ? '#16a34a' : '#e5e7eb' }} />
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: maintenanceStep >= 3 ? '#16a34a' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: maintenanceStep >= 3 ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 'bold' }}>3</Text></View>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 5, marginBottom: 20 }}>
                                <Text style={{ fontSize: 10, color: colors.textMuted }}>Dados</Text>
                                <Text style={{ fontSize: 10, color: colors.textMuted }}>Problema</Text>
                                <Text style={{ fontSize: 10, color: colors.textMuted }}>Agenda</Text>
                            </View>

                            {maintenanceStep === 1 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]}>Seus dados</Text>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Nome Completo</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                            value={maintenanceForm.name}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, name: t })}
                                            placeholder="Ex: João da Silva"
                                            placeholderTextColor={colors.textMuted}
                                        />
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                            value={maintenanceForm.email}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, email: t })}
                                            placeholder="Ex: joao@email.com"
                                            keyboardType="email-address"
                                            placeholderTextColor={colors.textMuted}
                                        />
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Telefone</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                            value={maintenanceForm.phone}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, phone: t })}
                                            placeholder="Ex: 11 99999-9999"
                                            keyboardType="phone-pad"
                                            placeholderTextColor={colors.textMuted}
                                        />
                                    </View>
                                </View>
                            )}

                            {maintenanceStep === 2 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]}>Descreva o problema</Text>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Prioridade</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                            {['Baixa', 'Média', 'Alta', 'Urgente'].map((level) => {
                                                const isSelected = maintenanceForm.priority.startsWith(level);
                                                return (
                                                    <TouchableOpacity
                                                        key={level}
                                                        style={[
                                                            styles.urgencyBtn,
                                                            { borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 },
                                                            isSelected && { backgroundColor: level === 'Alta' || level === 'Urgente' ? '#fee2e2' : colors.primaryLight, borderColor: level === 'Alta' || level === 'Urgente' ? '#ef4444' : colors.primary }
                                                        ]}
                                                        onPress={() => setMaintenanceForm({ ...maintenanceForm, priority: `${level} - Problema técnico` })}
                                                    >
                                                        <Text style={[
                                                            { fontSize: 12, color: colors.text },
                                                            isSelected && { color: level === 'Alta' || level === 'Urgente' ? '#b91c1c' : colors.primary, fontWeight: 'bold' }
                                                        ]}>{level}</Text>
                                                    </TouchableOpacity>
                                                )
                                            })}
                                        </View>
                                    </View>
                                    <View style={styles.formGroup}>
                                        <Text style={[styles.label, { color: colors.text }]}>Descrição Detalhada</Text>
                                        <TextInput
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, height: 90 }]}
                                            value={maintenanceForm.description}
                                            onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, description: t })}
                                            placeholder="Descreva o que está ocorrendo..."
                                            placeholderTextColor={colors.textMuted}
                                            multiline
                                            textAlignVertical="top"
                                        />
                                    </View>
                                </View>
                            )}

                            {maintenanceStep === 3 && (
                                <View>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: 'bold', marginBottom: 16 }]}>Quando podemos te ajudar?</Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={[styles.formGroup, { flex: 1 }]}>
                                            <Text style={[styles.label, { color: colors.text }]}>Data Preferida</Text>
                                            <TextInput
                                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                                            />
                                        </View>
                                        <View style={[styles.formGroup, { flex: 1 }]}>
                                            <Text style={[styles.label, { color: colors.text }]}>Horário</Text>
                                            <TextInput
                                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
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
                                    <TouchableOpacity style={[styles.primaryButton, { flex: 0.4, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]} onPress={() => setMaintenanceStep(s => s - 1)}>
                                        <Text style={[styles.primaryButtonText, { color: colors.text }]}>Voltar</Text>
                                    </TouchableOpacity>
                                ) : <View style={{ flex: 0.4 }} />}

                                {maintenanceStep < 3 ? (
                                    <TouchableOpacity style={[styles.primaryButton, { flex: 0.5, backgroundColor: '#16a34a' }]} onPress={() => setMaintenanceStep(s => s + 1)}>
                                        <Text style={styles.primaryButtonText}>Próximo</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={[styles.primaryButton, { flex: 0.6, backgroundColor: '#16a34a' }]} onPress={handleScheduleMaintenance}>
                                        <Text style={styles.primaryButtonText}>Confirmar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {!expanded && (
                <TouchableOpacity
                    style={{
                        backgroundColor: isCritical ? '#dc2626' : colors.cardBackground,
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
                        borderColor: isCritical ? '#b91c1c' : colors.border
                    }}
                    onPress={() => setExpanded(true)}
                >
                    {isCritical ? (
                        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', position: 'absolute', top: -2, right: -2 }} />
                            <Text style={{ fontSize: 16 }}>⚠️</Text>
                        </Animated.View>
                    ) : (
                        <Text style={{ fontSize: 16 }}>📡</Text>
                    )}
                    <Text style={{ fontWeight: '700', color: isCritical ? '#fff' : colors.text, fontSize: 13 }}>
                        {isCritical ? 'Alerta Crítico' : 'Sensores'}
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
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            style={styles.chartBarContainer}
        >
            {isHighlight && details && (
                <View style={{
                    position: 'absolute',
                    bottom: 110,
                    backgroundColor: colors.cardBackground,
                    padding: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    width: 100,
                    zIndex: 50,
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 4
                }}>
                    <Text style={{ fontSize: 9, color: colors.text, fontWeight: 'bold', marginBottom: 2 }}>{month}</Text>
                    {(selectedTab === 'all' || selectedTab === 'energy') && <Text style={{ fontSize: 8, color: '#eab308' }}>⚡ {details.energy} kWh</Text>}
                    {(selectedTab === 'all' || selectedTab === 'waste') && <Text style={{ fontSize: 8, color: '#22c55e' }}>💧 {details.waste} kg</Text>}
                    {(selectedTab === 'all' || selectedTab === 'tax') && <Text style={{ fontSize: 8, color: '#3b82f6' }}>💰 R$ {details.tax}</Text>}
                </View>
            )}
            <View style={styles.barsArea}>
                {(selectedTab === 'all' || selectedTab === 'energy') && <View style={[styles.chartBar, { height: `${vals[0]}%`, backgroundColor: '#eab308' }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
                {(selectedTab === 'all' || selectedTab === 'waste') && <View style={[styles.chartBar, { height: `${vals[1]}%`, backgroundColor: '#22c55e' }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
                {(selectedTab === 'all' || selectedTab === 'tax') && <View style={[styles.chartBar, { height: `${vals[2]}%`, backgroundColor: '#3b82f6' }, isHighlight && { opacity: 1 }, !isHighlight && isAnySelected && { opacity: 0.5 }]} />}
            </View>
            <Text style={[styles.chartLabel, { color: colors.textMuted }, isHighlight && { color: colors.primary, fontWeight: 'bold' }]}>{month}</Text>
        </TouchableOpacity>
    )
}

function StatCard({ title, value, unit, changePercent, increasing, iconName, iconProvider, color, bgColor }: any) {
    const { colors, theme } = useTheme();
    // No modo escuro, os ícones de métrica podem ficar melhor combinados usando bgColor como semi-transparente 
    // ou mantemos o original que já parece bem vibrante no design escuro.
    const iconBackground = theme === 'dark' ? colors.iconBg : bgColor;

    return (
        <View style={[styles.card, { width: '48%', backgroundColor: colors.cardBackground }]}>
            <View style={styles.cardHeader}>
                <View style={[styles.iconBg, { backgroundColor: iconBackground }]}>
                    <MaterialCommunityIcons name={iconName || 'alert'} size={24} color={color} />
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
                <Text style={{ color: increasing ? '#16a34a' : '#dc2626', fontSize: 11, fontWeight: '700' }}>
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
        fontWeight: '500',
        opacity: 0.7,
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
        color: '#ca8a04',
        backgroundColor: '#fef08a',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDone: {
        fontSize: 11,
        fontWeight: '700',
        color: '#16a34a',
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
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: '#f1f5f9',
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
