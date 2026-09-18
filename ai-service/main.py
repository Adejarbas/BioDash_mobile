"""
BioDash AI Service
==================
Microserviço Python para PLN (Processamento de Linguagem Natural).
- Chatbot com TF-IDF + SVM (scikit-learn)
- Busca Semântica por biodigestores (similaridade de cosseno)
- Extração de Entidades (datas, números, prioridade)
- Fluxos conversacionais: agendamento, métricas, endereços, relatórios por período

Run: uvicorn main:app --host 0.0.0.0 --port 5000 --reload
"""

import os
import re
from typing import Optional, List, Any, Dict

import httpx
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.metrics.pairwise import cosine_similarity

# Carrega variáveis de ambiente do .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# ──────────────────────────────────────────────────────────────────────────────
# APP SETUP
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="BioDash AI Service",
    description="Chatbot (TF-IDF + SVM), Busca Semântica e Fluxos Conversacionais para o BioDash",
    version="2.0.0"
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

    # ─── AGENDAR MANUTENÇÃO ──────────────────────────────────────────────────
    ("agendar_manutencao", "agendar manutenção"),
    ("agendar_manutencao", "quero agendar uma manutenção"),
    ("agendar_manutencao", "criar manutenção"),
    ("agendar_manutencao", "programar manutenção"),
    ("agendar_manutencao", "nova manutenção"),
    ("agendar_manutencao", "agendar revisão"),
    ("agendar_manutencao", "marcar manutenção"),
    ("agendar_manutencao", "preciso agendar manutenção"),
    ("agendar_manutencao", "quero criar um agendamento"),
    ("agendar_manutencao", "agendar serviço de manutenção"),
    ("agendar_manutencao", "programar revisão do biodigestor"),
    ("agendar_manutencao", "adicionar manutenção"),
    ("agendar_manutencao", "agendar troca de filtro"),
    ("agendar_manutencao", "quero marcar uma revisão"),

    # ─── INCLUIR MÉTRICA ────────────────────────────────────────────────────
    ("incluir_metrica", "adicionar métricas"),
    ("incluir_metrica", "registrar resíduos"),
    ("incluir_metrica", "incluir dados"),
    ("incluir_metrica", "inserir indicadores"),
    ("incluir_metrica", "adicionar dados do biodigestor"),
    ("incluir_metrica", "registrar métricas"),
    ("incluir_metrica", "incluir métricas"),
    ("incluir_metrica", "inserir métricas"),
    ("incluir_metrica", "adicionar indicadores"),
    ("incluir_metrica", "novo registro de métricas"),
    ("incluir_metrica", "inserir dados de energia e resíduos"),
    ("incluir_metrica", "quero adicionar as métricas do mês"),
    ("incluir_metrica", "registrar produção do biodigestor"),
    ("incluir_metrica", "lançar métricas"),

    # ─── EDITAR MÉTRICA ─────────────────────────────────────────────────────
    ("editar_metrica", "editar métricas"),
    ("editar_metrica", "atualizar resíduos"),
    ("editar_metrica", "corrigir dados"),
    ("editar_metrica", "alterar indicadores"),
    ("editar_metrica", "modificar métricas"),
    ("editar_metrica", "quero editar as métricas"),
    ("editar_metrica", "preciso corrigir os dados"),
    ("editar_metrica", "alterar os dados do mês"),
    ("editar_metrica", "atualizar métricas"),
    ("editar_metrica", "editar indicadores"),
    ("editar_metrica", "corrigir métricas"),
    ("editar_metrica", "modificar dados do biodigestor"),
    ("editar_metrica", "atualizar dados do mês passado"),

    # ─── ADICIONAR ENDEREÇO ─────────────────────────────────────────────────
    ("adicionar_endereco", "adicionar biodigestor"),
    ("adicionar_endereco", "cadastrar endereço"),
    ("adicionar_endereco", "novo biodigestor"),
    ("adicionar_endereco", "registrar localização"),
    ("adicionar_endereco", "adicionar localização"),
    ("adicionar_endereco", "cadastrar biodigestor"),
    ("adicionar_endereco", "quero adicionar um biodigestor"),
    ("adicionar_endereco", "incluir novo biodigestor"),
    ("adicionar_endereco", "registrar biodigestor"),
    ("adicionar_endereco", "novo ponto no mapa"),
    ("adicionar_endereco", "adicionar ponto no mapa"),
    ("adicionar_endereco", "quero cadastrar um novo biodigestor"),
    ("adicionar_endereco", "incluir endereço no mapa"),

    # ─── RELATÓRIO POR PERÍODO ───────────────────────────────────────────────
    ("relatorio_periodo", "relatório de outubro"),
    ("relatorio_periodo", "relatório do mês"),
    ("relatorio_periodo", "exportar período"),
    ("relatorio_periodo", "relatório entre datas"),
    ("relatorio_periodo", "relatório por período"),
    ("relatorio_periodo", "relatório de um período específico"),
    ("relatorio_periodo", "quero relatório de um período"),
    ("relatorio_periodo", "gerar relatório do período"),
    ("relatorio_periodo", "relatório de janeiro a junho"),
    ("relatorio_periodo", "dados do semestre"),
    ("relatorio_periodo", "relatório mensal"),
    ("relatorio_periodo", "dados do período"),
    ("relatorio_periodo", "exportar dados de um período"),
    ("relatorio_periodo", "relatório do trimestre"),
    ("relatorio_periodo", "relatório específico de um período"),

    # ─── CONFIRMAR ──────────────────────────────────────────────────────────
    ("confirmar", "sim"),
    ("confirmar", "s"),
    ("confirmar", "yes"),
    ("confirmar", "confirmar"),
    ("confirmar", "confirmo"),
    ("confirmar", "ok"),
    ("confirmar", "pode ser"),
    ("confirmar", "certo"),
    ("confirmar", "correto"),
    ("confirmar", "isso mesmo"),
    ("confirmar", "exato"),
    ("confirmar", "com certeza"),
    ("confirmar", "pode"),
    ("confirmar", "claro"),
    ("confirmar", "tá bom"),

    # ─── CANCELAR ───────────────────────────────────────────────────────────
    ("cancelar", "não"),
    ("cancelar", "nao"),
    ("cancelar", "n"),
    ("cancelar", "no"),
    ("cancelar", "cancelar"),
    ("cancelar", "cancela"),
    ("cancelar", "desistir"),
    ("cancelar", "para"),
    ("cancelar", "chega"),
    ("cancelar", "voltar"),
    ("cancelar", "esqueça"),
    ("cancelar", "esqueça isso"),
    ("cancelar", "não quero mais"),
    ("cancelar", "para tudo"),

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

