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
    Animated
} from 'react-native'
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

const IDEAL_RATIO = 0.8

function calculateChange(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
}

function formatMetric(current: number, previous: number): MetricData {
    const change = calculateChange(current, previous)
    return {
        value: current,
        changePercent: `${Math.abs(change).toFixed(1)}%`,
        increasing: change >= 0,
    }
}

export default function DashboardScreen() {
    const insets = useSafeAreaInsets()
    const chartRef = useRef<ViewShot>(null)
    const [isMapModalVisible, setMapModalVisible] = useState(false)
    const [markerName, setMarkerName] = useState('')

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
    const { colors, theme } = useTheme()

    useEffect(() => {
        loadUser()
        loadDashboardData()
        const interval = setInterval(loadDashboardData, 30_000)
        return () => clearInterval(interval)
    }, [])

    const loadUser = async () => {
        // MODO TESTE
        setUserEmail('admin@biodash.com')

        /* 
        const { data: { user } } = await supabase.auth.getUser()
        setUserEmail(user?.email ?? '')
        */
    }

    const loadDashboardData = async () => {
        try {
            // MODO TESTE (sem banco): dados fixos
            setTimeout(() => {
                setData({
                    energy: { value: 92.5, changePercent: '5.2%', increasing: true },
                    waste: { value: 120.0, changePercent: '2.0%', increasing: true },
                    tax: { value: 750.0, changePercent: '1.5%', increasing: false },
                    efficiency: { value: 96.3, changePercent: '0.8%', increasing: true },
                })
                setLoading(false)
                setRefreshing(false)
            }, 1000)

            /* 
            // CÓDIGO ORIGINAL COM SUPABASE
            let { data: rows, error } = await supabase
                .from('biodigester_indicators')
                .select('energy_generated, waste_processed, tax_savings, measured_at, created_at')
                .order('measured_at', { ascending: false, nullsFirst: false })
                .limit(2)

            if (error || !rows || rows.length === 0) { ...fallback... } // CÓDIGO AQUI
            // ... Formata métricas
            */
        } catch (err) {
            console.error('Error loading dashboard data:', err)
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Dashboard</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Puxe para atualizar os dados do biodigestor.</Text>

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
                            <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Impos.</Text></View>
                        </View>
                    )}

                    <ViewShot ref={chartRef} options={{ format: "jpg", quality: 0.9, result: 'base64' }}>
                        <View style={[styles.chartMockup, { backgroundColor: colors.cardBackground }]}>
                            <MultiBar month="Jan" vals={[40, 50, 30]} selectedTab={selectedTab} />
                            <MultiBar month="Fev" vals={[60, 45, 55]} selectedTab={selectedTab} />
                            <MultiBar month="Mar" vals={[50, 70, 70]} selectedTab={selectedTab} />
                            <MultiBar month="Abr" vals={[80, 80, 85]} selectedTab={selectedTab} />
                            <MultiBar month="Mai" vals={[95, 90, 80]} selectedTab={selectedTab} isHighlight />
                        </View>
                    </ViewShot>
                </View>

                {/* Manutenção Agendada */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>Manutenção Agendada</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Próximas revisões operacionais do sistema.</Text>
                <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                    <View style={styles.maintenanceItem}>
                        <View style={styles.maintenanceDot} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.maintenanceTitle, { color: colors.text }]}>Troca de Filtro H2S</Text>
                            <Text style={[styles.maintenanceDate, { color: colors.textMuted }]}>Amanhã, 14:00</Text>
                        </View>
                        <Text style={styles.statusPending}>Pendente</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.maintenanceItem}>
                        <View style={[styles.maintenanceDot, { backgroundColor: '#16a34a' }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.maintenanceTitle, { color: colors.text }]}>Inspeção de Válvulas</Text>
                            <Text style={[styles.maintenanceDate, { color: colors.textMuted }]}>12/Março, 09:00</Text>
                        </View>
                        <Text style={[styles.statusDone, { backgroundColor: colors.primaryLight, color: colors.primaryDark }]}>Concluído</Text>
                    </View>
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
                        <View style={{ backgroundColor: colors.cardBackground, width: '85%', padding: 24, borderRadius: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>Novo Marcador</Text>
                            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>Insira o nome do equipamento para fixá-lo no mapa da sua unidade.</Text>
                            <TextInput
                                style={{ borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: 10, color: colors.text, marginBottom: 24, fontSize: 15 }}
                                placeholder="Ex: Célula Termofílica 01"
                                placeholderTextColor={colors.textMuted}
                                value={markerName}
                                onChangeText={setMarkerName}
                            />
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                                <TouchableOpacity onPress={() => setMapModalVisible(false)} style={{ padding: 10, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.textMuted, fontWeight: 'bold' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => {
                                        setMapModalVisible(false);
                                        setTimeout(() => Alert.alert("Sucesso", "Marcador adicionado ao mapa com sucesso!"), 300);
                                        setMarkerName('');
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
                    <MapComponent />
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>BioDash Mobile System</Text>
                </View>
                <View style={{ height: 120 }} />
            </ScrollView>
            <TelemetryWidget />
        </View>
    )
}

function TelemetryWidget() {
    const { colors } = useTheme();
    const [temp, setTemp] = useState(35);
    const [pressure, setPressure] = useState(1.5);
    const [ph, setPh] = useState(7.0);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [expanded, setExpanded] = useState(false);

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
                            <TouchableOpacity style={{ backgroundColor: '#dc2626', paddingVertical: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => Alert.alert("Suporte", "Manutenção Solicitada para a unidade.")}>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Solicitar Manutenção</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

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
                        <View style={{ backgroundColor: '#16a34a', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>M</Text>
                        </View>
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
    }
})
