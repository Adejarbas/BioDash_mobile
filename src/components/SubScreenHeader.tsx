import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'

interface SubScreenHeaderProps {
    onBack: () => void
    label?: string
}

/**
 * Cabeçalho acessível reutilizável para sub-telas acessadas a partir de Ajustes.
 */
export default function SubScreenHeader({
    onBack,
    label = 'Voltar para Ajustes',
}: SubScreenHeaderProps) {
    const { colors } = useTheme()

    return (
        <View
            style={[
                styles.header,
                {
                    backgroundColor: colors.cardBackground,
                    borderBottomColor: colors.border,
                },
            ]}
        >
            <TouchableOpacity
                onPress={onBack}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel={label}
                activeOpacity={0.7}
            >
                <MaterialCommunityIcons
                    name="chevron-left"
                    size={24}
                    color={colors.text}
                    importantForAccessibility="no"
                />
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {label}
                </Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    backButton: {
        minHeight: 44,
        minWidth: 44,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        borderRadius: 10,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 4,
    },
})
