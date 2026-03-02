import React, { useEffect, useState } from 'react'
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'

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

interface Props {
    onLogout: () => void
}

export default function DashboardScreen({ onLogout }: Props) {
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
        setUserEmail('teste@biodash.com')

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

            if (error || !rows || rows.length === 0) {
                const fallback = await supabase
                    .from('biodigester_indicators')
                    .select('energy_generated, waste_processed, tax_savings, measured_at, created_at')
                    .order('created_at', { ascending: false, nullsFirst: false })
                    .limit(2)
                rows = fallback.data ?? []
            }

            const current = rows?.[0]
            const previous = rows?.[1]

            const curEnergy = Number(current?.energy_generated ?? 0)
            const curWaste = Number(current?.waste_processed ?? 0)
            const curTax = Number(current?.tax_savings ?? 0)
            let curEfficiency = 0
            if (curWaste > 0) {
                curEfficiency = Math.min(((curEnergy / curWaste) / IDEAL_RATIO) * 100, 100)
            }

            const prevEnergy = Number(previous?.energy_generated ?? 0)
            const prevWaste = Number(previous?.waste_processed ?? 0)
            const prevTax = Number(previous?.tax_savings ?? 0)
            let prevEfficiency = 0
            if (prevWaste > 0) {
                prevEfficiency = Math.min(((prevEnergy / prevWaste) / IDEAL_RATIO) * 100, 100)
            }

            setData({
                energy: formatMetric(curEnergy, prevEnergy),
                waste: formatMetric(curWaste, prevWaste),
                tax: formatMetric(curTax, prevTax),
                efficiency: formatMetric(curEfficiency, prevEfficiency),
            })
            */
        } catch (err) {
            console.error('Error loading dashboard data:', err)
        } finally {
            // No modo teste o finally será ignorado em favor do timeout
            // setLoading(false)
            // setRefreshing(false)
        }
    }

    const onRefresh = () => {
        setRefreshing(true)
        loadDashboardData()
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        onLogout()
    }

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={styles.loadingText}>Carregando dados...</Text>
            </View>
        )
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />}
        >
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>🌱 BioDash</Text>
                    <Text style={styles.headerSub}>{userEmail}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>Sair</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Dashboard</Text>
            <Text style={styles.sectionSub}>
                Puxe para baixo para atualizar os dados do biodigestor.
            </Text>

            {/* Cards de métricas */}
            <View style={styles.grid}>
                <StatCard
                    title="Resíduos Processados"
                    value={data.waste.value.toFixed(1)}
                    unit="kg"
                    changePercent={data.waste.changePercent}
                    increasing={data.waste.increasing}
                    emoji="💧"
                    color="#22c55e"
                    bgColor="#dcfce7"
                />
                <StatCard
                    title="Energia Gerada"
                    value={data.energy.value.toFixed(1)}
                    unit="kWh"
                    changePercent={data.energy.changePercent}
                    increasing={data.energy.increasing}
                    emoji="⚡"
                    color="#eab308"
                    bgColor="#fef9c3"
                />
                <StatCard
                    title="Imposto Abatido"
                    value={`R$ ${data.tax.value.toFixed(2)}`}
                    unit=""
                    changePercent={data.tax.changePercent}
                    increasing={data.tax.increasing}
                    emoji="💰"
                    color="#3b82f6"
                    bgColor="#dbeafe"
                />
                <StatCard
                    title="Eficiência do Sistema"
                    value={data.efficiency.value.toFixed(1)}
                    unit="%"
                    changePercent={data.efficiency.changePercent}
                    increasing={data.efficiency.increasing}
                    emoji="🌿"
                    color="#16a34a"
                    bgColor="#bbf7d0"
                />
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Atualização automática a cada 30s</Text>
            </View>
        </ScrollView>
    )
}

interface StatCardProps {
    title: string
    value: string
    unit: string
    changePercent: string
    increasing: boolean
    emoji: string
    color: string
    bgColor: string
}

function StatCard({ title, value, unit, changePercent, increasing, emoji, color, bgColor }: StatCardProps) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{title}</Text>
                <View style={[styles.iconBg, { backgroundColor: bgColor }]}>
                    <Text style={styles.iconEmoji}>{emoji}</Text>
                </View>
            </View>
            <View style={styles.cardValue}>
                <Text style={[styles.valueText, { color }]}>{value}</Text>
                {unit ? <Text style={[styles.unitText, { color }]}>{unit}</Text> : null}
            </View>
            <View style={styles.changeBadge}>
                <Text style={{ color: increasing ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: '600' }}>
                    {increasing ? '▲' : '▼'} {changePercent}
                </Text>
                <Text style={styles.changeLabel}> vs anterior</Text>
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
        paddingTop: 56,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#14532d',
    },
    headerSub: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2,
    },
    logoutBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#fee2e2',
        borderRadius: 8,
    },
    logoutText: {
        color: '#dc2626',
        fontWeight: '600',
        fontSize: 13,
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
        gap: 14,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        flex: 1,
        paddingRight: 8,
    },
    iconBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 20,
    },
    cardValue: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 8,
    },
    valueText: {
        fontSize: 32,
        fontWeight: '800',
    },
    unitText: {
        fontSize: 14,
        fontWeight: '500',
        opacity: 0.7,
    },
    changeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    changeLabel: {
        fontSize: 12,
        color: '#94a3b8',
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
