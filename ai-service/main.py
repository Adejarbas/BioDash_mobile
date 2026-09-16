"""
BioDash AI Service
==================
Microserviço Python para PLN (Processamento de Linguagem Natural).
- Chatbot com TF-IDF + SVM (scikit-learn)
- Busca Semântica por biodigestores (similaridade de cosseno)

Run: uvicorn main:app --host 0.0.0.0 --port 5000 --reload
"""

import os
import json
import re
from typing import Optional, List, Any, Dict

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.metrics.pairwise import cosine_similarity

# ──────────────────────────────────────────────────────────────────────────────
# APP SETUP
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="BioDash AI Service",
    description="Chatbot (TF-IDF + SVM) e Busca Semântica para o BioDash",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# 1. TREINAMENTO DO CHATBOT (TF-IDF + SVM)
# ──────────────────────────────────────────────────────────────────────────────

# Dataset de treinamento: frases em português por intenção
TRAINING_DATA = [
    # ─── SAUDAÇÃO ───────────────────────────────────────────────────────────
    ("saudacao", "olá"),
    ("saudacao", "oi"),
    ("saudacao", "bom dia"),
    ("saudacao", "boa tarde"),
    ("saudacao", "boa noite"),
    ("saudacao", "olá tudo bem"),
    ("saudacao", "ei"),
    ("saudacao", "oi tudo bem"),
    ("saudacao", "olá como vai"),
    ("saudacao", "oi biodash"),
    ("saudacao", "hey"),
    ("saudacao", "salve"),
    ("saudacao", "e aí"),
    ("saudacao", "oi oi"),
    ("saudacao", "olá tenho uma pergunta"),
    ("saudacao", "bom dia preciso de ajuda"),

    # ─── PEDIDO: Endereço ────────────────────────────────────────────────────
    ("pedido_endereco", "qual é o endereço do biodigestor"),
    ("pedido_endereco", "onde fica o biodigestor"),
    ("pedido_endereco", "me diz o endereço"),
    ("pedido_endereco", "localização do biodigestor"),
    ("pedido_endereco", "onde está o biodigestor"),
    ("pedido_endereco", "endereço"),
    ("pedido_endereco", "qual a localização"),
    ("pedido_endereco", "me mostra o endereço"),
    ("pedido_endereco", "qual o local do biodigestor"),
    ("pedido_endereco", "me informa o endereço do biodigestor"),
    ("pedido_endereco", "onde fica"),
    ("pedido_endereco", "localização"),

    # ─── PEDIDO: Métricas (Resíduos) ────────────────────────────────────────
    ("pedido_residuos", "quantos resíduos foram processados"),
    ("pedido_residuos", "me mostra os resíduos"),
    ("pedido_residuos", "qual a quantidade de resíduos"),
    ("pedido_residuos", "resíduos processados"),
    ("pedido_residuos", "quanto de resíduo"),
    ("pedido_residuos", "me informa os resíduos"),
    ("pedido_residuos", "resíduos do biodigestor"),
    ("pedido_residuos", "quantos kg de resíduos"),
    ("pedido_residuos", "processamento de resíduos"),
    ("pedido_residuos", "dados de resíduos"),

    # ─── PEDIDO: Métricas (Energia) ─────────────────────────────────────────
    ("pedido_energia", "quanta energia foi gerada"),
    ("pedido_energia", "me mostra a energia gerada"),
    ("pedido_energia", "energia gerada"),
    ("pedido_energia", "geração de energia"),
    ("pedido_energia", "quanto de energia"),
    ("pedido_energia", "energia do biodigestor"),
    ("pedido_energia", "me informa a energia"),
    ("pedido_energia", "quantos kwh"),
    ("pedido_energia", "energia em kwh"),
    ("pedido_energia", "dados de energia"),

    # ─── PEDIDO: Métricas (Ambos) ────────────────────────────────────────────
    ("pedido_metricas", "quais são as métricas do biodigestor"),
    ("pedido_metricas", "me mostra as métricas"),
    ("pedido_metricas", "como está o biodigestor"),
    ("pedido_metricas", "status do biodigestor"),
    ("pedido_metricas", "dados do biodigestor"),
    ("pedido_metricas", "indicadores do biodigestor"),
    ("pedido_metricas", "me informa as métricas"),
    ("pedido_metricas", "relatório do biodigestor"),
    ("pedido_metricas", "energia e resíduos"),
    ("pedido_metricas", "como está funcionando o biodigestor"),
    ("pedido_metricas", "informações sobre o biodigestor"),
    ("pedido_metricas", "me mostra tudo sobre o biodigestor"),

    # ─── PEDIDO: Exportar PDF ────────────────────────────────────────────────
    ("pedido_exportar_pdf", "gera um pdf"),
    ("pedido_exportar_pdf", "exportar pdf"),
    ("pedido_exportar_pdf", "quero um relatório em pdf"),
    ("pedido_exportar_pdf", "me manda um pdf"),
    ("pedido_exportar_pdf", "gerar relatório pdf"),
    ("pedido_exportar_pdf", "baixar pdf"),
    ("pedido_exportar_pdf", "criar pdf"),

    # ─── PEDIDO: Exportar CSV ────────────────────────────────────────────────
    ("pedido_exportar_csv", "gera um csv"),
    ("pedido_exportar_csv", "exportar csv"),
    ("pedido_exportar_csv", "quero um arquivo csv"),
    ("pedido_exportar_csv", "me manda um csv"),
    ("pedido_exportar_csv", "gerar csv"),
    ("pedido_exportar_csv", "baixar csv"),
    ("pedido_exportar_csv", "criar csv"),

    # ─── PEDIDO: Exportar Excel ──────────────────────────────────────────────
    ("pedido_exportar_excel", "gera um excel"),
    ("pedido_exportar_excel", "exportar excel"),
    ("pedido_exportar_excel", "quero um arquivo excel"),
    ("pedido_exportar_excel", "me manda um excel"),
    ("pedido_exportar_excel", "gerar excel"),
    ("pedido_exportar_excel", "baixar excel"),
    ("pedido_exportar_excel", "criar excel"),
    ("pedido_exportar_excel", "planilha excel"),

    # ─── DESPEDIDA ───────────────────────────────────────────────────────────
    ("despedida", "tchau"),
    ("despedida", "até logo"),
    ("despedida", "até mais"),
    ("despedida", "obrigado"),
    ("despedida", "valeu"),
    ("despedida", "encerrar"),
    ("despedida", "finalizar"),
    ("despedida", "até"),
    ("despedida", "muito obrigado"),
    ("despedida", "obrigada"),
    ("despedida", "agradeço"),
    ("despedida", "encerrando"),
    ("despedida", "foi ótimo obrigado"),
    ("despedida", "tudo certo obrigado"),
]

