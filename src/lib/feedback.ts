import { Alert, Platform } from 'react-native'

export type FeedbackVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastPayload {
    id: string
    title: string
    message: string
    variant: FeedbackVariant
    durationMs: number
}

export interface ConfirmPayload {
    id: string
    title: string
    message: string
    confirmText: string
    destructive: boolean
    onConfirm: () => void
}

type ToastListener = (toast: ToastPayload) => void
type ConfirmListener = (confirm: ConfirmPayload) => void

const toastListeners = new Set<ToastListener>()
const confirmListeners = new Set<ConfirmListener>()

let toastSeq = 0

const normalize = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Infere a variante visual do toast a partir do título da notificação.
 */
export function inferFeedbackVariant(title: string): FeedbackVariant {
    const t = normalize(title)
    if (t.includes('sucesso') || t.includes('obrigado')) {
        return 'success'
    }
    if (
        t.includes('erro') ||
        t.includes('falha') ||
        t.includes('negada') ||
        t.includes('bloqueado') ||
        t.includes('indisponivel')
    ) {
        return 'error'
    }
    if (t.includes('aviso') || t.includes('atencao') || t.includes('limite')) {
        return 'warning'
    }
    return 'info'
}

export function subscribeToToasts(listener: ToastListener): () => void {
    toastListeners.add(listener)
    return () => {
        toastListeners.delete(listener)
    }
}

export function subscribeToConfirm(listener: ConfirmListener): () => void {
    confirmListeners.add(listener)
    return () => {
        confirmListeners.delete(listener)
    }
}

/**
 * Exibe uma notificação Toast com a identidade visual do BioDash.
 * Caso o host de toasts não esteja montado, faz fallback para Alert nativo/web.
 */
export function showAlert(title: string, message: string, variant?: FeedbackVariant): void {
    if (toastListeners.size > 0) {
        const resolvedVariant = variant ?? inferFeedbackVariant(title)
        const durationMs = message.length > 110 ? 6500 : 4500
        const payload: ToastPayload = {
            id: `toast-${Date.now()}-${++toastSeq}`,
            title,
            message,
            variant: resolvedVariant,
            durationMs,
        }
        toastListeners.forEach((listener) => listener(payload))
        return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`${title}\n\n${message}`)
        return
    }
    Alert.alert(title, message)
}

/**
 * Exibe um diálogo de confirmação compatível com Mobile e Web.
 * No Web (quando o FeedbackHost está montado), usa modal próprio com identidade visual do BioDash.
 */
export function showConfirm(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirmar',
    destructive = false
): void {
    if (Platform.OS === 'web' && confirmListeners.size > 0) {
        const payload: ConfirmPayload = {
            id: `confirm-${Date.now()}-${++toastSeq}`,
            title,
            message,
            confirmText,
            destructive,
            onConfirm,
        }
        confirmListeners.forEach((listener) => listener(payload))
        return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        if (window.confirm(`${title}\n\n${message}`)) {
            onConfirm()
        }
        return
    }
    Alert.alert(title, message, [
        { text: 'Cancelar', style: 'cancel' },
        {
            text: confirmText,
            style: destructive ? 'destructive' : 'default',
            onPress: onConfirm,
        },
    ])
}
