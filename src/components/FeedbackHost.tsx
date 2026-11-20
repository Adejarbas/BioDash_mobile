import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    AccessibilityInfo,
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import {
    ConfirmPayload,
    FeedbackVariant,
    subscribeToConfirm,
    subscribeToToasts,
    ToastPayload,
} from '../lib/feedback'
import { renderToastOverlay } from '../lib/toastPortal'

const MAX_VISIBLE_TOASTS = 3

interface VariantVisual {
    icon: keyof typeof MaterialCommunityIcons.glyphMap
    accent: string
    iconBg: string
}

function getVariantVisual(variant: FeedbackVariant, theme: 'light' | 'dark', colors: ReturnType<typeof useTheme>['colors']): VariantVisual {
    switch (variant) {
        case 'success':
            return {
                icon: 'check-circle-outline',
                accent: colors.primary,
                iconBg: theme === 'dark' ? '#14532d' : '#dcfce7',
            }
        case 'error':
            return {
                icon: 'alert-circle-outline',
                accent: colors.danger,
                iconBg: colors.dangerBg,
            }
        case 'warning':
            return {
                icon: 'alert-outline',
                accent: theme === 'dark' ? '#fbbf24' : '#b45309',
                iconBg: theme === 'dark' ? '#451a03' : '#fef3c7',
            }
        case 'info':
        default:
            return {
                icon: 'information-outline',
                accent: theme === 'dark' ? '#38bdf8' : '#0369a1',
                iconBg: theme === 'dark' ? '#0c4a6e' : '#e0f2fe',
            }
    }
}