# Treina o TF-IDF (char_wb com uni e bi-gramas — robusto para português)
vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    min_df=1,
    analyzer='char_wb',
    sublinear_tf=True
)
X_train = vectorizer.fit_transform(train_texts)

# Treina o SVM
svm_model = SVC(kernel='linear', C=1.0, probability=True)
svm_model.fit(X_train, train_labels)

print("[OK] Modelo TF-IDF + SVM v2.0 treinado com sucesso!")
print(f"   Classes: {list(svm_model.classes_)}")
print(f"   Total de exemplos: {len(TRAINING_DATA)}")

# ──────────────────────────────────────────────────────────────────────────────
# 2. SCHEMAS (Pydantic)
# ──────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    markers: Optional[List[Dict[str, Any]]] = []
    indicators: Optional[List[Dict[str, Any]]] = []


class ChatResponse(BaseModel):
    intent: str
    response: str
    confidence: float
    action: Optional[str] = None
    entities: Optional[Dict[str, Any]] = {}  # Entidades extraídas (datas, números, prioridade)


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


def extract_entities(text: str) -> Dict[str, Any]:
    """
    Extrai entidades do texto em linguagem natural:
    - Meses (por nome ou número)
    - Ano (4 dígitos)
    - Dia
    - Prioridade (alta/média/baixa)
    - Métricas numéricas (kg, kWh, R$)
    - Formato de exportação (pdf/csv/excel)
    """
    entities: Dict[str, Any] = {}
    normalized = normalize_text(text)

    # ─── Meses ───────────────────────────────────────────────────────────────
    month_map = {
        'janeiro': 0, 'fevereiro': 1, 'marco': 2, 'abril': 3,
        'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7,
        'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11,
    }
    for name, idx in month_map.items():
        if name in normalized:
            entities['month'] = idx
            break

    # ─── Ano (4 dígitos) ─────────────────────────────────────────────────────
    year_match = re.search(r'\b(20\d{2})\b', text)
    if year_match:
        entities['year'] = int(year_match.group(1))

    # ─── Data no formato dd/mm ou dd/mm/aaaa ─────────────────────────────────
    date_match = re.search(r'(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?', text)
    if date_match:
        entities['day'] = int(date_match.group(1))
        entities['month'] = int(date_match.group(2)) - 1  # 0-indexed
        if date_match.group(3):
            yr = int(date_match.group(3))
            entities['year'] = yr if yr > 100 else 2000 + yr

    # ─── Dia isolado ─────────────────────────────────────────────────────────
    if 'day' not in entities:
        day_match = re.search(r'\bdia\s+(\d{1,2})\b|\b(\d{1,2})\s+de\b', normalized)
        if day_match:
            d = int(day_match.group(1) or day_match.group(2))
            if 1 <= d <= 31:
                entities['day'] = d

    # ─── Prioridade ──────────────────────────────────────────────────────────
    if any(w in normalized for w in ['alta', 'urgente', 'critica', 'critico', 'importante']):
        entities['priority'] = 'high'
    elif any(w in normalized for w in ['media', 'moderada', 'normal']):
        entities['priority'] = 'medium'
    elif any(w in normalized for w in ['baixa', 'leve', 'pequena']):
        entities['priority'] = 'low'

    # ─── Resíduos (kg) ───────────────────────────────────────────────────────
    waste_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?)', normalized)
    if waste_match:
        entities['waste_processed'] = float(waste_match.group(1).replace(',', '.'))

    # ─── Energia (kWh) ───────────────────────────────────────────────────────
    energy_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:kwh|kw/h|kilowatt)', normalized)
    if energy_match:
        entities['energy_generated'] = float(energy_match.group(1).replace(',', '.'))

    # ─── Valor monetário (R$) ────────────────────────────────────────────────
    money_match = re.search(
        r'(?:r\$|reais?|brl)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:reais?)',
        normalized
    )
    if money_match:
        val = money_match.group(1) or money_match.group(2)
        entities['tax_savings'] = float(val.replace(',', '.'))

    # ─── Formato de exportação ───────────────────────────────────────────────
    if 'pdf' in normalized:
        entities['format'] = 'pdf'
    elif 'excel' in normalized or 'xlsx' in normalized or 'planilha' in normalized:
        entities['format'] = 'excel'
    elif 'csv' in normalized:
        entities['format'] = 'csv'

    return entities


