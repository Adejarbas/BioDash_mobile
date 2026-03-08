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
    FlatList
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ViewShot from 'react-native-view-shot'
import { supabase } from '../lib/supabase'
import MapComponent from '../components/MapComponent'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { useTheme } from '../context/ThemeContext'

interface MetricData {
    value: number
    changePercent: string
    increasing: boolean
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

function formatMetric(current: number, previous: number): MetricData {
    const change = calculateChange(current, previous)
    return {
        value: current,
        changePercent: `${Math.abs(change).toFixed(1)}% `,
        increasing: change >= 0,
    }
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
    const [cepLoading, setCepLoading] = useState(false)
    const [chartData, setChartData] = useState<ChartPoint[]>([])

    interface MarkerData { id: string; latitude: number; longitude: number; title: string; description: string; }
    const [mapMarkers, setMapMarkers] = useState<MarkerData[]>([]);

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
        energy: { value: 0, changePercent: '0%', increasing: true },
        waste: { value: 0, changePercent: '0%', increasing: true },
        tax: { value: 0, changePercent: '0%', increasing: true },
        efficiency: { value: 0, changePercent: '0%', increasing: true },
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

    const loadUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        setUserEmail(user?.email ?? 'admin@biodash.com')
    }

    const loadDashboardData = async () => {
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
                energy: formatMetric(curEnergy, prevEnergy),
                waste: formatMetric(curWaste, prevWaste),
                tax: formatMetric(curTax, prevTax),
                efficiency: formatMetric(curEfficiency, prevEfficiency),
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

    const handleExportPDF = async () => {
        try {
            let chartImageURI = '';
            if (chartRef.current && chartRef.current.capture) {
                chartImageURI = await chartRef.current.capture();
            }

            const metrics = getMetricsArray();
            const rowsHTML = metrics.map(m => `
                <tr style="text-align: center; border-bottom: 1px solid #ddd;">
                    <td style="padding: 12px; font-weight: bold; color: #1f2937;">${m[0]}</td>
                    <td style="padding: 12px; color: #16a34a;">${m[1]}</td>
                    <td style="padding: 12px; color: #64748b;">${m[2]}</td>
                </tr>
            `).join('');

            const chartHTML = chartImageURI ? `<div style="margin-top: 20px; text-align: center;"><img src="data:image/png;base64,${chartImageURI}" style="width: 100%; max-width: 500px; border-radius: 8px;" /></div>` : '';

            const html = `
            <html>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
                    <div style="border-bottom: 3px solid #16a34a; padding-bottom: 20px; margin-bottom: 30px;">
                        <h1 style="color: #16a34a; margin: 0; font-size: 28px;">Relatório Analítico - BioDash</h1>
                        <p style="color: #666; margin-top: 8px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                        <p style="color: #666; margin-top: 4px;">Empresa: ${userEmail}</p>
                    </div>
                    
                    <h2 style="color: #1f2937; margin-bottom: 20px;">Resumo de Desempenho</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                        <tr style="background-color: #f0fdf4; border-bottom: 2px solid #16a34a;">
                            <th style="padding: 12px; text-align: center; color: #16a34a;">Métrica</th>
                            <th style="padding: 12px; text-align: center; color: #16a34a;">Valor Total</th>
                            <th style="padding: 12px; text-align: center; color: #16a34a;">Variação</th>
                        </tr>
                        ${rowsHTML}
                    </table>

                    ${chartImageURI ? `<h2 style="color: #1f2937; margin-bottom: 10px;">Gráfico de Tendências</h2>${chartHTML}` : ''}

                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <h3 style="margin-top: 0; color: #1e40af;">Nota sobre Gráficos</h3>
                        <p style="color: #475569; margin-bottom: 0;">Para visualizar relatórios mais detalhados, acesse a versão Web.</p>
                    </div>

                    <p style="margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center;">Documento oficial e interno - Gerado via BioDash Mobile System</p>
                </body>
            </html>
            `;
            const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 }); // Carta Portrait
            await Sharing.shareAsync(uri, { dialogTitle: 'Compartilhar Relatório PDF' });
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível gerar o PDF: ' + String(error));
        }
    }

    const handleExportExcel = async () => {
        try {
            const metrics = getMetricsArray();
            let csvContent = "Metrica;Valor Total;Variacao\n";
            metrics.forEach(row => {
                csvContent += `${row[0]};${row[1].replace('R$ ', '')};${row[2]}\n`;
            });

            // @ts-ignore
            const fileUri = FileSystem.cacheDirectory + `biodash_relatorio_${Date.now()}.csv`;
            // @ts-ignore
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar Excel', mimeType: 'text/comma-separated-values' });
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível gerar a planilha Excel');
        }
    }

    const handleExportCSV = async () => {
        try {
            const metrics = getMetricsArray();
            let csvContent = "Metrica,Valor Total,Variacao\n";
            metrics.forEach(row => {
                csvContent += `${row[0]},${row[1].replace('R$ ', '')},${row[2]}\n`;
            });

            // @ts-ignore
            const fileUri = FileSystem.cacheDirectory + `biodash_relatorio_${Date.now()}.csv`;
            // @ts-ignore
            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
            await Sharing.shareAsync(fileUri, { dialogTitle: 'Compartilhar Planilha CSV', mimeType: 'text/csv' });
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível gerar a planilha CSV');
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
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                            📅 Dados referentes a {referenceDate}
                        </Text>
                    </View>
                ) : null}

                {/* Cards em formato 2x2 */}
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
                    <TouchableOpacity style={[styles.exportCard, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]} onPress={handleExportPDF}>
                        <Text style={styles.exportIcon}>📄</Text>
                        <Text style={[styles.exportText, { color: '#dc2626' }]}>Gerar PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.exportCard, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]} onPress={handleExportExcel}>
                        <Text style={styles.exportIcon}>📗</Text>
                        <Text style={[styles.exportText, { color: '#16a34a' }]}>Gerar Excel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.exportCard, { borderColor: '#93c5fd', backgroundColor: '#eff6ff' }]} onPress={handleExportCSV}>
                        <Text style={styles.exportIcon}>📊</Text>
                        <Text style={[styles.exportText, { color: '#2563eb' }]}>Gerar CSV</Text>
                    </TouchableOpacity>
                </View>

                {/* Mapa (Cross-Platform) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32 }}>
                    <View>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Localização da Empresa</Text>
                        <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Unidade ativa do biodigestor.</Text>
                    </View>
                    <TouchableOpacity style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 16 }} onPress={() => setMapModalVisible(true)}>
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


                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                                <TouchableOpacity onPress={() => setMapModalVisible(false)} style={{ padding: 10, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.textMuted, fontWeight: 'bold' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={async () => {
                                        setMapModalVisible(false);

                                        let lat: number | undefined, lon: number | undefined;
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

                                            if (typeof lat === 'number' && typeof lon === 'number') {
                                                setMapMarkers(prev => [...prev, {
                                                    id: Math.random().toString(),
                                                    latitude: lat as number,
                                                    longitude: lon as number,
                                                    title: markerName || 'Nova Instalação',
                                                    description: markerAddress
                                                }]);
                                                setTimeout(() => Alert.alert("Sucesso", `Marcador "${markerName}" adicionado ao mapa!`), 500);
                                            } else {
                                                setTimeout(() => Alert.alert("Aviso", `Coordenadas não encontradas parar este endereço.\nTente preencher sem formatações ou verifique a conexão.`), 500);
                                            }
                                        } catch (e) {
                                            setTimeout(() => Alert.alert("Erro de Conexão", "Não foi possível buscar as coordenadas geográficas."), 500);
                                        }

                                        setMarkerName('');
                                        setMarkerCep('');
                                        setMarkerAddress('');
                                        setMarkerNumber('');
                                    }}
                                    style={{ backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Salvar no Mapa</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                <View style={[styles.card, { padding: 0, overflow: 'hidden', height: 220, backgroundColor: colors.cardBackground }]}>
                    <MapComponent markers={mapMarkers} />
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}></Text>
                </View>
                <View style={{ height: 120 }} />
            </ScrollView >

            {/* Modal de Atualização Manual de Métricas */}
            <Modal visible={metricsModalVisible} animationType="slide" transparent={true} onRequestClose={() => setMetricsModalVisible(false)}>
                <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.cardBackground, width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Atualizar Métricas</Text>
                            <TouchableOpacity onPress={() => setMetricsModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
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
                                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{monthPickerVisible ? '▲' : '▼'}</Text>
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
                                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{yearPickerVisible ? '▲' : '▼'}</Text>
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
                                style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}
                                onPress={() => {
                                    setActionModalVisible(false);
                                    if (selectedMaintenance) {
                                        telemetryRef.current?.edit(selectedMaintenance.raw);
                                    }
                                }}
                            >
                                <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>✏️ Editar Informações</Text>
                            </TouchableOpacity>
                        )}

                        {selectedMaintenance?.status === 'pending' && (
                            <TouchableOpacity
                                style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}
                                onPress={() => {
                                    setActionModalVisible(false);
                                    if (selectedMaintenance) handleMarkAsDone(selectedMaintenance.id);
                                }}
                            >
                                <Text style={{ fontSize: 16, color: '#16a34a', fontWeight: 'bold' }}>✅ Marcar como Concluída</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={{ paddingVertical: 18, alignItems: 'center' }}
                            onPress={() => {
                                setActionModalVisible(false);
                                if (selectedMaintenance) handleDelete(selectedMaintenance.id);
                            }}
                        >
                            <Text style={{ fontSize: 16, color: '#dc2626', fontWeight: 'bold' }}>🗑️ Apagar Agenda</Text>
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

            <TelemetryWidget
                ref={telemetryRef}
                onAddMaintenance={() => loadDashboardData()}
                alertsEnabled={alertsEnabled}
            />
        </View >
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

function StatCard({ title, value, unit, changePercent, increasing, emoji, color, bgColor }: any) {
    const { colors, theme } = useTheme();
    // No modo escuro, os ícones de métrica podem ficar melhor combinados usando bgColor como semi-transparente 
    // ou mantemos o original que já parece bem vibrante no design escuro.
    const iconBackground = theme === 'dark' ? colors.iconBg : bgColor;

    return (
        <View style={[styles.card, { width: '48%', backgroundColor: colors.cardBackground }]}>
            <View style={styles.cardHeader}>
                <View style={[styles.iconBg, { backgroundColor: iconBackground }]}>
                    <Text style={styles.iconEmoji}>{emoji}</Text>
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
});