# Separa labels e frases
train_labels, train_texts = zip(*TRAINING_DATA)

# Treina o TF-IDF (tf-idf com uni e bi-gramas)
vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    min_df=1,
    analyzer='char_wb',
    sublinear_tf=True
)
X_train = vectorizer.fit_transform(train_texts)

# Treina o SVM
svm_model = SVC(
    kernel='linear',
    C=1.0,
    probability=True
)
svm_model.fit(X_train, train_labels)

print("[OK] Modelo TF-IDF + SVM treinado com sucesso!")
print(f"   Classes: {list(svm_model.classes_)}")

# ──────────────────────────────────────────────────────────────────────────────
# 2. SCHEMAS (Pydantic)
# ──────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    markers: Optional[List[Dict[str, Any]]] = []     # Biodigestores do usuário
    indicators: Optional[List[Dict[str, Any]]] = []  # Métricas do usuário


class ChatResponse(BaseModel):
    intent: str
    response: str
    confidence: float
    action: Optional[str] = None  # "export_pdf", "export_csv", "export_excel"


class SemanticSearchRequest(BaseModel):
    query: str
    markers: List[Dict[str, Any]]


class SemanticSearchResponse(BaseModel):
    results: List[Dict[str, Any]]


# ──────────────────────────────────────────────────────────────────────────────
# 3. HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    """Normaliza texto: minúsculas, remove acentos básicos."""
    text = text.lower().strip()
    replacements = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a',
        'é': 'e', 'ê': 'e', 'è': 'e',
        'í': 'i', 'î': 'i', 'ì': 'i',
        'ó': 'o', 'ô': 'o', 'õ': 'o', 'ò': 'o',
        'ú': 'u', 'û': 'u', 'ù': 'u',
        'ç': 'c', 'ñ': 'n',
    }
    for accented, plain in replacements.items():
        text = text.replace(accented, plain)
    return text


