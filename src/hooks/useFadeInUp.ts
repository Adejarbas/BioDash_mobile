import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

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
        Animated.parallel([
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
        ]).start()
    }, [])

    return {
        animatedStyle: {
            opacity,
            transform: [{ translateY: translateYAnim }],
        },
    }
}
