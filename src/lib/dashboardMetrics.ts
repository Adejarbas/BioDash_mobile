export type CardKey = 'waste' | 'energy' | 'tax' | 'efficiency';

export const DEFAULT_CARD_ORDER: CardKey[] = ['waste', 'energy', 'tax', 'efficiency'];

export const IDEAL_RATIO = 0.8;

export const colorToMetric: Record<CardKey, string> = {
    waste: '#15803d',
    energy: '#a16207',
    tax: '#1d4ed8',
    efficiency: '#047857',
};

export interface MetricData {
    value: number;
    changePercent: string;
    increasing: boolean;
    color: string;
}

export interface MarkerAddressInput {
    id?: string;
    latitude?: number;
    longitude?: number;
    title?: string;
    description?: string;
    address?: any;
}

export function calculateChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

export function formatMetric(current: number, previous: number, key: CardKey): MetricData {
    const change = calculateChange(current, previous);
    return {
        value: current,
        changePercent: `${Math.abs(change).toFixed(1)}% `,
        increasing: change >= 0,
        color: colorToMetric[key],
    };
}

export function calculateEfficiency(energyGenerated: number, wasteProcessed: number): number {
    if (!Number.isFinite(energyGenerated) || !Number.isFinite(wasteProcessed) || wasteProcessed <= 0) {
        return 0;
    }
    return Math.min(((energyGenerated / wasteProcessed) / IDEAL_RATIO) * 100, 100);
}

export function calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Raio da Terra em km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function parseMarkerAddress(address: any): any | null {
    if (!address) return null;
    if (typeof address === 'object') return address;
    if (typeof address === 'string') {
        try {
            const parsed = JSON.parse(address);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

export function getMarkerAddressLines(marker?: MarkerAddressInput | null): string[] {
    if (!marker) return [];

    const addressObj = parseMarkerAddress(marker.address);
    if (addressObj) {
        const street = [addressObj.street, addressObj.number].filter(Boolean).join(', ');
        const locality = [
            addressObj.neighborhood || addressObj.district || addressObj.suburb,
            addressObj.city,
            addressObj.state,
        ]
            .filter(Boolean)
            .join(', ');
        const zip = addressObj.cep || addressObj.zipCode || addressObj.zip;
        const complement = addressObj.complement;

        const lines = [
            street,
            locality,
            zip ? `CEP: ${zip}` : '',
            complement ? `Complemento: ${complement}` : '',
        ].filter((line): line is string => Boolean(line && line.trim()));

        if (lines.length > 0) return lines;
    }

    const fallback = marker.description?.trim();
    return fallback ? [fallback] : ['Endereço não informado.'];
}

export function parseStrictScheduleDateTime(
    dateStr: string,
    timeStr: string
): { iso: string } | { error: string } {
    const dMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dMatch) return { error: 'Formato de data inválido. Use DD/MM/AAAA.' };

    const tMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!tMatch) return { error: 'Formato de horário inválido. Use HH:MM.' };

    const day = Number(dMatch[1]);
    const month = Number(dMatch[2]);
    const year = Number(dMatch[3]);
    const hour = Number(tMatch[1]);
    const minute = Number(tMatch[2]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return { error: 'Data inválida. Verifique o dia e o mês informados.' };
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return { error: 'Horário inválido. Informe valores entre 00:00 e 23:59.' };
    }

    const dt = new Date(year, month - 1, day, hour, minute, 0);
    if (
        dt.getFullYear() !== year ||
        dt.getMonth() !== month - 1 ||
        dt.getDate() !== day
    ) {
        return { error: 'Data inexistente no calendário.' };
    }

    return { iso: dt.toISOString() };
}

export function parseStrictPtBrDate(raw: string): string | null {
    const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const candidate = new Date(year, month - 1, day, 9, 0, 0);
    if (
        candidate.getFullYear() !== year ||
        candidate.getMonth() !== month - 1 ||
        candidate.getDate() !== day
    ) {
        return null;
    }
    return candidate.toISOString();
}

export function processExportHistory(data: any[]) {
    if (!data || data.length === 0) return [];

    const byMonth = new Map<string, { date: Date; w: number; e: number; t: number }>();
    for (const r of data) {
        const d = new Date(r.measured_at ?? r.created_at);
        if (isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const acc = byMonth.get(key) ?? {
            date: new Date(d.getFullYear(), d.getMonth(), 1),
            w: 0,
            e: 0,
            t: 0,
        };
        acc.w += Number(r.waste_processed ?? 0);
        acc.e += Number(r.energy_generated ?? 0);
        acc.t += Number(r.tax_savings ?? 0);
        byMonth.set(key, acc);
    }

    return Array.from(byMonth.values())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((m) => ({
            mes: m.date.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }),
            energia: m.e.toFixed(2),
            residuos: m.w.toFixed(2),
            economia: m.t.toFixed(2),
        }));
}

export function processExportMetrics(data: any[]): string[][] {
    if (!data || data.length === 0) {
        return [
            ['Métrica', 'Valor Total', 'Variação'],
            ['Sem dados no período', '-', '-'],
        ];
    }

    const totals = data.reduce(
        (acc, curr) => ({
            waste: acc.waste + Number(curr.waste_processed || 0),
            energy: acc.energy + Number(curr.energy_generated || 0),
            tax: acc.tax + Number(curr.tax_savings || 0),
        }),
        { waste: 0, energy: 0, tax: 0 }
    );

    return [
        ['Resíduos Processados (kg)', totals.waste.toFixed(2), '-'],
        ['Energia Gerada (kWh)', totals.energy.toFixed(2), '-'],
        ['Imposto Abatido (BRL)', `R$ ${totals.tax.toFixed(2)}`, '-'],
        ['Total de Registros', data.length.toString(), '-'],
    ];
}

export function maskCNPJ(value: string): string {
    const digits = (value || '').replace(/\D/g, '').slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.\d{3}(\d)/, (m, d) => m.slice(0, -1) + '/' + d)
        .replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskPhone(value: string): string {
    const digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
        return digits
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
}

export function maskCEP(value: string): string {
    const digits = (value || '').replace(/\D/g, '').slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, '$1-$2');
}
