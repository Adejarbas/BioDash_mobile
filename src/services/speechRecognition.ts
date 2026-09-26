import { useRef, useEffect } from 'react'

let ExpoSpeechRecognitionModule: any = null
let isSpeechRecognitionAvailable = false

try {
    // Tenta carregar o módulo nativo dinamicamente.
    // No Expo Go ou em ambientes sem a compilação nativa, requireNativeModule() lança uma exceção
    // que é capturada com segurança aqui, evitando o crash na inicialização do aplicativo.
    const mod = require('expo-speech-recognition')
    if (mod && mod.ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule
        isSpeechRecognitionAvailable = true
    }
} catch {
    ExpoSpeechRecognitionModule = null
    isSpeechRecognitionAvailable = false
}

export { ExpoSpeechRecognitionModule, isSpeechRecognitionAvailable }

/**
 * Hook seguro para escuta de eventos do ExpoSpeechRecognition.
 * No Expo Go (onde o módulo nativo não está presente), executa como no-op seguro
 * sem violar as regras de Hooks do React.
 */
export function useSpeechRecognitionEvent(
    eventName: string,
    listener: (event: any) => void
): void {
    const listenerRef = useRef(listener)
    listenerRef.current = listener

    useEffect(() => {
        if (!isSpeechRecognitionAvailable || !ExpoSpeechRecognitionModule?.addListener) {
            return
        }

        const callback = (event: any[]) => listenerRef.current(event)
        const subscription = ExpoSpeechRecognitionModule.addListener(eventName, callback)

        return () => {
            subscription?.remove?.()
        }
    }, [eventName])
}
