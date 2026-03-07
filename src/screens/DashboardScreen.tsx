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
    LayoutAnimation,
    Platform,
    UIManager
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
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
        changePercent: `${Math.abs(change).toFixed(1)}%`,
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
    const [isMapModalVisible, setMapModalVisible] = useState(false)
    const [markerName, setMarkerName] = useState('')
    const [markerCep, setMarkerCep] = useState('')
    const [markerAddress, setMarkerAddress] = useState('')
    const [markerNumber, setMarkerNumber] = useState('')
    const [cepLoading, setCepLoading] = useState(false)
    const [chartData, setChartData] = useState<ChartPoint[]>([])

    // States for custom card ordering
    const [cardOrder, setCardOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)
    const [isOrderModalVisible, setOrderModalVisible] = useState(false)
    const [tempOrder, setTempOrder] = useState<CardKey[]>(DEFAULT_CARD_ORDER)

    interface MarkerData { id: string; latitude: number; longitude: number; title: string; description: string; }
    const [mapMarkers, setMapMarkers] = useState<MarkerData[]>([]);

    const [maintenances, setMaintenances] = useState([
        { id: '1', title: 'Troca de Filtro H2S', date: 'Amanhã, 14:00', status: 'pending' },
        { id: '2', title: 'Inspeção de Válvulas', date: '12/Março, 09:00', status: 'done' }
    ]);

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
        tax: '750'
    })

    const handleSaveManualMetrics = async () => {
        try {
            const { error } = await supabase.from('biodigester_indicators').insert([{
                waste_processed: parseFloat(manualMetrics.waste) || 0,
                energy_generated: parseFloat(manualMetrics.energy) || 0,
                tax_savings: parseFloat(manualMetrics.tax) || 0,
                // Eficiência será calculada nas views, salvamos as primárias
            }])

            if (error) throw error

            setMetricsModalVisible(false)
            Alert.alert("Sucesso", "Métricas registradas com sucesso no Banco de Dados!")

            // Recarrega o dashboard para exibir os novos totais gerados
            loadDashboardData()
        } catch (err) {
            console.error('Save metrics error:', err)
            Alert.alert("Erro", "Não foi possível salvar as métricas no sistema.")
        }
    }
    const { colors, theme } = useTheme()

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
        loadUser()
        loadDashboardData()
        loadCardOrder()
        const interval = setInterval(loadDashboardData, 30_000)
        return () => clearInterval(interval)
    }, [])

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

    const saveCardOrder = async (newOrder: CardKey[]) => {
        try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            await AsyncStorage.setItem('@biodash_card_order', JSON.stringify(newOrder))
            setCardOrder(newOrder)
            setOrderModalVisible(false)
            Alert.alert("Sucesso", "Sua visão geral foi reordenada com sucesso")
        } catch (e) {
            console.error('Error saving order', e)
            Alert.alert('Erro', 'Não foi possível salvar a ordenação.')
        }
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
        try {
            const IDEAL_RATIO = 0.8;

            // --- BUSCA OS 2 ÚLTIMOS REGISTROS PARA OS CARDS DO TOPO ---
            let query = supabase
                .from("biodigester_indicators")
                .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                .order("measured_at", { ascending: false, nullsFirst: false })
                .limit(2);

            let { data: rows, error } = await query;

            if (error || !rows || rows.length === 0) {
                const fallback = await supabase
                    .from("biodigester_indicators")
                    .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                    .order("created_at", { ascending: false, nullsFirst: false })
                    .limit(2);
                rows = fallback.data;
                if (fallback.error) throw fallback.error;
            }

            const current = rows?.[0];
            const previous = rows?.[1];

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

            // --- BUSCA HISTÓRICO DE 12 MESES PARA O GRÁFICO ---
            const since = new Date();
            since.setMonth(since.getMonth() - 12);

            let chartQuery = supabase
                .from("biodigester_indicators")
                .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
                .gte("measured_at", since.toISOString())
                .order("measured_at", { ascending: true });

            let chartRes = await chartQuery;

            if (chartRes.error) {
                const fb = await supabase
                    .from("biodigester_indicators")
                    .select("energy_generated, waste_processed, tax_savings, measured_at, created_at")
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
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.cardBackground, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
                            onPress={openOrderModal}
                        >
                            <Text style={{ color: colors.text, fontSize: 12, fontWeight: 'bold' }}>⚙️ Ordenar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            onPress={() => setMetricsModalVisible(true)}
                        >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✏️ Atualizar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Cards dinâmicos e ordenáveis */}
                <View style={styles.grid}>
                    {cardOrder.map(key => {
                        if (key === 'waste') return <StatCard key="waste" title="Resíduos" value={data.waste.value.toFixed(1)} unit="kg" changePercent={data.waste.changePercent} increasing={data.waste.increasing} emoji="💧" color="#22c55e" bgColor="#dcfce7" />
                        if (key === 'energy') return <StatCard key="energy" title="Energia" value={data.energy.value.toFixed(1)} unit="kWh" changePercent={data.energy.changePercent} increasing={data.energy.increasing} emoji="⚡" color="#eab308" bgColor="#fef9c3" />
                        if (key === 'tax') return <StatCard key="tax" title="Impostos" value={`R$ ${data.tax.value.toFixed(0)}`} unit="" changePercent={data.tax.changePercent} increasing={data.tax.increasing} emoji="💰" color="#3b82f6" bgColor="#dbeafe" />
                        if (key === 'efficiency') return <StatCard key="efficiency" title="Eficiência" value={data.efficiency.value.toFixed(1)} unit="%" changePercent={data.efficiency.changePercent} increasing={data.efficiency.increasing} emoji="🌿" color="#16a34a" bgColor="#bbf7d0" />
                        return null
                    })}
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
                            <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Impos.</Text></View>
                        </View>
                    )}

                    <ViewShot ref={chartRef} options={{ format: "jpg", quality: 0.9, result: 'base64' }}>
                        <View style={[styles.chartMockup, { backgroundColor: colors.cardBackground }]}>
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
                                            isHighlight={index === chartData.length - 1}
                                        />
                                    );
                                })
                            )}
                        </View>
                    </ViewShot>
                </View>

                {/* Manutenção Agendada */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Manutenção Agendada</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Próximas revisões operacionais do sistema.</Text>
                <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                    {maintenances.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <View style={styles.maintenanceItem}>
                                <View style={[styles.maintenanceDot, item.status === 'done' && { backgroundColor: '#16a34a' }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.maintenanceTitle, { color: colors.text }]}>{item.title}</Text>
                                    <Text style={[styles.maintenanceDate, { color: colors.textMuted }]}>{item.date}</Text>
                                </View>
                                <Text style={item.status === 'pending' ? styles.statusPending : [styles.statusDone, { backgroundColor: colors.primaryLight, color: colors.primaryDark }]}>
                                    {item.status === 'pending' ? 'Pendente' : 'Concluído'}
                                </Text>
                            </View>
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
                    <Text style={styles.footerText}>BioDash Mobile System</Text>
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
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>Insira os valores atuais para simular os sensores.</Text>

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
            </Modal>

            <TelemetryWidget onAddMaintenance={(m) => setMaintenances(prev => [m, ...prev])} />

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
                            )})}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border, flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' }]} onPress={resetCardOrder}>
                                <Text style={[styles.cancelText, { color: colors.textMuted, fontWeight: '600' }]}>Restaurar Padrão</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary, marginTop: 0 }]} onPress={() => saveCardOrder(tempOrder)}>
                                <Text style={styles.primaryButtonText}>Salvar Ordem</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    )
}

