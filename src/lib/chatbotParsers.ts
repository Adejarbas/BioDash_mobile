export const normalizeStr = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const padDate = (n: number) => String(n).padStart(2, '0')

export const parseMonth = (text: string): number | null => {
    const n = normalizeStr(text)
    const names = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    for (let i = 0; i < names.length; i++) if (n.includes(names[i])) return i
    const m = text.match(/\b(\d{1,2})\b/)
    if (m) { const v = parseInt(m[1]); if (v >= 1 && v <= 12) return v - 1 }
    return null
}

export const parseYear = (text: string): number | null => {
    const m = text.match(/\b(20\d{2})\b/)
    if (m) return parseInt(m[1])
    const m2 = text.match(/\b(\d{2})\b/)
    if (m2) return 2000 + parseInt(m2[1])
    return null
}

export const parseNumber = (text: string): number | null => {
    const norm = text.replace(',', '.')
    const m = norm.match(/\d+(?:\.\d+)?/)
    return m ? parseFloat(m[0]) : null
}

export const parsePriority = (text: string): string | null => {
    const n = normalizeStr(text).trim()
    if (n === '1' || ['alta', 'alto', 'urgente', 'urgencia', 'critica', 'critico', 'importante'].some(w => n.includes(w))) return 'high'
    if (n === '2' || ['media', 'medio', 'moderada', 'moderado', 'normal', 'intermediaria', 'padrao'].some(w => n.includes(w))) return 'medium'
    if (n === '3' || ['baixa', 'baixo', 'leve', 'pequena', 'pequeno', 'tranquila', 'tranquilo'].some(w => n.includes(w))) return 'low'
    return null
}

export const parseDate = (text: string): { date: Date; label: string } | null => {
    const norm = normalizeStr(text).trim()
    const now = new Date()

    // 1. Termos relativos diretos
    if (norm === 'hoje' || norm === 'para hoje' || norm === 'de hoje' || norm === 'pra hoje') {
        return {
            date: now,
            label: `${padDate(now.getDate())}/${padDate(now.getMonth() + 1)}/${now.getFullYear()}`,
        }
    }
    if (norm === 'amanha' || norm === 'para amanha' || norm === 'de amanha' || norm === 'pra amanha') {
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return {
            date: tomorrow,
            label: `${padDate(tomorrow.getDate())}/${padDate(tomorrow.getMonth() + 1)}/${tomorrow.getFullYear()}`,
        }
    }
    if (norm === 'depois de amanha' || norm === 'para depois de amanha' || norm === 'pra depois de amanha') {
        const afterTomorrow = new Date(now)
        afterTomorrow.setDate(afterTomorrow.getDate() + 2)
        return {
            date: afterTomorrow,
            label: `${padDate(afterTomorrow.getDate())}/${padDate(afterTomorrow.getMonth() + 1)}/${afterTomorrow.getFullYear()}`,
        }
    }
    if (norm === 'ontem' || norm === 'de ontem' || norm === 'pra ontem') {
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        return {
            date: yesterday,
            label: `${padDate(yesterday.getDate())}/${padDate(yesterday.getMonth() + 1)}/${yesterday.getFullYear()}`,
        }
    }

    // 2. Formato numérico: DD/MM/AAAA, DD/MM/AA ou DD/MM
    const dm = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
    if (dm) {
        const day = parseInt(dm[1], 10)
        const month = parseInt(dm[2], 10) - 1
        let year = dm[3] ? parseInt(dm[3], 10) : now.getFullYear()
        if (year < 100) year += 2000

        const candidate = new Date(year, month, day)
        if (
            candidate.getFullYear() === year &&
            candidate.getMonth() === month &&
            candidate.getDate() === day
        ) {
            return {
                date: candidate,
                label: `${padDate(day)}/${padDate(month + 1)}/${year}`,
            }
        }
        return null
    }

    // 3. Formato textual: ex "25 de outubro de 2025", "25 de outubro", "dia 5 de maio"
    const month = parseMonth(text)
    if (month !== null) {
        const year = parseYear(text) ?? now.getFullYear()
        const textWithoutYear = text.replace(/\b20\d{2}\b/, '')
        const dayMatch = textWithoutYear.match(/\b([1-9]|[12]\d|3[01])\b/)
        if (dayMatch) {
            const day = parseInt(dayMatch[1], 10)
            const candidate = new Date(year, month, day)
            if (
                candidate.getFullYear() === year &&
                candidate.getMonth() === month &&
                candidate.getDate() === day
            ) {
                return {
                    date: candidate,
                    label: `${padDate(day)}/${padDate(month + 1)}/${year}`,
                }
            }
        }
    }

    return null
}

export const normalizeReply = (text: string) =>
    normalizeStr(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

export const matchesReply = (text: string, options: string[]) => {
    const normalized = normalizeReply(text)
    return options.some(option => normalized === option || normalized.startsWith(`${option} `))
}

export const isConfirm = (text: string): boolean =>
    matchesReply(text, ['sim', 's', 'yes', 'confirmar', 'confirmo', 'ok', 'pode', 'certo', 'correto', 'isso', 'exato', 'claro', 'ta bom'])

export const isCancel = (text: string): boolean =>
    matchesReply(text, ['nao', 'n', 'no', 'cancelar', 'cancela', 'desistir', 'para', 'chega', 'voltar', 'esqueca', 'nao quero'])