function ToastItem({
    toast,
    reduceMotion,
    onDismiss,
}: {
    toast: ToastPayload
    reduceMotion: boolean
    onDismiss: (id: string) => void
}) {
    const { theme, colors } = useTheme()
    const visual = getVariantVisual(toast.variant, theme, colors)
    const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
    const translateY = useRef(new Animated.Value(reduceMotion ? 0 : -14)).current
    const closingRef = useRef(false)

    const dismissWithAnimation = useCallback(() => {
        if (closingRef.current) return
        closingRef.current = true
        if (reduceMotion) {
            onDismiss(toast.id)
            return
        }
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: -10,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start(() => onDismiss(toast.id))
    }, [onDismiss, opacity, reduceMotion, toast.id, translateY])

    useEffect(() => {
        if (!reduceMotion) {
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 220,
                    useNativeDriver: true,
                }),
            ]).start()
        }

        const timer = setTimeout(dismissWithAnimation, toast.durationMs)
        return () => clearTimeout(timer)
    }, [dismissWithAnimation, opacity, reduceMotion, toast.durationMs, translateY])

    return (
        <Animated.View
            style={[
                styles.toastCard,
                {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border,
                    borderLeftColor: visual.accent,
                    opacity,
                    transform: [{ translateY }],
                },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
        >
            <View style={[styles.iconBadge, { backgroundColor: visual.iconBg }]}>
                <MaterialCommunityIcons
                    name={visual.icon}
                    size={22}
                    color={visual.accent}
                    importantForAccessibility="no"
                />
            </View>

            <View style={styles.toastTextWrap}>
                {!!toast.title && (
                    <Text
                        style={[styles.toastTitle, { color: colors.text }]}
                        maxFontSizeMultiplier={1.4}
                    >
                        {toast.title}
                    </Text>
                )}
                {!!toast.message && (
                    <Text
                        style={[styles.toastMessage, { color: colors.textMuted }]}
                        maxFontSizeMultiplier={1.4}
                    >
                        {toast.message}
                    </Text>
                )}
            </View>

            <TouchableOpacity
                onPress={dismissWithAnimation}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Fechar notificação"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <MaterialCommunityIcons
                    name="close"
                    size={18}
                    color={colors.textMuted}
                    importantForAccessibility="no"
                />
            </TouchableOpacity>
        </Animated.View>
    )
}

/**
 * Host global de toasts e confirmações com a identidade visual do BioDash.
 */
export function FeedbackHost() {
    const { colors } = useTheme()
    const insets = useSafeAreaInsets()
    const [toasts, setToasts] = useState<ToastPayload[]>([])
    const [confirmDialog, setConfirmDialog] = useState<ConfirmPayload | null>(null)
    const [confirmVisible, setConfirmVisible] = useState(false)
    const [reduceMotion, setReduceMotion] = useState(false)

    useEffect(() => {
        let mounted = true
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (mounted) setReduceMotion(enabled)
            })
            .catch(() => {})
        return () => {
            mounted = false
        }
    }, [])

    useEffect(() => {
        const unsubToast = subscribeToToasts((toast) => {
            setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), toast])
            AccessibilityInfo.announceForAccessibility?.(`${toast.title}. ${toast.message}`)
        })
        const unsubConfirm = subscribeToConfirm((payload) => {
            setConfirmDialog(payload)
            setConfirmVisible(true)
        })
        return () => {
            unsubToast()
            unsubConfirm()
        }
    }, [])

    const handleDismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
    }, [])

    const closeConfirmDialog = useCallback(() => {
        setConfirmVisible(false)
    }, [])

    const handleConfirmAction = () => {
        if (!confirmDialog) return
        const action = confirmDialog.onConfirm
        setConfirmVisible(false)
        action()
    }

    const toastOverlay = toasts.length > 0
        ? renderToastOverlay(
            <View
                pointerEvents="box-none"
                style={[
                    styles.toastHost,
                    Platform.OS === 'web' ? ({ position: 'fixed', zIndex: 2147483647 } as any) : null,
                    { top: Math.max(insets.top, 12) + 8 },
                ]}
            >
                <View pointerEvents="box-none" style={styles.toastColumn}>
                    {toasts.map((toast) => (
                        <ToastItem
                            key={toast.id}
                            toast={toast}
                            reduceMotion={reduceMotion}
                            onDismiss={handleDismissToast}
                        />
                    ))}
                </View>
            </View>
        )
        : null

    return (
        <>
            {toastOverlay}

            {confirmDialog && (
                <Modal
                    visible={confirmVisible}
                    transparent
                    animationType={Platform.OS === 'web' || reduceMotion ? 'none' : 'fade'}
                    onRequestClose={closeConfirmDialog}
                >
                    <Pressable
                        style={styles.confirmBackdrop}
                        onPress={closeConfirmDialog}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar diálogo de confirmação"
                    >
                        <Pressable
                            style={[
                                styles.confirmCard,
                                {
                                    backgroundColor: colors.cardBackground,
                                    borderColor: colors.border,
                                },
                            ]}
                            onPress={(e) => e.stopPropagation()}
                        >
                            <Text
                                style={[styles.confirmTitle, { color: colors.text }]}
                                accessibilityRole="header"
                                maxFontSizeMultiplier={1.4}
                            >
                                {confirmDialog.title}
                            </Text>
                            <Text
                                style={[styles.confirmMessage, { color: colors.textMuted }]}
                                maxFontSizeMultiplier={1.4}
                            >
                                {confirmDialog.message}
                            </Text>

                            <View style={styles.confirmActions}>
                                <TouchableOpacity
                                    style={[
                                        styles.confirmBtn,
                                        { backgroundColor: colors.iconBg, borderColor: colors.border, borderWidth: 1 },
                                    ]}
                                    onPress={closeConfirmDialog}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cancelar"
                                >
                                    <Text style={[styles.confirmBtnText, { color: colors.text }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.confirmBtn,
                                        {
                                            backgroundColor: confirmDialog.destructive ? colors.danger : colors.primary,
                                        },
                                    ]}
                                    onPress={handleConfirmAction}
                                    accessibilityRole="button"
                                    accessibilityLabel={confirmDialog.confirmText}
                                >
                                    <Text
                                        style={[
                                            styles.confirmBtnText,
                                            { color: confirmDialog.destructive ? '#ffffff' : colors.onPrimary },
                                        ]}
                                    >
                                        {confirmDialog.confirmText}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}
        </>
    )
}

const styles = StyleSheet.create({
    toastHost: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 9999,
        alignItems: 'center',
        ...(Platform.OS === 'web' ? { pointerEvents: 'box-none' as const } : {}),
    },
    toastColumn: {
        width: '100%',
        maxWidth: 460,
        gap: 10,
    },
    toastCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderRadius: 16,
        borderWidth: 1,
        borderLeftWidth: 4,
        paddingVertical: 12,
        paddingLeft: 12,
        paddingRight: 8,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    iconBadge: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        marginTop: 1,
    },
    toastTextWrap: {
        flex: 1,
        flexShrink: 1,
        paddingRight: 4,
    },
    toastTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    toastMessage: {
        fontSize: 13,
        lineHeight: 18,
    },
    closeBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -6,
        marginRight: -4,
    },
    confirmBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    confirmCard: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 20,
        borderWidth: 1,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    confirmMessage: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    confirmActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    confirmBtn: {
        minHeight: 44,
        paddingHorizontal: 18,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
})
