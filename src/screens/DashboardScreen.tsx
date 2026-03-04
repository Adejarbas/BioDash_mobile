import React, { useEffect, useState } from 'react'
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import MapComponent from '../components/MapComponent'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'

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
    const [data, setData] = useState<DashboardData>({
        energy: { value: 0, changePercent: '0%', increasing: true },
        waste: { value: 0, changePercent: '0%', increasing: true },
        tax: { value: 0, changePercent: '0%', increasing: true },
        efficiency: { value: 0, changePercent: '0%', increasing: true },
    })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [userEmail, setUserEmail] = useState('')

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

    const handleExportPDF = async () => {
        try {
            const html = `
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h1 style="color: #16a34a;">Relatório Analítico - BioDash</h1>
                    <p><b>Data:</b> ${new Date().toLocaleDateString()}</p>
                    <p><b>Empresa:</b> ${userEmail}</p>
                    <hr />
                    <h2>Resumo de Desempenho</h2>
                    <table border="1" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr style="background-color: #f0fdf4;">
                            <th>Resíduos (kg)</th>
                            <th>Energia (kWh)</th>
                            <th>Economia Tributária (R$)</th>
                            <th>Eficiência (%)</th>
                        </tr>
                        <tr style="text-align: center;">
                            <td>${data.waste.value}</td>
                            <td>${data.energy.value}</td>
                            <td>R$ ${data.tax.value}</td>
                            <td>${data.efficiency.value}%</td>
                        </tr>
                    </table>
                    <p style="margin-top: 40px; font-size: 12px; color: #666;">Gerado automaticamente via App BioDash Mobile</p>
                </body>
            </html>
            `;
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri);
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível gerar o PDF');
        }
    }

    const handleExportCSV = async () => {
        try {
            const header = "Data,Residuos Processados(kg),Energia Gerada(kWh),Imposto Abatido(BRL),Eficiencia(%)\n";
            const row = `${new Date().toLocaleDateString()},${data.waste.value},${data.energy.value},${data.tax.value},${data.efficiency.value}\n`;
            const csvContent = header + row;
            const fs: any = FileSystem;
            const fileUri = fs.documentDirectory + "biodash_relatorio.csv";
            await fs.writeAsStringAsync(fileUri, csvContent, { encoding: fs.EncodingType.UTF8 });
            await Sharing.shareAsync(fileUri);
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível gerar a planilha CSV');
        }
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={styles.loadingText}>Coletando sensores...</Text>
            </View>
        )
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
        >
            {/* Header movido pro MainTabs App.tsx, então exibimos apenas um título local */}
            <Text style={styles.sectionTitle}>Dashboard</Text>
            <Text style={styles.sectionSub}>Puxe para atualizar os dados do biodigestor.</Text>

            {/* Cards em formato 2x2 */}
            <View style={styles.grid}>
                <StatCard title="Resíduos" value={data.waste.value.toFixed(1)} unit="kg" changePercent={data.waste.changePercent} increasing={data.waste.increasing} emoji="💧" color="#22c55e" bgColor="#dcfce7" />
                <StatCard title="Energia" value={data.energy.value.toFixed(1)} unit="kWh" changePercent={data.energy.changePercent} increasing={data.energy.increasing} emoji="⚡" color="#eab308" bgColor="#fef9c3" />
                <StatCard title="Impostos" value={`R$ ${data.tax.value.toFixed(0)}`} unit="" changePercent={data.tax.changePercent} increasing={data.tax.increasing} emoji="💰" color="#3b82f6" bgColor="#dbeafe" />
                <StatCard title="Eficiência" value={data.efficiency.value.toFixed(1)} unit="%" changePercent={data.efficiency.changePercent} increasing={data.efficiency.increasing} emoji="🌿" color="#16a34a" bgColor="#bbf7d0" />
            </View>

            {/* Visão Geral (Múltiplas Métricas) */}
            <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Visão Geral</Text>
            <Text style={styles.sectionSub}>Comparativo de Energia, Resíduos e Impostos abatidos.</Text>
            <View style={styles.card}>
                <View style={styles.legendRow}>
                    <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#eab308' }]} /><Text style={styles.legendText}>Energia</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#22c55e' }]} /><Text style={styles.legendText}>Resíduos</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} /><Text style={styles.legendText}>Impos.</Text></View>
                </View>

                <View style={styles.chartMockup}>
                    <MultiBar month="Jan" vals={[40, 50, 30]} />
                    <MultiBar month="Fev" vals={[60, 45, 55]} />
                    <MultiBar month="Mar" vals={[50, 70, 70]} />
                    <MultiBar month="Abr" vals={[80, 80, 85]} />
                    <MultiBar month="Mai" vals={[95, 90, 80]} isHighlight />
                </View>
            </View>

            {/* Manutenção Agendada */}
            <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Manutenção Agendada</Text>
            <Text style={styles.sectionSub}>Próximas revisões operacionais do sistema.</Text>
            <View style={styles.card}>
                <View style={styles.maintenanceItem}>
                    <View style={styles.maintenanceDot} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.maintenanceTitle}>Troca de Filtro H2S</Text>
                        <Text style={styles.maintenanceDate}>Amanhã, 14:00</Text>
                    </View>
                    <Text style={styles.statusPending}>Pendente</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.maintenanceItem}>
                    <View style={[styles.maintenanceDot, { backgroundColor: '#16a34a' }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.maintenanceTitle}>Inspeção de Válvulas</Text>
                        <Text style={styles.maintenanceDate}>12/Março, 09:00</Text>
                    </View>
                    <Text style={styles.statusDone}>Concluído</Text>
                </View>
            </View>

            {/* Mapa (Cross-Platform) */}
            <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Localização</Text>
            <Text style={styles.sectionSub}>Unidade ativa do biodigestor.</Text>
            <View style={[styles.card, { padding: 0, overflow: 'hidden', height: 220 }]}>
                <MapComponent />
            </View>

            {/* Exportar Relatórios */}
            <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Exportar Relatórios</Text>
            <Text style={styles.sectionSub}>Gere métricas oficiais para análise externa.</Text>
            <View style={[styles.gridExport, { marginBottom: 12 }]}>
                <TouchableOpacity style={styles.exportButton} onPress={handleExportPDF}>
                    <Text style={styles.exportIcon}>📄</Text>
                    <Text style={styles.exportText}>Gerar PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.exportButton, { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }]} onPress={handleExportCSV}>
                    <Text style={styles.exportIcon}>📊</Text>
                    <Text style={[styles.exportText, { color: '#16a34a' }]}>Excel / CSV</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>BioDash Mobile System</Text>
            </View>
            <View style={{ height: 60 }} />
        </ScrollView>
    )
}