def build_marker_text(marker: Dict[str, Any]) -> str:
    """Cria uma string de texto searchable para um marcador."""
    parts = [marker.get("title", "")]
    addr = marker.get("address", {})
    if isinstance(addr, dict):
        parts.extend([
            addr.get("street", ""),
            addr.get("cep", ""),
            addr.get("city", ""),
            addr.get("complement", ""),
        ])
    elif isinstance(addr, str):
        parts.append(addr)
    desc = marker.get("description", "")
    if desc:
        parts.append(desc)
    return " ".join(filter(None, parts))


def format_marker_address(marker: Dict[str, Any]) -> str:
    """Formata o endereço de um marcador para exibição."""
    addr = marker.get("address", {})
    title = marker.get("title", "Biodigestor")
    if isinstance(addr, dict):
        street = addr.get("street", "")
        number = addr.get("number", "")
        cep = addr.get("cep", "")
        complement = addr.get("complement", "")
        city = addr.get("city", "")
        parts = []
        if street:
            parts.append(f"{street}{', ' + number if number else ''}")
        if complement:
            parts.append(complement)
        if cep:
            parts.append(f"CEP: {cep}")
        if city:
            parts.append(city)
        address_str = "\n".join(parts) if parts else marker.get("description", "Endereço não informado")
        return f"📍 *{title}*\n{address_str}"
    desc = marker.get("description", "Endereço não informado")
    return f"📍 *{title}*\n{desc}"


def format_indicators(indicators: List[Dict[str, Any]]) -> str:
    """Formata as métricas mais recentes para exibição."""
    if not indicators:
        return "Nenhuma métrica disponível. Adicione dados de indicadores no dashboard."
    latest = indicators[0]
    waste = latest.get("waste_processed", 0)
    energy = latest.get("energy_generated", 0)
    tax = latest.get("tax_savings", 0)
    return (
        f"📊 *Métricas do Biodigestor*\n"
        f"• Resíduos Processados: {waste:.2f} kg\n"
        f"• Energia Gerada: {energy:.2f} kWh\n"
        f"• Benefícios Fiscais: R$ {tax:.2f}"
    )


