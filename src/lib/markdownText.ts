export interface MarkdownSegment {
    text: string
    bold?: boolean
    italic?: boolean
}

const INLINE_MARKDOWN_REGEX = /(\*\*[^*]+\*\*|\*[^*]+\*)/g

/**
 * Converte marcações simples (**negrito** e *itálico*) em segmentos estilizados,
 * evitando que asteriscos literais apareçam na UI ou sejam lidos por leitores de tela.
 */
export function parseInlineMarkdown(input: string): MarkdownSegment[] {
    if (!input) return []

    const parts = input.split(INLINE_MARKDOWN_REGEX)
    const segments: MarkdownSegment[] = []

    for (const part of parts) {
        if (!part) continue
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            segments.push({ text: part.slice(2, -2), bold: true })
        } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            segments.push({ text: part.slice(1, -1), italic: true })
        } else {
            segments.push({ text: part })
        }
    }

    return segments
}

/**
 * Remove delimitadores simples de markdown para leitura acessível em leitores de tela.
 */
export function stripMarkdown(input: string): string {
    return parseInlineMarkdown(input)
        .map((segment) => segment.text)
        .join('')
}