function MultiBar({ month, vals, isHighlight }: { month: string, vals: number[], isHighlight?: boolean }) {
    return (
        <View style={styles.chartBarContainer}>
            <View style={styles.barsArea}>
                <View style={[styles.chartBar, { height: `${vals[0]}%`, backgroundColor: '#eab308' }]} />
                <View style={[styles.chartBar, { height: `${vals[1]}%`, backgroundColor: '#22c55e' }]} />
                <View style={[styles.chartBar, { height: `${vals[2]}%`, backgroundColor: '#3b82f6' }]} />
            </View>
            <Text style={[styles.chartLabel, isHighlight && { color: '#16a34a', fontWeight: 'bold' }]}>{month}</Text>
        </View>
    )
}

function StatCard({ title, value, unit, changePercent, increasing, emoji, color, bgColor }: any) {
    return (
        <View style={[styles.card, { width: '48%' }]}>
            <View style={styles.cardHeader}>
                <View style={[styles.iconBg, { backgroundColor: bgColor }]}>
                    <Text style={styles.iconEmoji}>{emoji}</Text>
                </View>
            </View>
            <View style={styles.cardValue}>
                <Text style={[styles.valueText, { color }]} numberOfLines={1}>{value}</Text>
                {unit ? <Text style={[styles.unitText, { color }]}>{unit}</Text> : null}
            </View>
            <View style={{ marginTop: 4 }}>
                <Text style={styles.cardTitle}>{title}</Text>
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
        backgroundColor: '#f0fdf4',
    },
    loadingText: {
        marginTop: 12,
        color: '#4ade80',
        fontSize: 14,
    },
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 14,
    },
    gridExport: {
        flexDirection: 'row',
        gap: 14,
    },
    card: {
        backgroundColor: '#ffffff',
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
    exportButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        backgroundColor: '#ffffff',
    },
    exportIcon: {
        fontSize: 16,
        marginRight: 8,
    },
    exportText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
    },
    footer: {
        marginTop: 24,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#86efac',
    },
})
