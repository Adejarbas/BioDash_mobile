/**
 * ChatbotScreen.tsx
 * ─────────────────
 * Tela do Assistente Virtual do BioDash.
 * - Chat com interface de bolhas de mensagem
 * - Reconhecimento de voz NATIVO via expo-speech-recognition (iOS/Android)
 * - Fallback para Web Speech API no browser
 * - Integração com microserviço Python (TF-IDF + SVM)
 * - Ações automáticas: exportar PDF, CSV ou Excel a partir do chat
 * - Busca Semântica nos biodigestores cadastrados
 *
 * ⚠️  expo-speech-recognition requer development build (não funciona no Expo Go).
 *     Execute: npx expo run:android  ou  npx expo run:ios
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
import { indicatorsApi, markersApi, maintenanceApi } from '../lib/api'
import { authLib } from '../lib/auth'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

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

type VoiceInputMode = 'tap' | 'hold' | null

// ─── Flow State Machine ───────────────────────────────────────────────────────
type FlowType = 'agendar_manutencao' | 'incluir_metrica' | 'editar_metrica' | 'adicionar_endereco' | 'relatorio_periodo'

interface FlowState {
    type: FlowType
    step: string
    data: Record<string, any>
}

// ─── Constantes e Helpers de Parsing ─────────────────────────────────────────
const TAB_BAR_HEIGHT = 62

const MONTH_NAMES = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const PRIORITY_LABELS: Record<string, string> = {
    high: '🔴 Alta', medium: '🟡 Média', low: '🟢 Baixa',
}

const normalizeStr = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const parseMonth = (text: string): number | null => {
    const n = normalizeStr(text)
    const names = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    for (let i = 0; i < names.length; i++) if (n.includes(names[i])) return i
    const m = text.match(/\b(\d{1,2})\b/)
    if (m) { const v = parseInt(m[1]); if (v >= 1 && v <= 12) return v - 1 }
    return null
}

const parseYear = (text: string): number | null => {
    const m = text.match(/\b(20\d{2})\b/)
    if (m) return parseInt(m[1])
    const m2 = text.match(/\b(\d{2})\b/)
    if (m2) return 2000 + parseInt(m2[1])
    return null
}

const parseNumber = (text: string): number | null => {
    const norm = text.replace(',', '.')
    const m = norm.match(/\d+(?:\.\d+)?/)
    return m ? parseFloat(m[0]) : null
}

const parsePriority = (text: string): string | null => {
    const n = normalizeStr(text)
    if (['alta','urgente','critica','importante'].some(w => n.includes(w))) return 'high'
    if (['media','moderada','normal'].some(w => n.includes(w))) return 'medium'
    if (['baixa','leve','pequena'].some(w => n.includes(w))) return 'low'
    return null
}

const normalizeReply = (text: string) =>
    normalizeStr(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const matchesReply = (text: string, options: string[]) => {
    const normalized = normalizeReply(text)
    return options.some(option => normalized === option || normalized.startsWith(`${option} `))
}

const isConfirm = (text: string): boolean =>
    matchesReply(text, ['sim','s','yes','confirmar','confirmo','ok','pode','certo','correto','isso','exato','claro','ta bom'])

const isCancel = (text: string): boolean =>
    matchesReply(text, ['nao','n','no','cancelar','cancela','desistir','para','chega','voltar','esqueca','nao quero'])

const padDate = (n: number) => String(n).padStart(2, '0')

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
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [voiceInputMode, setVoiceInputMode] = useState<VoiceInputMode>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [activeFlow, setActiveFlow] = useState<FlowState | null>(null)

    // Dados em cache para evitar múltiplas requisições
    const cachedMarkers = useRef<any[]>([])
    const cachedIndicators = useRef<any[]>([])
    const dataLoaded = useRef(false)

    // Animação do microfone
    const micPulse = useRef(new Animated.Value(1)).current
    const isListeningRef = useRef(false)
    const voiceInputModeRef = useRef<VoiceInputMode>(null)
    const webRecognitionRef = useRef<any>(null)
    const webShouldKeepListeningRef = useRef(false)
    const webManualStopRef = useRef(false)
    const webTranscriptRef = useRef('')
    const webTranscriptPrefixRef = useRef('')
    const webMediaRecorderRef = useRef<MediaRecorder | null>(null)
    const webMediaStreamRef = useRef<MediaStream | null>(null)
    const webAudioChunksRef = useRef<Blob[]>([])
    const ignoreNextMicPressRef = useRef(false)

    const updateVoiceMode = useCallback((mode: VoiceInputMode) => {
        voiceInputModeRef.current = mode
        setVoiceInputMode(mode)
    }, [])

    const updateListeningState = useCallback((listening: boolean) => {
        isListeningRef.current = listening
        setIsListening(listening)
        if (!listening) updateVoiceMode(null)
    }, [updateVoiceMode])

    // ─── Carrega dados do usuário (marcadores + indicadores) ─────────────────
    const loadUserData = useCallback(async () => {
        if (dataLoaded.current) return
        try {
            const [indicatorsRes] = await Promise.all([
                indicatorsApi.fetch(),
            ])
            if (indicatorsRes.success && indicatorsRes.data) {
                cachedIndicators.current = indicatorsRes.data
            }

            // Busca biodigestores via backend Express (agora usa o Postgres diretamente sem restrições do Supabase)
            const markersRes = await markersApi.fetch()
            if (markersRes.success && markersRes.data) {
                cachedMarkers.current = markersRes.data
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

    // ─── Cleanup do reconhecimento de voz ao desmontar ───────────────────────
    useEffect(() => {
        return () => {
            if (Platform.OS === 'web') {
                webShouldKeepListeningRef.current = false
                webManualStopRef.current = false
                webRecognitionRef.current?.abort?.()
                webRecognitionRef.current = null
                const recorder = webMediaRecorderRef.current
                if (recorder && recorder.state !== 'inactive') {
                    recorder.onstop = null
                    recorder.stop()
                }
                webMediaRecorderRef.current = null
                webMediaStreamRef.current?.getTracks().forEach(track => track.stop())
                webMediaStreamRef.current = null
                webAudioChunksRef.current = []
            } else {
                ExpoSpeechRecognitionModule.abort()
            }
        }
    }, [])

    // ─── Handlers nativos do expo-speech-recognition ─────────────────────────

    // Resultados parciais (transcrição em tempo real enquanto fala)
    useSpeechRecognitionEvent('speechstart', () => {
        setInputText('')
    })

    useSpeechRecognitionEvent('result', (event) => {
        const transcript = event.results?.[0]?.transcript ?? ''
        setInputText(transcript)
        // Se for resultado final (não parcial), envia automaticamente
        if (!event.isFinal) return
        updateListeningState(false)
        if (transcript.trim()) {
            sendMessage(transcript.trim())
        }
    })

    useSpeechRecognitionEvent('error', (event) => {
        updateListeningState(false)
        const errorMessages: Record<string, string> = {
            'not-allowed': 'Permissão de microfone negada. Vá em Configurações → Aplicativos → BioDash → Permissões → Microfone → Permitir.',
            'no-speech': 'Nenhuma fala detectada. Tente novamente mais perto do microfone.',
            'network': 'Erro de rede no reconhecimento de voz.',
            'audio-capture': 'Microfone não encontrado.',
            'aborted': '',
        }
        const msg = errorMessages[event.error as string] ?? `Erro: ${event.error}`
        if (msg) Alert.alert('Microfone', msg)
    })

    useSpeechRecognitionEvent('end', () => {
        updateListeningState(false)
    })

    // ─── Scroll automático ───────────────────────────────────────────────────
    const scrollToBottom = () => {
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true })
        }, 100)
    }

    // ─── Reconhecimento de Voz ────────────────────────────────────────────────
    // No mobile: usa expo-speech-recognition (nativo iOS/Android)
    // No web: grava com MediaRecorder e transcreve no backend. A Web Speech
    // API fica apenas como fallback, pois ela costuma encerrar sessões sozinha.
    const startVoiceRecognition = async (mode: Exclude<VoiceInputMode, null>) => {
        if (isListeningRef.current) return
        updateVoiceMode(mode)
        // ── Web fallback ───────────────────────────────────────────────────
        if (Platform.OS === 'web') {
            const SpeechRecognitionAPI =
                (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            const MediaRecorderAPI = (window as any).MediaRecorder
            const mediaDevices = window.navigator?.mediaDevices

            if (!window.isSecureContext) {
                updateVoiceMode(null)
                Alert.alert(
                    'Microfone bloqueado',
                    'O navegador só libera o microfone em HTTPS ou quando o site é aberto por localhost.'
                )
                return
            }

            // MediaRecorder mantém a captura ativa até o segundo toque ou até
            // o usuário soltar o botão, reproduzindo o comportamento do WhatsApp.
            if (mediaDevices?.getUserMedia && MediaRecorderAPI) {

                try {
                    const stream = await mediaDevices.getUserMedia({
                        audio: {
                            channelCount: { ideal: 1 },
                            sampleRate: { ideal: 48000 },
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                    })
                    // O gesto pode ter terminado enquanto o navegador pedia permissão.
                    if (voiceInputModeRef.current !== mode) {
                        stream.getTracks().forEach(track => track.stop())
                        return
                    }

                    const preferredTypes = [
                        'audio/webm;codecs=opus',
                        'audio/webm',
                        'audio/ogg;codecs=opus',
                        'audio/mp4',
                    ]
                    const mimeType = preferredTypes.find(type => MediaRecorderAPI.isTypeSupported(type))
                    const recorderOptions = {
                        ...(mimeType ? { mimeType } : {}),
                        audioBitsPerSecond: 128000,
                    }
                    const recorder: MediaRecorder = new MediaRecorderAPI(stream, recorderOptions)

                    webMediaStreamRef.current = stream
                    webMediaRecorderRef.current = recorder
                    webAudioChunksRef.current = []
                    updateListeningState(true)
                    setInputText('')

                    recorder.ondataavailable = event => {
                        if (event.data.size > 0) webAudioChunksRef.current.push(event.data)
                    }
                    recorder.onerror = () => {
                        updateListeningState(false)
                        stream.getTracks().forEach(track => track.stop())
                        webMediaStreamRef.current = null
                        webMediaRecorderRef.current = null
                        Alert.alert('Microfone', 'Não foi possível gravar o áudio neste navegador.')
                    }
                    recorder.onstop = async () => {
                        const chunks = webAudioChunksRef.current
                        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm'
                        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
                        webAudioChunksRef.current = []
                        webMediaRecorderRef.current = null
                        stream.getTracks().forEach(track => track.stop())
                        webMediaStreamRef.current = null
                        updateListeningState(false)

                        const audio = new Blob(chunks, { type })
                        if (!audio.size) return

                        setIsTranscribing(true)
                        try {
                            const response = await chatbotApi.transcribeAudio(audio, `voice-message.${extension}`)
                            const transcript = response.data?.text?.trim()
                            if (!response.success || !transcript) {
                                throw new Error(response.error || 'Nenhuma fala foi reconhecida.')
                            }
                            setInputText(transcript)
                            await sendMessage(transcript)
                        } catch (error: any) {
                            Alert.alert('Transcrição', error?.message || 'Não foi possível transcrever o áudio.')
                        } finally {
                            setIsTranscribing(false)
                        }
                    }
                    recorder.start(250)
                } catch (error: any) {
                    updateListeningState(false)
                    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
                    Alert.alert(
                        'Microfone',
                        denied
                            ? 'Permissão de microfone negada. Libere o acesso nas configurações do navegador.'
                            : error?.message || 'Não foi possível acessar o microfone.'
                    )
                }
                return
            }

            if (!SpeechRecognitionAPI) {
                updateVoiceMode(null)
                Alert.alert(
                    'Microfone indisponível',
                    'Este navegador não expõe acesso ao microfone. Abra o BioDash diretamente no Chrome, Edge, Safari ou Firefox.'
                )
                return
            }

            webShouldKeepListeningRef.current = true
            webManualStopRef.current = false
            webTranscriptRef.current = ''
            webTranscriptPrefixRef.current = ''
            updateListeningState(true)
            setInputText('')

            const finishWebRecognition = () => {
                const transcript = webTranscriptRef.current.trim()
                webShouldKeepListeningRef.current = false
                webManualStopRef.current = false
                webTranscriptPrefixRef.current = ''
                updateListeningState(false)
                if (transcript) {
                    setInputText(transcript)
                    void sendMessage(transcript)
                }
            }

            const startWebSession = () => {
                if (!webShouldKeepListeningRef.current || voiceInputModeRef.current !== mode) return

                const recognition = new SpeechRecognitionAPI()
                webRecognitionRef.current = recognition
                recognition.lang = 'pt-BR'
                recognition.interimResults = true
                recognition.maxAlternatives = 1
                // Mantém o microfone ativo até o usuário encerrar o gesto.
                recognition.continuous = true

                recognition.onresult = (event: any) => {
                    try {
                        const sessionTranscript = Array.from(event.results as ArrayLike<any>)
                            .map((result: any) => result[0]?.transcript ?? '')
                            .join(' ')
                            .trim()
                        const transcript = [webTranscriptPrefixRef.current, sessionTranscript]
                            .filter(Boolean)
                            .join(' ')
                            .trim()
                        webTranscriptRef.current = transcript
                        setInputText(transcript)
                    } catch {
                        webShouldKeepListeningRef.current = false
                        updateListeningState(false)
                    }
                }

                recognition.onerror = (event: any) => {
                    const recoverableError = event.error === 'no-speech' || event.error === 'aborted'
                    if (recoverableError && (webShouldKeepListeningRef.current || webManualStopRef.current)) return

                    webShouldKeepListeningRef.current = false
                    updateListeningState(false)
                    const msgs: Record<string, string> = {
                        'not-allowed': 'Permissão de microfone negada. Libere o microfone nas permissões do navegador e tente novamente.',
                        'no-speech': 'Nenhuma fala detectada.',
                        'audio-capture': 'Microfone não encontrado.',
                        'network': 'O serviço de reconhecimento de voz do navegador está indisponível. Verifique a conexão ou tente no Chrome/Edge.',
                        'service-not-allowed': 'O navegador bloqueou o serviço de reconhecimento de voz.',
                        'language-not-supported': 'O navegador não oferece reconhecimento de voz em português.',
                        'aborted': '',
                    }
                    const msg = msgs[event.error]
                    console.warn('[Microfone Web] Erro no reconhecimento:', event.error, event.message || '')
                    if (msg) Alert.alert('Microfone', msg)
                }

                recognition.onend = () => {
                    if (webRecognitionRef.current === recognition) {
                        webRecognitionRef.current = null
                    }

                    if (webManualStopRef.current) {
                        finishWebRecognition()
                        return
                    }

                    if (webShouldKeepListeningRef.current && voiceInputModeRef.current === mode) {
                        webTranscriptPrefixRef.current = webTranscriptRef.current.trim()
                        setTimeout(startWebSession, 150)
                        return
                    }

                    updateListeningState(false)
                }

                try {
                    recognition.start()
                } catch (e: any) {
                    webRecognitionRef.current = null
                    webShouldKeepListeningRef.current = false
                    updateListeningState(false)
                    Alert.alert('Erro ao iniciar microfone', e?.message || String(e))
                }
            }

            startWebSession()
            return
        }

        // ── Nativo (iOS / Android) via expo-speech-recognition ─────────────
        // Solicita permissão de microfone
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
        if (!result.granted) {
            updateVoiceMode(null)
            Alert.alert(
                'Permissão negada',
                'O acesso ao microfone é necessário para o ditado por voz.\n\nVá em Configurações → Aplicativos → BioDash → Permissões → Microfone.'
            )
            return
        }

        // O usuário pode soltar o botão enquanto o sistema exibe a permissão.
        if (voiceInputModeRef.current !== mode) return

        updateListeningState(true)
        setInputText('')

        try {
            ExpoSpeechRecognitionModule.start({
                lang: 'pt-BR',
                interimResults: true,   // transcrição em tempo real
                maxAlternatives: 1,
                continuous: false,
                volumeChangeEventOptions: { enabled: false },
            })
        } catch (e: any) {
            updateListeningState(false)
            Alert.alert('Erro ao iniciar microfone', e?.message || String(e))
        }
    }

    const stopVoiceRecognition = () => {
        const hadActiveSession = isListeningRef.current

        if (Platform.OS === 'web') {
            const recorder = webMediaRecorderRef.current
            if (recorder && recorder.state !== 'inactive') {
                updateListeningState(false)
                recorder.stop()
                return
            }

            webShouldKeepListeningRef.current = false
            webManualStopRef.current = hadActiveSession
            updateListeningState(false)

            if (!hadActiveSession) return

            const recognition = webRecognitionRef.current
            if (recognition) {
                try {
                    recognition.stop()
                    return
                } catch {
                    webRecognitionRef.current = null
                }
            }

            // Se o navegador encerrou entre ciclos, finaliza sem esperar onend.
            webManualStopRef.current = false
            const transcript = webTranscriptRef.current.trim()
            webTranscriptPrefixRef.current = ''
            if (transcript) {
                setInputText(transcript)
                void sendMessage(transcript)
            }
            return
        }

        updateListeningState(false)
        if (hadActiveSession) ExpoSpeechRecognitionModule.stop()
    }

    const handleMicPress = () => {
        if (ignoreNextMicPressRef.current) {
            ignoreNextMicPressRef.current = false
            return
        }
        if (isTranscribing) return
        if (isListeningRef.current || voiceInputModeRef.current) {
            stopVoiceRecognition()
            return
        }

        void startVoiceRecognition('tap')
    }

    const handleMicLongPress = () => {
        if (isTranscribing || isListeningRef.current || voiceInputModeRef.current) return
        ignoreNextMicPressRef.current = true
        void startVoiceRecognition('hold')
    }

    const handleMicPressOut = () => {
        if (voiceInputModeRef.current === 'hold') {
            stopVoiceRecognition()
        }
    }

    // ─── Ações automáticas disparadas pelo chatbot ───────────────────────────
    const handleChatAction = async (action: string | null | undefined, indicatorsOverride?: any[]) => {
        if (!action) return

        // Ações de início de fluxo conversacional
        if (action === 'start_flow_manutencao') { setActiveFlow({ type: 'agendar_manutencao', step: 'nome', data: {} }); return }
        if (action === 'start_flow_metrica') { setActiveFlow({ type: 'incluir_metrica', step: 'residuos', data: {} }); return }
        if (action === 'start_flow_editar_metrica') { setActiveFlow({ type: 'editar_metrica', step: 'mes_ano', data: {} }); return }
        if (action === 'start_flow_endereco') { setActiveFlow({ type: 'adicionar_endereco', step: 'nome', data: {} }); return }
        if (action === 'start_flow_relatorio') { setActiveFlow({ type: 'relatorio_periodo', step: 'periodo_inicio', data: {} }); return }
        if (action === 'cancel_flow') { setActiveFlow(null); return }

        try {
            const indicators = indicatorsOverride ?? cachedIndicators.current
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
        let csv = '\uFEFFMês;Resíduos Processados (kg);Energia Gerada (kWh);Benefícios Fiscais (R$)\n'
        const sorted = [...indicators].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())
        sorted.forEach((r: any) => {
            const d = new Date(r.measured_at)
            const period = `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`
            csv += `${period};${Number(r.waste_processed||0).toFixed(2)};${Number(r.energy_generated||0).toFixed(2)};${Number(r.tax_savings||0).toFixed(2)}\n`
        })
        const totals = indicators.reduce((acc, r) => ({
            waste: acc.waste + Number(r.waste_processed || 0),
            energy: acc.energy + Number(r.energy_generated || 0),
            tax: acc.tax + Number(r.tax_savings || 0),
        }), { waste: 0, energy: 0, tax: 0 })
        csv += `\nTOTAL;${totals.waste.toFixed(2)};${totals.energy.toFixed(2)};${totals.tax.toFixed(2)}\n`
        csv += `Total de Registros;${indicators.length};;`
        return csv
    }

    // ─── Fluxos Conversacionais ──────────────────────────────────────────────

    const processFlowStep = async (text: string) => {
        if (!activeFlow) return
        if (isCancel(text)) { setActiveFlow(null); addBotMessage('❌ Operação cancelada. Como posso ajudar?'); return }
        switch (activeFlow.type) {
            case 'agendar_manutencao': await processManutencaoStep(text); break
            case 'incluir_metrica':    await processMetricaStep(text);    break
            case 'editar_metrica':     await processEditarMetricaStep(text); break
            case 'adicionar_endereco': await processEnderecoStep(text);   break
            case 'relatorio_periodo':  await processRelatorioStep(text);  break
        }
    }

    const processManutencaoStep = async (text: string) => {
        const flow = activeFlow!; const data = { ...flow.data }
        if (flow.step === 'nome') {
            data.name = text.trim(); setActiveFlow({ ...flow, step: 'prioridade', data })
            addBotMessage(`📋 Nome: *${data.name}*\n\nQual a **prioridade**?\n• alta (urgente)\n• média\n• baixa`); return
        }
        if (flow.step === 'prioridade') {
            const p = parsePriority(text) || 'medium'; data.priority = p; setActiveFlow({ ...flow, step: 'data', data })
            addBotMessage(`${PRIORITY_LABELS[p]} registrada.\n\nPara qual **data**?\n(ex: 25/10/2025 ou "25 de outubro de 2025")`); return
        }
        if (flow.step === 'data') {
            let day = 1, month = new Date().getMonth(), year = new Date().getFullYear()
            const dm = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/)
            if (dm) {
                day = parseInt(dm[1]); month = parseInt(dm[2]) - 1
                if (dm[3]) { year = parseInt(dm[3]); if (year < 100) year += 2000 }
            } else {
                const m = parseMonth(text); const y = parseYear(text); const dayM = text.match(/\b(\d{1,2})\b/)
                if (m !== null) month = m; if (y !== null) year = y
                if (dayM) { const d = parseInt(dayM[1]); if (d >= 1 && d <= 31) day = d }
            }
            data.scheduledDate = new Date(year, month, day).toISOString()
            data.dateLabel = `${padDate(day)}/${padDate(month+1)}/${year}`
            setActiveFlow({ ...flow, step: 'confirmar', data })
            addBotMessage(`✅ Pronto para confirmar:\n\n• Nome: *${data.name}*\n• Prioridade: *${PRIORITY_LABELS[data.priority]}*\n• Data: *${data.dateLabel}*\n\nResponda **sim** ou **não**.`); return
        }
        if (flow.step === 'confirmar') {
            if (isConfirm(text)) {
                try {
                    const result = await maintenanceApi.createSchedule({ name: data.name, priority: data.priority, scheduledDate: data.scheduledDate })
                    if (!result.success) throw new Error(result.error)
                    setActiveFlow(null); dataLoaded.current = false
                    addBotMessage(`✅ Manutenção *"${data.name}"* agendada para *${data.dateLabel}*!\n\nVisível na aba Manutenção do Dashboard.`)
                } catch { addBotMessage('❌ Erro ao agendar. Tente novamente.'); setActiveFlow(null) }
            } else {
                addBotMessage('⚠️ Não entendi a confirmação. Responda **sim** para agendar ou **não** para cancelar.')
            }
        }
    }

    const processMetricaStep = async (text: string) => {
        const flow = activeFlow!; const data = { ...flow.data }
        if (flow.step === 'residuos') {
            const v = parseNumber(text)
            if (v === null) { addBotMessage('⚠️ Informe o valor em kg. (ex: 150 ou 150 kg)'); return }
            data.wasteProcessed = v; setActiveFlow({ ...flow, step: 'energia', data })
            addBotMessage(`♻️ Resíduos: *${v} kg*\n\nQual a **energia gerada** em kWh?`); return
        }
        if (flow.step === 'energia') {
            const v = parseNumber(text)
            if (v === null) { addBotMessage('⚠️ Informe o valor em kWh. (ex: 92.5)'); return }
            data.energyGenerated = v; setActiveFlow({ ...flow, step: 'economia', data })
            addBotMessage(`⚡ Energia: *${v} kWh*\n\nQual o valor de **benefícios fiscais** em R$?`); return
        }
        if (flow.step === 'economia') {
            const v = parseNumber(text)
            if (v === null) { addBotMessage('⚠️ Informe o valor em reais. (ex: 340)'); return }
            data.taxSavings = v; setActiveFlow({ ...flow, step: 'mes', data })
            addBotMessage(`💰 Benefícios: *R$ ${v}*\n\nA qual **mês** se referem? (ex: outubro ou 10)`); return
        }
        if (flow.step === 'mes') {
            const m = parseMonth(text)
            if (m === null) { addBotMessage('⚠️ Informe o mês por nome ou número. (ex: outubro ou 10)'); return }
            data.month = m; setActiveFlow({ ...flow, step: 'ano', data })
            addBotMessage(`📅 Mês: *${MONTH_NAMES[m]}*\n\nE o **ano**? (ex: 2025)`); return
        }
        if (flow.step === 'ano') {
            const y = parseYear(text) ?? new Date().getFullYear(); data.year = y
            setActiveFlow({ ...flow, step: 'confirmar', data })
            addBotMessage(`Confirmar registro?\n\n• Resíduos: *${data.wasteProcessed} kg*\n• Energia: *${data.energyGenerated} kWh*\n• Benefícios: *R$ ${data.taxSavings}*\n• Período: *${MONTH_NAMES[data.month]} / ${data.year}*\n\nResponda **sim** ou **não**.`); return
        }
        if (flow.step === 'confirmar') {
            if (isConfirm(text)) {
                try {
                    const result = await indicatorsApi.save({ wasteProcessed: data.wasteProcessed, energyGenerated: data.energyGenerated, taxSavings: data.taxSavings, month: String(data.month), year: String(data.year) })
                    if (!result.success) throw new Error(result.error)
                    dataLoaded.current = false; await loadUserData(); setActiveFlow(null)
                    addBotMessage(`✅ Métricas de *${MONTH_NAMES[data.month]}/${data.year}* registradas com sucesso!`)
                } catch { addBotMessage('❌ Erro ao salvar. Tente novamente.'); setActiveFlow(null) }
            } else {
                addBotMessage('⚠️ Não entendi a confirmação. Responda **sim** para salvar ou **não** para cancelar.')
            }
        }
    }

    const processEditarMetricaStep = async (text: string) => {
        const flow = activeFlow!; const data = { ...flow.data }
        if (flow.step === 'mes_ano') {
            const m = parseMonth(text); const y = parseYear(text) ?? new Date().getFullYear()
            if (m === null) { addBotMessage('⚠️ Informe mês e ano. (ex: outubro 2025)'); return }
            data.month = m; data.year = y
            const ex = cachedIndicators.current.find((ind: any) => { const d = new Date(ind.measured_at); return d.getMonth() === m && d.getFullYear() === y })
            if (ex) { data.wasteProcessed = ex.waste_processed || 0; data.energyGenerated = ex.energy_generated || 0; data.taxSavings = ex.tax_savings || 0 }
            setActiveFlow({ ...flow, step: 'residuos', data })
            const note = ex ? `\n\nAtual: *${data.wasteProcessed} kg* — informe o novo valor` : ''
            addBotMessage(`✏️ Editando *${MONTH_NAMES[m]} ${y}*${note}\n\nNovo valor de **resíduos processados** em kg?`); return
        }
        if (flow.step === 'residuos') {
            const v = parseNumber(text); if (v === null) { addBotMessage('⚠️ Informe em kg.'); return }
            data.wasteProcessed = v; setActiveFlow({ ...flow, step: 'energia', data })
            addBotMessage(`♻️ *${v} kg*\n\nNovo valor de **energia gerada** em kWh?`); return
        }
        if (flow.step === 'energia') {
            const v = parseNumber(text); if (v === null) { addBotMessage('⚠️ Informe em kWh.'); return }
            data.energyGenerated = v; setActiveFlow({ ...flow, step: 'economia', data })
            addBotMessage(`⚡ *${v} kWh*\n\nNovo valor de **benefícios fiscais** em R$?`); return
        }
        if (flow.step === 'economia') {
            const v = parseNumber(text); if (v === null) { addBotMessage('⚠️ Informe em reais.'); return }
            data.taxSavings = v; setActiveFlow({ ...flow, step: 'confirmar', data })
            addBotMessage(`Confirmar edição de *${MONTH_NAMES[data.month]}/${data.year}*?\n\n• Resíduos: *${data.wasteProcessed} kg*\n• Energia: *${data.energyGenerated} kWh*\n• Benefícios: *R$ ${data.taxSavings}*\n\nResponda **sim** ou **não**.`); return
        }
        if (flow.step === 'confirmar') {
            if (isConfirm(text)) {
                try {
                    const result = await indicatorsApi.save({ wasteProcessed: data.wasteProcessed, energyGenerated: data.energyGenerated, taxSavings: data.taxSavings, month: String(data.month), year: String(data.year) })
                    if (!result.success) throw new Error(result.error)
                    dataLoaded.current = false; await loadUserData(); setActiveFlow(null)
                    addBotMessage(`✅ Métricas de *${MONTH_NAMES[data.month]}/${data.year}* atualizadas!`)
                } catch { addBotMessage('❌ Erro ao atualizar.'); setActiveFlow(null) }
            } else {
                addBotMessage('⚠️ Não entendi a confirmação. Responda **sim** para salvar a edição ou **não** para cancelar.')
            }
        }
    }

    const processEnderecoStep = async (text: string) => {
        const flow = activeFlow!; const data = { ...flow.data }
        if (flow.step === 'nome') {
            data.title = text.trim(); setActiveFlow({ ...flow, step: 'cep', data })
            addBotMessage(`📍 Nome: *${data.title}*\n\nQual o **CEP**? (ex: 01310-100 ou 01310100)`); return
        }
        if (flow.step === 'cep') {
            const cep = text.replace(/\D/g, '')
            if (cep.length !== 8) { addBotMessage('⚠️ CEP inválido. Informe 8 dígitos. (ex: 01310100)'); return }
            addBotMessage('🔍 Buscando endereço pelo CEP...')
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
                const addr = await res.json()
                if (addr.erro) { addBotMessage('⚠️ CEP não encontrado. Verifique e tente novamente.'); return }
                data.cep = cep; data.street = addr.logradouro || ''; data.city = addr.localidade || ''; data.state = addr.uf || ''; data.complement = addr.complemento || ''
                setActiveFlow({ ...flow, step: 'numero', data })
                addBotMessage(`✅ Endereço:\n• Rua: *${data.street || 'Não informado'}*\n• Cidade: *${data.city} - ${data.state}*\n\nQual o **número**? (ex: 123 ou S/N)`)
            } catch { addBotMessage('❌ Erro ao buscar o CEP. Verifique sua conexão.') }
            return
        }
        if (flow.step === 'numero') {
            data.number = text.trim(); setActiveFlow({ ...flow, step: 'confirmar', data })
            addBotMessage(`Confirmar cadastro?\n\n• Nome: *${data.title}*\n• Endereço: *${data.street}, ${data.number}*\n• CEP: *${data.cep}*\n• Cidade: *${data.city} - ${data.state}*\n\n⚠️ A posição no mapa será geolocalizada e pode ser ajustada depois.\n\nResponda **sim** ou **não**.`); return
        }
        if (flow.step === 'confirmar') {
            if (isConfirm(text)) {
                try {
                    let lat = -14.235, lng = -51.925
                    try {
                        const q = encodeURIComponent(`${data.street}, ${data.number}, ${data.city}, ${data.state}, Brasil`)
                        const gr = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, { headers: { 'User-Agent': 'BioDashApp/1.0' } })
                        const gd = await gr.json()
                        if (gd.length > 0) { lat = parseFloat(gd[0].lat); lng = parseFloat(gd[0].lon) }
                    } catch {}
                    const result = await markersApi.save({ title: data.title, latitude: lat, longitude: lng, description: `${data.street}, ${data.number} - ${data.city}/${data.state} - CEP: ${data.cep}`, address: { street: data.street, number: data.number, cep: data.cep, city: data.city, state: data.state, complement: data.complement } })
                    if (!result.success) throw new Error(result.error)
                    dataLoaded.current = false; setActiveFlow(null)
                    addBotMessage(`✅ Biodigestor *"${data.title}"* cadastrado! Ele aparecerá no mapa — ajuste o pin se necessário.`)
                } catch { addBotMessage('❌ Erro ao cadastrar. Tente novamente.'); setActiveFlow(null) }
            } else {
                addBotMessage('⚠️ Não entendi a confirmação. Responda **sim** para cadastrar ou **não** para cancelar.')
            }
        }
    }

    const processRelatorioStep = async (text: string) => {
        const flow = activeFlow!; const data = { ...flow.data }
        if (flow.step === 'periodo_inicio') {
            const m = parseMonth(text); const y = parseYear(text) ?? new Date().getFullYear()
            if (m === null) { addBotMessage('⚠️ Não entendi. Ex: "janeiro 2025" ou "01/2025"'); return }
            data.startMonth = m; data.startYear = y; setActiveFlow({ ...flow, step: 'periodo_fim', data })
            addBotMessage(`📅 Início: *${MONTH_NAMES[m]} ${y}*\n\nAgora o **mês e ano final**? (ex: junho 2025)`); return
        }
        if (flow.step === 'periodo_fim') {
            const m = parseMonth(text); const y = parseYear(text) ?? new Date().getFullYear()
            if (m === null) { addBotMessage('⚠️ Não entendi. Ex: "junho 2025"'); return }
            data.endMonth = m; data.endYear = y; setActiveFlow({ ...flow, step: 'formato', data })
            addBotMessage(`📅 Fim: *${MONTH_NAMES[m]} ${y}*\n\nQual o **formato**?\n• PDF\n• CSV\n• Excel`); return
        }
        if (flow.step === 'formato') {
            const lower = text.toLowerCase()
            let fmt = 'pdf'
            if (lower.includes('csv')) fmt = 'csv'
            else if (lower.includes('excel') || lower.includes('xlsx')) fmt = 'excel'
            const filtered = cachedIndicators.current.filter((ind: any) => {
                const d = new Date(ind.measured_at); const im = d.getMonth(); const iy = d.getFullYear()
                return (iy > data.startYear || (iy === data.startYear && im >= data.startMonth)) &&
                       (iy < data.endYear   || (iy === data.endYear   && im <= data.endMonth))
            })
            setActiveFlow(null)
            if (filtered.length === 0) {
                addBotMessage(`⚠️ Nenhum dado para *${MONTH_NAMES[data.startMonth]}/${data.startYear}* a *${MONTH_NAMES[data.endMonth]}/${data.endYear}*.`); return
            }
            addBotMessage(`📊 Gerando *${fmt.toUpperCase()}* de *${MONTH_NAMES[data.startMonth]}/${data.startYear}* a *${MONTH_NAMES[data.endMonth]}/${data.endYear}* (${filtered.length} registro(s))...`)
            await handleChatAction(`export_${fmt}`, filtered)
        }
    }

    // ─── Enviar mensagem para o chatbot ─────────────────────────────────────
    const sendMessage = async (text?: string) => {
        const messageText = (text || inputText).trim()
        if (!messageText) return
        Keyboard.dismiss()

        // Se há um fluxo ativo, a mensagem alimenta o wizard (não vai ao chatbot)
        if (activeFlow) {
            const userMsg: Message = { id: Date.now().toString(), role: 'user', text: messageText, timestamp: new Date() }
            setMessages(prev => [...prev, userMsg])
            setInputText('')
            setIsLoading(true)
            scrollToBottom()
            await processFlowStep(messageText)
            setIsLoading(false)
            return
        }

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
                        : 'Desculpe, não consegui processar sua mensagem. Verifique o serviço do assistente.',
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
                text: `Erro ao conectar com o assistente de IA. Detalhe: ${err?.message || String(err)}`,
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
        { label: '🔧 Manutenção', text: 'Agendar manutenção' },
        { label: '📈 Registrar', text: 'Adicionar métricas' },
        { label: '📍 Novo BD', text: 'Adicionar biodigestor' },
        { label: '📅 Por Período', text: 'Relatório por período' },
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
                {isListening && (
                    <View style={styles.micStatusRow}>
                        <View style={styles.micStatusDot} />
                        <Text style={styles.micStatusText}>
                            {voiceInputMode === 'hold'
                                ? 'Gravando — solte para concluir'
                                : 'Gravando — toque no microfone para concluir'}
                        </Text>
                    </View>
                )}
                {isTranscribing && (
                    <View style={styles.micStatusRow}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={[styles.micStatusText, { color: colors.primary }]}>Transcrevendo áudio...</Text>
                    </View>
                )}
                <View style={[styles.inputRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <TextInput
                        style={[
                            styles.textInput,
                            { color: colors.text },
                            isListening && { color: '#ef4444' }
                        ]}
                        placeholder={isListening ? '🔴 Ouvindo... fale agora' : isTranscribing ? 'Transcrevendo áudio...' : 'Digite sua mensagem...'}
                        placeholderTextColor={isListening ? '#ef4444' : colors.textMuted}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={500}
                        onSubmitEditing={() => sendMessage()}
                        editable={!isTranscribing}
                        id="chatbot-message-input"
                    />

                    {/* Botão de Microfone */}
                    <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                        <TouchableOpacity
                            style={[
                                styles.micBtn,
                                { backgroundColor: isListening ? '#ef4444' : colors.iconBg }
                            ]}
                            onPress={handleMicPress}
                            onLongPress={handleMicLongPress}
                            onPressOut={handleMicPressOut}
                            delayLongPress={350}
                            accessibilityRole="button"
                            accessibilityLabel="Microfone"
                            accessibilityHint="Toque para iniciar ou concluir. Mantenha pressionado para gravar e solte para concluir."
                            accessibilityState={{ selected: isListening, disabled: isTranscribing }}
                            disabled={isTranscribing}
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
                        style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (!inputText.trim() || isLoading || isTranscribing) ? 0.5 : 1 }]}
                        onPress={() => sendMessage()}
                        disabled={!inputText.trim() || isLoading || isTranscribing}
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
    micStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingBottom: 7,
    },
    micStatusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    micStatusText: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '600',
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
