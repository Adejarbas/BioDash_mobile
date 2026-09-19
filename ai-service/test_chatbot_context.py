"""
Testes automatizados para o Chatbot BioDash:
1. Análise da solicitação recebida.
2. Consideração do contexto da pergunta (multi-turn e tópicos anteriores).
3. Direcionamento correto de perguntas relacionadas à operação.
4. Resposta adequada para solicitações não compreendidas (fallback com confiança baixa).
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from main import chatbot_endpoint, ChatRequest, ContextState, ChatMessage

def test_uninterpretable_requests():
    print("\n--- Teste 1: Solicitações que não podem ser interpretadas ---")
    invalids = [
        "asdfghjkl qwerty 123",
        "quero comprar um pastel com coca",
        "xyz kkkk lol 9999",
        "qual a cor do cavalo branco de napoleao?",
    ]
    for text in invalids:
        req = ChatRequest(message=text)
        res = chatbot_endpoint(req)
        print(f"Pergunta: '{text}' -> Intent: '{res.intent}', Conf: {res.confidence}")
        assert res.intent == "nao_compreendido", f"Esperado 'nao_compreendido', recebido '{res.intent}'"
        assert res.suggestions is not None and len(res.suggestions) > 0, "Deveria conter sugestões úteis"
        assert "Não consegui compreender" in res.response or "Posso te orientar" in res.response
    print("[OK] Teste 1 passou com sucesso!")

def test_operational_questions():
    print("\n--- Teste 2: Perguntas relacionadas à operação ---")
    operational_cases = [
        ("o que fazer com alerta de h2s?", "h2s"),
        ("filtro de gas sulfidrico saturado", "h2s"),
        ("o que fazer se a pressão estiver alta?", "pressao"),
        ("qual a temperatura ideal de operação do biodigestor?", "temperatura"),
        ("qual a faixa de ph ideal?", "ph"),
        ("como alimentar a biomassa no biodigestor?", "alimentacao"),
        ("como funciona a operação do biodigestor?", "operacao_geral"),
        ("preciso de suporte operacional", "operacao_geral"),
    ]
    for text, expected_topic in operational_cases:
        req = ChatRequest(message=text)
        res = chatbot_endpoint(req)
        print(f"Pergunta: '{text}' -> Intent: '{res.intent}', Action: '{res.action}'")
        assert res.intent == "duvida_operacional", f"Esperado 'duvida_operacional', recebido '{res.intent}'"
        assert res.action in ["view_alerts", "contact_support", "start_flow_manutencao", None]
        assert len(res.response) > 50, "Resposta deve conter instruções operacionais detalhadas"
    print("[OK] Teste 2 passou com sucesso!")

def test_contextual_questions():
    print("\n--- Teste 3: Respostas considerando o contexto da pergunta ---")
    sample_indicators = [
        {"waste_processed": 1450.5, "energy_generated": 230.8, "tax_savings": 450.0, "measured_at": "2026-02-15"}
    ]
    
    # 1. Usuário pergunta sobre energia
    req1 = ChatRequest(message="quanta energia foi gerada?", indicators=sample_indicators)
    res1 = chatbot_endpoint(req1)
    assert res1.intent == "pedido_energia"
    assert "230.80 kWh" in res1.response
    context1 = res1.context
    
    # 2. Usuário faz pergunta elíptica / no contexto ("e os resíduos?")
    req2 = ChatRequest(
        message="e os resíduos?",
        indicators=sample_indicators,
        history=[ChatMessage(role="user", text="quanta energia foi gerada?"), ChatMessage(role="bot", text=res1.response)],
        context=context1
    )
    res2 = chatbot_endpoint(req2)
    print(f"Follow-up: 'e os resíduos?' -> Intent: '{res2.intent}', Resp: '{res2.response[:60]}...'")
    assert res2.intent == "pedido_residuos"
    assert "1450.50 kg" in res2.response
    
    # 3. Usuário em contexto de operação ("como resolvo isso?")
    req3 = ChatRequest(
        message="como resolvo isso?",
        history=[ChatMessage(role="user", text="alerta de h2s"), ChatMessage(role="bot", text="Alerta de H2S")],
        context=ContextState(last_intent="duvida_operacional", last_topic="h2s")
    )
    res3 = chatbot_endpoint(req3)
    print(f"Follow-up: 'como resolvo isso?' -> Intent: '{res3.intent}', Topic: '{res3.entities.get('operational_topic')}'")
    assert res3.intent == "duvida_operacional"
    assert "H2S" in res3.response or "filtro" in res3.response

    print("[OK] Teste 3 passou com sucesso!")

if __name__ == "__main__":
    test_uninterpretable_requests()
    test_operational_questions()
    test_contextual_questions()
    print("\n[OK] TODOS OS TESTES PASSARAM COM SUCESSO!")