function TelemetryWidget({ onAddMaintenance }: { onAddMaintenance?: (m: any) => void }) {
    const { colors } = useTheme();
    const [temp, setTemp] = useState(35);
    const [pressure, setPressure] = useState(1.5);
    const [ph, setPh] = useState(7.0);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
    const [maintenanceForm, setMaintenanceForm] = useState({
        equipment: '',
        description: '',
        urgency: 'Alta'
    });

    const handleScheduleMaintenance = () => {
        if (!maintenanceForm.equipment) {
            Alert.alert("Erro", "Por favor, preencha o nome do equipamento.");
            return;
        }

        if (onAddMaintenance) {
            onAddMaintenance({
                id: Math.random().toString(),
                title: maintenanceForm.equipment,
                date: 'Agora (Novo)',
                status: 'pending'
            });
        }

        Alert.alert("Sucesso", "Manutenção agendada e registrada com sucesso!");
        setMaintenanceModalVisible(false);
        setMaintenanceForm({ equipment: '', description: '', urgency: 'Alta' });
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
            setExpanded(true);
        }
    }, [temp]);

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

                        <Text style={[styles.modalSubtitle, { color: colors.textMuted, marginBottom: 16 }]}>
                            Preencha os dados para registrar a solicitação de manutenção imediata.
                        </Text>

                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.text }]}>Equipamento / Setor</Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                                value={maintenanceForm.equipment}
                                onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, equipment: t })}
                                placeholder="Ex: Caldeira Principal"
                                placeholderTextColor={colors.textMuted}
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.text }]}>Descrição do Problema</Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, height: 80 }]}
                                value={maintenanceForm.description}
                                onChangeText={(t) => setMaintenanceForm({ ...maintenanceForm, description: t })}
                                placeholder="Descreva o que está ocorrendo..."
                                placeholderTextColor={colors.textMuted}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: colors.text }]}>Urgência</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {['Baixa', 'Média', 'Alta'].map((level) => (
                                    <TouchableOpacity
                                        key={level}
                                        style={[
                                            styles.urgencyBtn,
                                            { borderColor: colors.border },
                                            maintenanceForm.urgency === level && { backgroundColor: level === 'Alta' ? '#fee2e2' : colors.primaryLight, borderColor: level === 'Alta' ? '#ef4444' : colors.primary }
                                        ]}
                                        onPress={() => setMaintenanceForm({ ...maintenanceForm, urgency: level })}
                                    >
                                        <Text style={[
                                            { fontSize: 12, color: colors.text },
                                            maintenanceForm.urgency === level && { color: level === 'Alta' ? '#b91c1c' : colors.primary, fontWeight: 'bold' }
                                        ]}>{level}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#ef4444', marginTop: 8 }]} onPress={handleScheduleMaintenance}>
                            <Text style={styles.primaryButtonText}>Confirmar Agendamento</Text>
                        </TouchableOpacity>
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
}

function MultiBar({ month, vals, selectedTab, isHighlight }: { month: string, vals: number[], selectedTab: string, isHighlight?: boolean }) {
    const { colors } = useTheme();
    return (
        <View style={styles.chartBarContainer}>
            <View style={styles.barsArea}>
                {(selectedTab === 'all' || selectedTab === 'energy') && <View style={[styles.chartBar, { height: `${vals[0]}%`, backgroundColor: '#eab308' }]} />}
                {(selectedTab === 'all' || selectedTab === 'waste') && <View style={[styles.chartBar, { height: `${vals[1]}%`, backgroundColor: '#22c55e' }]} />}
                {(selectedTab === 'all' || selectedTab === 'tax') && <View style={[styles.chartBar, { height: `${vals[2]}%`, backgroundColor: '#3b82f6' }]} />}
            </View>
            <Text style={[styles.chartLabel, { color: colors.textMuted }, isHighlight && { color: colors.primary, fontWeight: 'bold' }]}>{month}</Text>
        </View>
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
        gap: 2,
        marginBottom: 8,
    },
    chartBar: {
        width: 8,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
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