def build_marker_text(marker: Dict[str, Any]) -> str:
    """Cria uma string de texto searchable para um marcador."""
    parts = [marker.get("title", "")]
    addr = marker.get("address", {})
    if isinstance(addr, dict):
        parts.extend([
            addr.get("street", ""), addr.get("cep", ""),
            addr.get("city", ""), addr.get("complement", ""),
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
        return "Nenhuma métrica disponível. Diga *'adicionar métricas'* para registrar dados pelo chat."
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
    return {"service": "BioDash AI Service", "status": "running", "version": "2.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/biodigestores")
def get_biodigestores(user_id: str = Query(..., description="UUID do usuário autenticado")):
    """
    Busca os biodigestores cadastrados para um usuário diretamente do Supabase.
    Consulta a tabela `biodigestor_maps` (id, user_id, address json, created_at).
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.")

    url = f"{SUPABASE_URL}/rest/v1/biodigestor_maps"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    params = {
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
        "select": "id,user_id,address,created_at",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers=headers, params=params)

        if resp.status_code != 200:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Erro ao consultar Supabase: {resp.text}"
            )

        rows = resp.json()
        biodigestores = [
            {
                "id": str(row["id"]),
                "user_id": row["user_id"],
                "title": (row.get("address") or {}).get("title", "Biodigestor"),
                "latitude": (row.get("address") or {}).get("latitude", -14.235),
                "longitude": (row.get("address") or {}).get("longitude", -51.925),
                "description": (row.get("address") or {}).get("description", ""),
                "address": row.get("address") or {},
                "created_at": row["created_at"],
            }
            for row in rows
        ]

        return {"success": True, "data": biodigestores, "total": len(biodigestores)}

    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Erro de conexão com Supabase: {exc}")


@app.post("/chatbot", response_model=ChatResponse)
def chatbot_endpoint(req: ChatRequest):
    """
    Classifica a intenção com TF-IDF + SVM, extrai entidades e retorna
    resposta contextualizada. Suporta fluxos conversacionais multi-etapa.
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
    entities = extract_entities(req.message)

    # ─── Respostas por intenção ──────────────────────────────────────────────

    if intent == "saudacao":
        response = (
            "Olá! Em que posso ajudar você hoje? 😊\n\n"
            "Posso:\n"
            "• Responder sobre endereços e métricas\n"
            "• Agendar manutenções\n"
            "• Registrar ou editar métricas\n"
            "• Cadastrar novos biodigestores\n"
            "• Gerar relatórios por período"
        )

    elif intent == "pedido_endereco":
        if not markers:
            response = "Não encontrei nenhum biodigestor cadastrado.\n\nDiga *'adicionar biodigestor'* para cadastrar um agora pelo chat."
        elif len(markers) == 1:
            response = format_marker_address(markers[0])
        else:
            addresses = "\n\n".join([format_marker_address(m) for m in markers[:5]])
            response = f"Encontrei {len(markers)} biodigestores cadastrados:\n\n{addresses}"

    elif intent == "pedido_residuos":
        if not indicators:
            response = "Nenhuma métrica de resíduos encontrada.\n\nDiga *'adicionar métricas'* para registrar agora pelo chat."
        else:
            latest = indicators[0]
            waste = latest.get("waste_processed", 0)
            response = f"♻️ *Resíduos Processados*\nÚltimo registro: *{waste:.2f} kg*"

    elif intent == "pedido_energia":
        if not indicators:
            response = "Nenhuma métrica de energia encontrada.\n\nDiga *'adicionar métricas'* para registrar agora pelo chat."
        else:
            latest = indicators[0]
            energy = latest.get("energy_generated", 0)
            response = f"⚡ *Energia Gerada*\nÚltimo registro: *{energy:.2f} kWh*"

    elif intent == "pedido_metricas":
        response = format_indicators(indicators)

    elif intent == "pedido_exportar_pdf":
        response = "📄 Vou gerar o relatório em *PDF* para você agora! Aguarde..."
        action = "export_pdf"

    elif intent == "pedido_exportar_csv":
        response = "📊 Vou exportar os dados em *CSV* para você agora! Aguarde..."
        action = "export_csv"

    elif intent == "pedido_exportar_excel":
        response = "📋 Vou exportar os dados em *Excel* para você agora! Aguarde..."
        action = "export_excel"

    # ─── Fluxos conversacionais ──────────────────────────────────────────────

    elif intent == "agendar_manutencao":
        response = (
            "📅 Certo! Vou agendar uma manutenção.\n\n"
            "Qual o **nome** da manutenção?\n"
            "(ex: Troca de filtros, Limpeza do tanque, Inspeção geral)"
        )
        action = "start_flow_manutencao"

    elif intent == "incluir_metrica":
        response = (
            "📊 Vou registrar novas métricas do biodigestor.\n\n"
            "Qual a quantidade de **resíduos processados** em kg?"
        )
        action = "start_flow_metrica"

    elif intent == "editar_metrica":
        response = (
            "✏️ Vou editar métricas existentes.\n\n"
            "Qual **mês e ano** deseja atualizar?\n"
            "(ex: outubro 2025 ou 10/2025)"
        )
        action = "start_flow_editar_metrica"

    elif intent == "adicionar_endereco":
        response = (
            "📍 Vou cadastrar um novo biodigestor no mapa.\n\n"
            "Qual o **nome** do biodigestor?\n"
            "(ex: Biodigestor Norte, Planta 01)"
        )
        action = "start_flow_endereco"

    elif intent == "relatorio_periodo":
        response = (
            "📅 Vou gerar um relatório por período específico.\n\n"
            "Qual o **mês e ano inicial**?\n"
            "(ex: janeiro 2025 ou 01/2025)"
        )
        action = "start_flow_relatorio"

    elif intent == "confirmar":
        response = "✅ Entendido!"
        action = "flow_confirm"

    elif intent == "cancelar":
        response = "❌ Operação cancelada. Como mais posso ajudar?"
        action = "cancel_flow"

    elif intent == "despedida":
        response = "Foi um prazer te ajudar! Até logo e continuo à disposição! 🌿"

    else:
        response = (
            "Desculpe, não entendi muito bem. Posso te ajudar com:\n"
            "• Endereços dos biodigestores\n"
            "• Métricas de energia e resíduos\n"
            "• Agendar manutenções\n"
            "• Registrar ou editar métricas\n"
            "• Cadastrar novos biodigestores\n"
            "• Gerar relatórios por período"
        )

    return ChatResponse(
        intent=intent,
        response=response,
        confidence=round(confidence, 4),
        action=action,
        entities=entities,
    )


@app.post("/semantic-search", response_model=SemanticSearchResponse)
def semantic_search(req: SemanticSearchRequest):
    """
    Busca semântica entre a query e os marcadores usando TF-IDF + cosseno.
    """
    if not req.markers:
        return SemanticSearchResponse(results=[])
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query não pode ser vazia.")

    marker_texts = [build_marker_text(m) for m in req.markers]
    all_texts = [req.query] + marker_texts

    search_vectorizer = TfidfVectorizer(ngram_range=(1, 2), analyzer='char_wb')
    try:
        tfidf_matrix = search_vectorizer.fit_transform(all_texts)
    except ValueError:
        return SemanticSearchResponse(results=[])

    query_vec = tfidf_matrix[0]
    marker_vecs = tfidf_matrix[1:]
    similarities = cosine_similarity(query_vec, marker_vecs)[0]

    ranked = sorted(enumerate(similarities), key=lambda x: x[1], reverse=True)

    results = []
    for idx, score in ranked:
        if score > 0.01:
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
