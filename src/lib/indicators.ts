export interface IndicatorRow {
    measured_at?: string
    [key: string]: any
}

/**
 * Seleciona o indicador do mês mais recente até o mês atual (evitando datas futuras).
 * Caso todos os registros estejam no futuro, retorna o mais próximo de hoje.
 */
export function selectMostRecentIndicator<T extends IndicatorRow>(
    rows: T[],
    now: Date = new Date()
): T | undefined {
    if (!rows || rows.length === 0) return undefined

    const currentYearMonth = now.getFullYear() * 12 + now.getMonth()
    const valid = rows
        .map((row) => ({
            row,
            date: row.measured_at ? new Date(row.measured_at) : new Date(NaN),
        }))
        .filter((item) => !isNaN(item.date.getTime()))

    if (valid.length === 0) return rows[0]

    const upToCurrentMonth = valid.filter(({ date }) => {
        const ym = date.getFullYear() * 12 + date.getMonth()
        return ym <= currentYearMonth
    })

    if (upToCurrentMonth.length > 0) {
        upToCurrentMonth.sort((a, b) => b.date.getTime() - a.date.getTime())
        return upToCurrentMonth[0].row
    }

    valid.sort((a, b) => a.date.getTime() - b.date.getTime())
    return valid[0].row
}
