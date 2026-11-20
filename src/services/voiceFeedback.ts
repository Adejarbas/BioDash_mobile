export const NO_SPEECH_RECOGNIZED_MESSAGE =
    'Desculpe, mas não consegui reconhecer sua fala.\n\n' +
    'Dicas para melhorar o reconhecimento de voz:\n' +
    '• Fale mais perto do microfone e em um ritmo claro\n' +
    '• Procure um ambiente com menos ruído ao redor\n' +
    '• Mantenha a gravação ativa por pelo menos 1 segundo antes de encerrar\n' +
    '• Verifique se o microfone não está obstruído ou no mudo'

/**
 * Verifica se uma mensagem de erro retornada pela API ou pelo navegador
 * indica ausência de fala reconhecida.
 */
export function isNoSpeechRecognitionError(error?: string | null): boolean {
    if (!error) return false
    const normalized = error.toLowerCase()
    return (
        normalized.includes('nenhuma fala') ||
        normalized.includes('no speech') ||
        normalized.includes('no-speech') ||
        normalized.includes('fala não reconhecida') ||
        normalized.includes('não foi possível reconhecer')
    )
}
