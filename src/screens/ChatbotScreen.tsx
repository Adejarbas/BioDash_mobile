/**
 * ChatbotScreen.tsx
 * ─────────────────
 * Tela do Assistente Virtual do BioDash.
 * - Chat com interface de bolhas de mensagem
 * - Reconhecimento de voz nativo via expo-speech (síntese) + Speech Recognition API
 * - Integração com microserviço Python (TF-IDF + SVM)
 * - Ações automáticas: exportar PDF, CSV ou Excel a partir do chat
 * - Busca Semântica nos biodigestores cadastrados
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Animated,
    Keyboard,
} from 'react-native'
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import { chatbotApi, semanticSearchApi } from '../lib/api'
import { indicatorsApi, markersApi } from '../lib/api'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Message {
    id: string
    role: 'user' | 'bot'
    text: string
    timestamp: Date
    action?: string | null
}

interface ChatbotScreenProps {
    onBack?: () => void
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const TAB_BAR_HEIGHT = 62 // altura da barra de abas do App.tsx

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ChatbotScreen({ onBack }: ChatbotScreenProps) {
    const { colors } = useTheme()
    const insets = useSafeAreaInsets()
    const flatListRef = useRef<FlatList>(null)

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '0',
            role: 'bot',
            text: 'Olá! Em que posso ajudar você hoje? 😊\n\nPosso informar:\n• Endereço dos seus biodigestores\n• Métricas de resíduos e energia\n• Gerar relatórios (PDF, CSV ou Excel)',
            timestamp: new Date(),
        }
    ])
    const [inputText, setInputText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showSearch, setShowSearch] = useState(false)

    // Dados em cache para evitar múltiplas requisições
    const cachedMarkers = useRef<any[]>([])
    const cachedIndicators = useRef<any[]>([])
    const dataLoaded = useRef(false)

    // Animação do microfone
    const micPulse = useRef(new Animated.Value(1)).current

    // ─── Carrega dados do usuário (marcadores + indicadores) ─────────────────
    const loadUserData = useCallback(async () => {
        if (dataLoaded.current) return
        try {
            const [markersRes, indicatorsRes] = await Promise.all([
                markersApi.fetch(),
                indicatorsApi.fetch(),
            ])
            if (markersRes.success && markersRes.data) {
                cachedMarkers.current = markersRes.data
            }
            if (indicatorsRes.success && indicatorsRes.data) {
                cachedIndicators.current = indicatorsRes.data
            }
            dataLoaded.current = true
        } catch (e) {
            console.warn('Erro ao carregar dados do chatbot:', e)
        }
    }, [])

    useEffect(() => {
        loadUserData()
    }, [loadUserData])

    // ─── Animação de pulse do microfone ─────────────────────────────────────
    useEffect(() => {
        if (isListening) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(micPulse, { toValue: 1.3, duration: 600, useNativeDriver: true }),
                    Animated.timing(micPulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
                ])
            ).start()
        } else {
            micPulse.stopAnimation()
            micPulse.setValue(1)
        }
    }, [isListening, micPulse])

    // ─── Scroll automático ───────────────────────────────────────────────────
    const scrollToBottom = () => {
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true })
        }, 100)
    }

    // ─── Reconhecimento de Voz nativo via Web Speech API ─────────────────────
    const startVoiceRecognition = () => {
        if (isListening) {
            // Se já está ouvindo, cancela
            setIsListening(false)
            setInputText('')
            return
        }

        // Verifica se está rodando no browser (web)
        const isWeb = typeof window !== 'undefined' && Platform.OS === 'web'

        if (!isWeb) {
            Alert.alert(
                'Ditado por Voz',
                'Toque no campo de texto e use o microfone do teclado (ícone 🎙️) para ditar a mensagem.',
                [{ text: 'OK', style: 'default' }]
            )
            return
        }

        const SpeechRecognitionAPI =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

        if (!SpeechRecognitionAPI) {
            Alert.alert(
                'Não suportado',
                'Reconhecimento de voz não está disponível neste browser. Use Google Chrome ou Microsoft Edge.'
            )
            return
        }

        // Atualiza estado ANTES de iniciar para feedback visual imediato
        setIsListening(true)
        setInputText('')

        const recognition = new SpeechRecognitionAPI()
        recognition.lang = 'pt-BR'
        recognition.interimResults = false
        recognition.maxAlternatives = 1
        recognition.continuous = false

        recognition.onresult = (event: any) => {
            try {
                const transcript = event.results[0][0].transcript
                setIsListening(false)
                sendMessage(transcript)
            } catch (e) {
                setIsListening(false)
            }
        }

        recognition.onerror = (event: any) => {
            setIsListening(false)
            const errorMessages: Record<string, string> = {
                'not-allowed': 'Permissão de microfone negada.\n\nClique no ícone de cadeado 🔒 na barra de endereço → Microfone → Permitir → Recarregue.',
                'no-speech': 'Nenhuma fala detectada. Tente novamente mais perto do microfone.',
                'network': 'Erro de rede no reconhecimento de voz.',
                'audio-capture': 'Microfone não encontrado. Verifique se há um microfone conectado.',
                'aborted': '',
            }
            const msg = errorMessages[event.error]
            if (msg) Alert.alert('Microfone', msg)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        try {
            recognition.start()
        } catch (e: any) {
            setIsListening(false)
            Alert.alert('Erro ao iniciar microfone', e?.message || String(e))
        }
    }

    // ─── Ações automáticas disparadas pelo chatbot ───────────────────────────
    const handleChatAction = async (action: string | null | undefined) => {
        if (!action) return

        try {
            const indicators = cachedIndicators.current
            const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

            if (action === 'export_pdf') {
                const latestData = indicators[0] || {}
                const html = buildExportHTML(latestData, months)
                if (Platform.OS === 'web') {
                    const iframe = document.createElement('iframe')
                    iframe.style.display = 'none'
                    document.body.appendChild(iframe)
                    const doc = iframe.contentDocument || iframe.contentWindow?.document
                    if (doc) {
                        doc.open(); doc.write(html); doc.close()
                        iframe.contentWindow?.focus()
                        setTimeout(() => {
                            iframe.contentWindow?.print()
                            setTimeout(() => document.body.removeChild(iframe), 2000)
                        }, 500)
                    }
                } else {
                    const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 })
                    await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Relatório BioDash (PDF)' })
                }
                addBotMessage('✅ Relatório PDF gerado com sucesso!')

            } else if (action === 'export_csv' || action === 'export_excel') {
                const csvContent = buildCSVContent(indicators)
                const label = action === 'export_excel' ? 'Excel' : 'CSV'
                const fileName = `biodash_relatorio.csv`
                if (Platform.OS === 'web') {
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = fileName
                    document.body.appendChild(a); a.click()
                    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a) }, 1000)
                } else {
                    // @ts-ignore
                    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory
                    const fileUri = cacheDir + fileName
                    await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 })
                    await Sharing.shareAsync(fileUri, { dialogTitle: `Compartilhar ${label}`, mimeType: 'text/csv' })
                }
                addBotMessage(`✅ Arquivo ${label} gerado com sucesso!`)
            }
        } catch (err: any) {
            addBotMessage('❌ Não foi possível gerar o arquivo. Tente novamente.')
            console.error('Erro na ação do chatbot:', err)
        }
    }

    const buildExportHTML = (data: any, months: string[]) => {
        const waste = (data.waste_processed || 0).toFixed(2)
        const energy = (data.energy_generated || 0).toFixed(2)
        const tax = (data.tax_savings || 0).toFixed(2)
        const now = new Date().toLocaleString('pt-BR')
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BioDash - Relatório</title>
        <style>body{font-family:Arial,sans-serif;margin:0;padding:0;color:#333;}</style></head>
        <body>
        <div style="background:#16a34a;padding:40px 30px;color:white;">
            <h1 style="margin:0;font-size:28px;">BioDash - Relatório Analítico</h1>
            <p style="margin-top:8px;opacity:0.9;">Gerado pelo Assistente Virtual</p>
            <p style="margin-top:4px;opacity:0.8;font-size:12px;">Gerado em: ${now}</p>
        </div>
        <div style="padding:30px;">
            <h2 style="color:#1f2937;margin-bottom:20px;">Resumo de Desempenho</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:40px;">
                <thead><tr style="background:#f0fdf4;">
                    <th style="padding:15px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Métrica</th>
                    <th style="padding:15px;text-align:center;color:#16a34a;border-bottom:2px solid #16a34a;">Valor</th>
                </tr></thead>
                <tbody>
                    <tr style="text-align:center;border-bottom:1px solid #ddd;"><td style="padding:12px;font-weight:bold;">Resíduos Processados</td><td style="padding:12px;color:#16a34a;">${waste} kg</td></tr>
                    <tr style="text-align:center;border-bottom:1px solid #ddd;"><td style="padding:12px;font-weight:bold;">Energia Gerada</td><td style="padding:12px;color:#16a34a;">${energy} kWh</td></tr>
                    <tr style="text-align:center;border-bottom:1px solid #ddd;"><td style="padding:12px;font-weight:bold;">Benefícios Fiscais</td><td style="padding:12px;color:#16a34a;">R$ ${tax}</td></tr>
                </tbody>
            </table>
            <p style="margin-top:60px;font-size:11px;color:#94a3b8;text-align:center;">BioDash Intelligence Systems © ${new Date().getFullYear()}</p>
        </div></body></html>`
    }

    const buildCSVContent = (indicators: any[]) => {
        let csv = '\uFEFFMétrica;Valor Total\n'
        const totals = indicators.reduce((acc, r) => ({
            waste: acc.waste + Number(r.waste_processed || 0),
            energy: acc.energy + Number(r.energy_generated || 0),
            tax: acc.tax + Number(r.tax_savings || 0),
        }), { waste: 0, energy: 0, tax: 0 })
        csv += `Resíduos Processados (kg);${totals.waste.toFixed(2)}\n`
        csv += `Energia Gerada (kWh);${totals.energy.toFixed(2)}\n`
        csv += `Benefícios Fiscais (R$);${totals.tax.toFixed(2)}\n`
        csv += `Total de Registros;${indicators.length}\n`
        return csv
    }

    // ─── Enviar mensagem para o chatbot ─────────────────────────────────────
    const sendMessage = async (text?: string) => {
        const messageText = (text || inputText).trim()
        if (!messageText) return
        Keyboard.dismiss()

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: messageText,
            timestamp: new Date(),
        }

        setMessages(prev => [...prev, userMsg])
        setInputText('')
        setIsLoading(true)
        scrollToBottom()

        try {
            await loadUserData()
            const res = await chatbotApi.send({
                message: messageText,
                markers: cachedMarkers.current,
                indicators: cachedIndicators.current,
            })

            // apiRequest retorna: { success, data, error }
            // data pode ser o objeto inteiro { intent, response, confidence, action }
            // ou pode estar aninhado, dependendo da versão do servidor
            const responseText =
                res.data?.response ||            // caso normal
                (res.data as any)?.data?.response || // caso aninhado
                (res.success ? null : res.error)    // caso de erro com mensagem

            console.log('[Chatbot] API result:', JSON.stringify(res).slice(0, 300))

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: responseText
                    ? responseText
                    : res.error
                        ? `Erro: ${res.error}`
                        : 'Desculpe, não consegui processar sua mensagem. Verifique se o serviço de IA está rodando na porta 5000.',
                timestamp: new Date(),
                action: res.data?.action || (res.data as any)?.data?.action,
            }

            setMessages(prev => [...prev, botMsg])

            // Dispara a ação automática se existir
            const action = botMsg.action
            if (action) {
                await handleChatAction(action)
            }
        } catch (err: any) {
            console.error('[Chatbot] sendMessage error:', err)
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: `Erro ao conectar com o assistente de IA (porta 5000). Detalhe: ${err?.message || String(err)}`,
                timestamp: new Date(),
            }])
        } finally {
            setIsLoading(false)
            scrollToBottom()
        }
    }

    // ─── Busca Semântica ─────────────────────────────────────────────────────
    const handleSemanticSearch = async () => {
        if (!searchQuery.trim()) return
        setIsSearching(true)
        setSearchResults([])
        try {
            await loadUserData()
            const res = await semanticSearchApi.search({
                query: searchQuery,
                markers: cachedMarkers.current,
            })
            if (res.success && res.data?.results) {
                setSearchResults(res.data.results)
            } else {
                setSearchResults([])
            }
        } catch (err) {
            Alert.alert('Erro', 'Não foi possível realizar a busca semântica.')
        } finally {
            setIsSearching(false)
        }
    }

    const addBotMessage = (text: string) => {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'bot',
            text,
            timestamp: new Date(),
        }])
        scrollToBottom()
    }

    // ─── Render de cada bolha de mensagem ────────────────────────────────────
    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.role === 'user'
        return (
            <View style={[
                styles.messageBubbleWrapper,
                isUser ? styles.userWrapper : styles.botWrapper
            ]}>
                {!isUser && (
                    <View style={[styles.botAvatar, { backgroundColor: '#16a34a' }]}>
                        <Text style={{ fontSize: 14 }}>🌿</Text>
                    </View>
                )}
                <View style={[
                    styles.bubble,
                    isUser
                        ? [styles.userBubble, { backgroundColor: colors.primary }]
                        : [styles.botBubble, { backgroundColor: colors.cardBackground, borderColor: colors.border }]
                ]}>
                    <Text style={[
                        styles.bubbleText,
                        { color: isUser ? '#fff' : colors.text }
                    ]}>{item.text}</Text>
                    <Text style={[
                        styles.bubbleTime,
                        { color: isUser ? 'rgba(255,255,255,0.6)' : colors.textMuted }
                    ]}>
                        {item.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        )
    }

    // ─── Atalhos rápidos ─────────────────────────────────────────────────────
    const quickReplies = [
        { label: '📍 Endereço', text: 'Qual o endereço do biodigestor?' },
        { label: '⚡ Energia', text: 'Quanta energia foi gerada?' },
        { label: '♻️ Resíduos', text: 'Quantos resíduos foram processados?' },
        { label: '📊 Métricas', text: 'Quais são as métricas do biodigestor?' },
        { label: '📄 PDF', text: 'Gera um relatório em PDF' },
        { label: '📋 Excel', text: 'Exportar Excel' },
    ]

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: TAB_BAR_HEIGHT }}>
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 10}
        >
            {/* Header */}
            <View style={[styles.header, {
                backgroundColor: colors.cardBackground,
                borderBottomColor: colors.border,
                paddingTop: 12,
            }]}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} style={styles.backBtn} id="chatbot-back-button">
                        <MaterialIcons name="arrow-back" size={22} color={colors.text} />
                    </TouchableOpacity>
                )}
                <View style={styles.headerInfo}>
                    <View style={styles.avatarContainer}>
                        <Text style={{ fontSize: 22 }}>🌿</Text>
                    </View>
                    <View>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>Assistente BioDash</Text>
                        <View style={styles.onlineIndicator}>
                            <View style={styles.onlineDot} />
                            <Text style={[styles.onlineText, { color: colors.textMuted }]}>Online · TF-IDF + SVM</Text>
                        </View>
                    </View>
                </View>
                <TouchableOpacity
                    onPress={() => setShowSearch(!showSearch)}
                    style={[styles.searchToggleBtn, { backgroundColor: colors.iconBg }]}
                    id="chatbot-search-toggle"
                >
                    <MaterialIcons name="search" size={20} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Busca Semântica (colapsável) */}
            {showSearch && (
                <View style={[styles.searchPanel, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
                    <Text style={[styles.searchTitle, { color: colors.text }]}>🔍 Busca Semântica de Biodigestores</Text>
                    <View style={[styles.searchInputRow, { borderColor: colors.border }]}>
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Ex: biodigestor perto do rio..."
                            placeholderTextColor={colors.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSemanticSearch}
                            id="chatbot-semantic-search-input"
                        />
                        <TouchableOpacity
                            onPress={handleSemanticSearch}
                            style={[styles.searchBtn, { backgroundColor: colors.primary }]}
                            id="chatbot-semantic-search-button"
                        >
                            {isSearching
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <MaterialIcons name="search" size={18} color="#fff" />
                            }
                        </TouchableOpacity>
                    </View>
                    {searchResults.length > 0 && (
                        <View style={styles.searchResults}>
                            {searchResults.slice(0, 3).map((r, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.searchResultItem, { borderColor: colors.border, backgroundColor: colors.background }]}
                                    onPress={() => {
                                        setShowSearch(false)
                                        sendMessage(`Qual o endereço do biodigestor ${r.title}?`)
                                    }}
                                    id={`search-result-${i}`}
                                >
                                    <Text style={[styles.searchResultTitle, { color: colors.text }]}>📍 {r.title}</Text>
                                    <Text style={[styles.searchResultScore, { color: colors.textMuted }]}>
                                        Relevância: {(r.similarity_score * 100).toFixed(0)}%
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    {!isSearching && searchQuery && searchResults.length === 0 && (
                        <Text style={[styles.noResults, { color: colors.textMuted }]}>Nenhum biodigestor encontrado para esta busca.</Text>
                    )}
                </View>
            )}

            {/* Lista de Mensagens */}
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={scrollToBottom}
                showsVerticalScrollIndicator={false}
            />

            {/* Indicador de digitando */}
            {isLoading && (
                <View style={[styles.typingIndicator, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.typingText, { color: colors.textMuted }]}>Assistente digitando...</Text>
                </View>
            )}

            {/* Atalhos Rápidos */}
            <View style={styles.quickRepliesContainer}>
                <FlatList
                    horizontal
                    data={quickReplies}
                    keyExtractor={(item) => item.label}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.quickReply, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}
                            onPress={() => sendMessage(item.text)}
                            id={`quick-reply-${item.label.replace(/[^a-zA-Z0-9]/g, '-')}`}
                        >
                            <Text style={[styles.quickReplyText, { color: colors.primary }]}>{item.label}</Text>
                        </TouchableOpacity>
                    )}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 12 }}
                />
            </View>

            {/* Input de Mensagem */}
            <View style={[styles.inputContainer, {
                backgroundColor: colors.cardBackground,
                borderTopColor: colors.border,
            }]}>
                <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <TextInput
                        style={[
                            styles.textInput,
                            { color: colors.text },
                            isListening && { color: '#ef4444' }
                        ]}
                        placeholder={isListening ? '🔴 Ouvindo... fale agora' : 'Digite sua mensagem...'}
                        placeholderTextColor={isListening ? '#ef4444' : colors.textMuted}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={500}
                        onSubmitEditing={() => sendMessage()}
                        editable={!isListening}
                        id="chatbot-message-input"
                    />

                    {/* Botão de Microfone */}
                    <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                        <TouchableOpacity
                            style={[
                                styles.micBtn,
                                { backgroundColor: isListening ? '#ef4444' : colors.iconBg }
                            ]}
                            onPress={startVoiceRecognition}
                            id="chatbot-mic-button"
                        >
                            <MaterialCommunityIcons
                                name={isListening ? 'microphone' : 'microphone-outline'}
                                size={20}
                                color={isListening ? '#fff' : colors.text}
                            />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Botão de Enviar */}
                    <TouchableOpacity
                        style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (!inputText.trim() || isLoading) ? 0.5 : 1 }]}
                        onPress={() => sendMessage()}
                        disabled={!inputText.trim() || isLoading}
                        id="chatbot-send-button"
                    >
                        <MaterialIcons name="send" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
        </View>
    )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 2,
    },
    backBtn: {
        marginRight: 8,
        padding: 4,
    },
    headerInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#dcfce7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    onlineIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    onlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#22c55e',
    },
    onlineText: {
        fontSize: 11,
    },
    searchToggleBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchPanel: {
        padding: 16,
        borderBottomWidth: 1,
    },
    searchTitle: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 10,
    },
    searchInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        overflow: 'hidden',
    },
    searchInput: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },
    searchBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchResults: {
        marginTop: 10,
        gap: 6,
    },
    searchResultItem: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
    },
    searchResultTitle: {
        fontSize: 13,
        fontWeight: '600',
    },
    searchResultScore: {
        fontSize: 11,
        marginTop: 2,
    },
    noResults: {
        marginTop: 8,
        fontSize: 13,
        textAlign: 'center',
    },
    messageList: {
        padding: 16,
        paddingBottom: 8,
    },
    messageBubbleWrapper: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'flex-end',
        maxWidth: '88%',
    },
    userWrapper: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    botWrapper: {
        alignSelf: 'flex-start',
        gap: 8,
    },
    botAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    bubble: {
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: '100%',
    },
    userBubble: {
        borderBottomRightRadius: 4,
    },
    botBubble: {
        borderWidth: 1,
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: 14,
        lineHeight: 20,
    },
    bubbleTime: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    typingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
        alignSelf: 'flex-start',
    },
    typingText: {
        fontSize: 12,
    },
    quickRepliesContainer: {
        paddingVertical: 8,
    },
    quickReply: {
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 7,
        marginRight: 8,
    },
    quickReplyText: {
        fontSize: 12,
        fontWeight: '600',
    },
    inputContainer: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderTopWidth: 1,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderWidth: 1,
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 8,
    },
    textInput: {
        flex: 1,
        fontSize: 14,
        maxHeight: 100,
        paddingTop: 4,
        paddingBottom: 4,
    },
    micBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
})