# ──────────────────────────────────────────────────────────────────────────────
# 4. ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "BioDash AI Service", "status": "running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chatbot", response_model=ChatResponse)
def chatbot_endpoint(req: ChatRequest):
    """
    Recebe uma mensagem do usuário, classifica a intenção com TF-IDF + SVM
    e retorna a resposta contextualizada com os dados do usuário.
    """
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem não pode ser vazia.")

    normalized = normalize_text(req.message)
    X_input = vectorizer.transform([normalized])

    probs = svm_model.predict_proba(X_input)[0]
    classes = svm_model.classes_
    best_idx = int(np.argmax(probs))
    intent = classes[best_idx]
    confidence = float(probs[best_idx])

    markers = req.markers or []
    indicators = req.indicators or []
    action = None

    # ─── Respostas por intenção ──────────────────────────────────────────────
    if intent == "saudacao":
        response = "Olá! Em que posso ajudar você hoje? 😊"

    elif intent == "pedido_endereco":
        if not markers:
            response = "Não encontrei nenhum biodigestor cadastrado. Adicione um marcador no mapa para ver o endereço."
        elif len(markers) == 1:
            response = format_marker_address(markers[0])
        else:
            addresses = "\n\n".join([format_marker_address(m) for m in markers[:5]])
            response = f"Encontrei {len(markers)} biodigestores cadastrados:\n\n{addresses}"

    elif intent == "pedido_residuos":
        if not indicators:
            response = "Nenhuma métrica de resíduos encontrada. Adicione dados no dashboard."
        else:
            latest = indicators[0]
            waste = latest.get("waste_processed", 0)
            response = f"♻️ *Resíduos Processados*\nÚltimo registro: *{waste:.2f} kg*\n\nPara o histórico completo, use a seção de Indicadores no dashboard."

    elif intent == "pedido_energia":
        if not indicators:
            response = "Nenhuma métrica de energia encontrada. Adicione dados no dashboard."
        else:
            latest = indicators[0]
            energy = latest.get("energy_generated", 0)
            response = f"⚡ *Energia Gerada*\nÚltimo registro: *{energy:.2f} kWh*\n\nPara o histórico completo, use a seção de Indicadores no dashboard."

    elif intent == "pedido_metricas":
        response = format_indicators(indicators)

    elif intent == "pedido_exportar_pdf":
        response = "📄 Vou gerar o relatório em *PDF* para você agora! Aguarde um instante..."
        action = "export_pdf"

    elif intent == "pedido_exportar_csv":
        response = "📊 Vou exportar os dados em *CSV* para você agora! Aguarde um instante..."
        action = "export_csv"

    elif intent == "pedido_exportar_excel":
        response = "📋 Vou exportar os dados em *Excel* para você agora! Aguarde um instante..."
        action = "export_excel"

    elif intent == "despedida":
        response = "Foi um prazer te ajudar! Até logo e continuo à disposição! 🌿"

    else:
        response = "Desculpe, não entendi muito bem. Posso te ajudar com endereços dos biodigestores, métricas de energia e resíduos, ou exportação de relatórios!"

    return ChatResponse(
        intent=intent,
        response=response,
        confidence=round(confidence, 4),
        action=action
    )


@app.post("/semantic-search", response_model=SemanticSearchResponse)
def semantic_search(req: SemanticSearchRequest):
    """
    Busca semântica entre o texto da query e os marcadores/biodigestores cadastrados.
    Usa TF-IDF + similaridade de cosseno para encontrar os mais relevantes.
    """
    if not req.markers:
        return SemanticSearchResponse(results=[])
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query não pode ser vazia.")

    # Cria textos para todos os marcadores
    marker_texts = [build_marker_text(m) for m in req.markers]
    all_texts = [req.query] + marker_texts

    # Vetoriza com TF-IDF
    search_vectorizer = TfidfVectorizer(ngram_range=(1, 2), analyzer='char_wb')
    try:
        tfidf_matrix = search_vectorizer.fit_transform(all_texts)
    except ValueError:
        return SemanticSearchResponse(results=[])

    query_vec = tfidf_matrix[0]
    marker_vecs = tfidf_matrix[1:]

    # Similaridade de cosseno entre query e cada marcador
    similarities = cosine_similarity(query_vec, marker_vecs)[0]

    # Monta resultados ordenados por relevância
    ranked = sorted(
        enumerate(similarities),
        key=lambda x: x[1],
        reverse=True
    )

    results = []
    for idx, score in ranked:
        if score > 0.01:  # Filtro mínimo de relevância
            marker = req.markers[idx].copy()
            marker["similarity_score"] = round(float(score), 4)
            results.append(marker)

    return SemanticSearchResponse(results=results[:10])


# ──────────────────────────────────────────────────────────────────────────────
# 5. ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
