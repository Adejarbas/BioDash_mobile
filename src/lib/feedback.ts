import { Alert, Platform } from 'react-native'

/**
 * Exibe um alerta de forma compatível com Mobile (Alert.alert) e Web (window.alert).
 */
export function showAlert(title: string, message: string): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`${title}\n\n${message}`)
        return
    }
    Alert.alert(title, message)
}

/**
 * Exibe um diálogo de confirmação compatível com Mobile e Web.
 */
export function showConfirm(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirmar',
    destructive = false
): void {
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
