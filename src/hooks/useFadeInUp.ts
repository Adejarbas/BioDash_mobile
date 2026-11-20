import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'

interface FadeInUpOptions {
    duration?: number
    delay?: number
    translateY?: number
}

export function useFadeInUp({
    duration = 400,
    delay = 0,
    translateY = 24,
}: FadeInUpOptions = {}) {
    const opacity = useRef(new Animated.Value(0)).current
    const translateYAnim = useRef(new Animated.Value(translateY)).current

    useEffect(() => {
        let mounted = true
        let anim: Animated.CompositeAnimation | null = null

        const startAnimation = () => {
            anim = Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration,
                    delay,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: 0,
                    duration,
                    delay,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ])
            anim.start()
        }

        AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotionEnabled) => {
                if (!mounted) return
                if (reduceMotionEnabled) {
                    opacity.setValue(1)
                    translateYAnim.setValue(0)
                    return
                }
                startAnimation()
            })
            .catch(() => {
                if (!mounted) return
                startAnimation()
            })

        return () => {
            mounted = false
            anim?.stop()
        }
    }, [delay, duration, opacity, translateYAnim])

    return {
        animatedStyle: {
            opacity,
            transform: [{ translateY: translateYAnim }],
        },
    }
}
