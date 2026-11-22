const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    filename
  );
};

const {
  classifySensorReading,
  getSensorDisplayInfo,
  getCriticalityBadgeInfo,
} = require('../src/lib/anomalyClassifier.ts');

const {
  parseMonth,
  parseYear,
  parseNumber,
  parsePriority,
  parseDate,
  isConfirm,
  isCancel,
} = require('../src/lib/chatbotParsers.ts');

const {
  calculateChange,
  formatMetric,
  calculateEfficiency,
  calculateHaversineDistance,
  parseMarkerAddress,
  getMarkerAddressLines,
  parseStrictScheduleDateTime,
  parseStrictPtBrDate,
  processExportHistory,
  processExportMetrics,
  maskCNPJ,
  maskPhone,
  maskCEP,
} = require('../src/lib/dashboardMetrics.ts');

if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
else delete require.extensions['.ts'];

describe('anomalyClassifier - classifySensorReading & getCriticalityBadgeInfo', () => {
  test('temperatura: todas as faixas e limites de criticidade', () => {
    assert.deepEqual(
      { level: classifySensorReading('temperatura', 34.5).alertLevel, anomaly: classifySensorReading('temperatura', 34.5).isAnomaly },
      { level: 'info', anomaly: false }
    );
    assert.equal(classifySensorReading('temp', 37.5).alertLevel, 'info');

    const lowHigh = classifySensorReading('temperatura', 37.6);
    assert.equal(lowHigh.alertLevel, 'low');
    assert.equal(lowHigh.isAnomaly, true);
    assert.equal(lowHigh.suggestedPriority, 'medium');
    assert.equal(lowHigh.threshold, 37.5);

    const lowMin = classifySensorReading('temperatura', 34.4);
    assert.equal(lowMin.alertLevel, 'low');
    assert.equal(lowMin.threshold, 34.5);

    assert.equal(classifySensorReading('temperatura', 33.0).alertLevel, 'low');
    assert.equal(classifySensorReading('temperatura', 38.5).alertLevel, 'low');

    const medLow = classifySensorReading('temperatura', 32.9);
    assert.equal(medLow.alertLevel, 'medium');
    assert.equal(medLow.suggestedPriority, 'high');
    assert.equal(medLow.threshold, 33.0);

    const medHigh = classifySensorReading('temperatura', 38.6);
    assert.equal(medHigh.alertLevel, 'medium');
    assert.equal(medHigh.threshold, 38.5);

    assert.equal(classifySensorReading('temperatura', 31.0).alertLevel, 'medium');
    assert.equal(classifySensorReading('temperatura', 40.0).alertLevel, 'medium');

    const critLow = classifySensorReading('temperatura', 30.9);
    assert.equal(critLow.alertLevel, 'critical');
    assert.equal(critLow.suggestedPriority, 'urgent');
    assert.equal(critLow.threshold, 31.0);

    const critHigh = classifySensorReading('temperatura', 40.1);
    assert.equal(critHigh.alertLevel, 'critical');
    assert.equal(critHigh.suggestedPriority, 'urgent');
    assert.equal(critHigh.threshold, 40.0);
  });

  test('pressao: todas as faixas e limites de criticidade', () => {
    assert.equal(classifySensorReading('pressao', 1.2).alertLevel, 'info');
    assert.equal(classifySensorReading('press', 1.6).alertLevel, 'info');
    assert.equal(classifySensorReading('pressao', 1.5).isAnomaly, false);

    assert.equal(classifySensorReading('pressao', 1.19).alertLevel, 'low');
    assert.equal(classifySensorReading('pressao', 1.61).alertLevel, 'low');
    assert.equal(classifySensorReading('pressao', 1.1).alertLevel, 'low');
    assert.equal(classifySensorReading('pressao', 1.75).alertLevel, 'low');

    assert.equal(classifySensorReading('pressao', 1.09).alertLevel, 'medium');
    assert.equal(classifySensorReading('pressao', 1.76).alertLevel, 'medium');
    assert.equal(classifySensorReading('pressao', 0.9).alertLevel, 'medium');
    assert.equal(classifySensorReading('pressao', 1.9).alertLevel, 'medium');

    assert.equal(classifySensorReading('pressao', 0.89).alertLevel, 'critical');
    assert.equal(classifySensorReading('pressao', 1.91).alertLevel, 'critical');
  });

  test('ph: todas as faixas e limites de criticidade', () => {
    assert.equal(classifySensorReading('ph', 6.8).alertLevel, 'info');
    assert.equal(classifySensorReading('ph', 7.4).alertLevel, 'info');
    assert.equal(classifySensorReading('ph', 7.1).isAnomaly, false);

    assert.equal(classifySensorReading('ph', 6.7).alertLevel, 'low');
    assert.equal(classifySensorReading('ph', 7.5).alertLevel, 'low');
    assert.equal(classifySensorReading('ph', 6.5).alertLevel, 'low');
    assert.equal(classifySensorReading('ph', 7.7).alertLevel, 'low');

    assert.equal(classifySensorReading('ph', 6.4).alertLevel, 'medium');
    assert.equal(classifySensorReading('ph', 7.8).alertLevel, 'medium');
    assert.equal(classifySensorReading('ph', 6.2).alertLevel, 'medium');
    assert.equal(classifySensorReading('ph', 8.0).alertLevel, 'medium');

    assert.equal(classifySensorReading('ph', 6.1).alertLevel, 'critical');
    assert.equal(classifySensorReading('ph', 8.1).alertLevel, 'critical');
  });

  test('h2s: todas as faixas e limites de criticidade', () => {
    assert.equal(classifySensorReading('h2s', 200).alertLevel, 'info');
    assert.equal(classifySensorReading('h2s', 100).isAnomaly, false);

    assert.equal(classifySensorReading('h2s', 201).alertLevel, 'low');
    assert.equal(classifySensorReading('h2s', 400).alertLevel, 'low');

    assert.equal(classifySensorReading('h2s', 401).alertLevel, 'medium');
    assert.equal(classifySensorReading('h2s', 700).alertLevel, 'medium');

    assert.equal(classifySensorReading('h2s', 701).alertLevel, 'critical');
  });

  test('metano e sensores desconhecidos usam fallback informativo', () => {
    const metano = classifySensorReading('metano', 65);
    assert.equal(metano.isAnomaly, false);
    assert.equal(metano.alertLevel, 'info');
    assert.equal(metano.suggestedPriority, 'low');
    assert.equal(metano.threshold, 0);
    assert.equal(metano.unit, '');
    assert.equal(metano.label, 'Informativo');

    const unknown = classifySensorReading('', 999);
    assert.equal(unknown.isAnomaly, false);
    assert.equal(unknown.alertLevel, 'info');
    assert.equal(unknown.label, 'Informativo');
  });

  test('getCriticalityBadgeInfo aceita sinônimos em português e inglês', () => {
    assert.equal(getCriticalityBadgeInfo('critico', 'dark').label, 'Crítico');
    assert.equal(getCriticalityBadgeInfo('alerta', 'light').label, 'Alerta Médio');
    assert.equal(getCriticalityBadgeInfo('aviso', 'light').label, 'Atenção');
    assert.equal(getCriticalityBadgeInfo('desconhecido', 'light').label, 'Normal');
  });
});

describe('anomalyClassifier - getSensorDisplayInfo', () => {
  test('retorna metadados corretos para sensores conhecidos e desconhecidos', () => {
    assert.deepEqual(getSensorDisplayInfo('temperatura'), {
      name: 'Sensor de Temperatura',
      icon: 'thermometer',
      tag: 'TMP',
      color: '#ef4444',
    });
    assert.deepEqual(getSensorDisplayInfo('pressao'), {
      name: 'Sensor de Pressão',
      icon: 'gauge',
      tag: 'PRS',
      color: '#3b82f6',
    });
    assert.deepEqual(getSensorDisplayInfo('ph'), {
      name: 'Sensor de pH',
      icon: 'water-percent',
      tag: 'PH',
      color: '#10b981',
    });
    assert.deepEqual(getSensorDisplayInfo('h2s'), {
      name: 'Sensor de H2S',
      icon: 'molecule',
      tag: 'H2S',
      color: '#8b5cf6',
    });
    assert.deepEqual(getSensorDisplayInfo('metano'), {
      name: 'Sensor de Telemetria',
      icon: 'access-point',
      tag: 'SEN',
      color: '#6b7280',
    });
  });
});

describe('chatbotParsers', () => {
  test('parseMonth: nomes, acentos, números 1-12 e inválidos', () => {
    assert.equal(parseMonth('janeiro'), 0);
    assert.equal(parseMonth('Março'), 2);
    assert.equal(parseMonth('mês de dezembro'), 11);
    assert.equal(parseMonth('1'), 0);
    assert.equal(parseMonth('12'), 11);
    assert.equal(parseMonth('0'), null);
    assert.equal(parseMonth('13'), null);
    assert.equal(parseMonth('invalido'), null);
  });

  test('parseYear: 4 dígitos, 2 dígitos e inválidos', () => {
    assert.equal(parseYear('2026'), 2026);
    assert.equal(parseYear('ano de 2025'), 2025);
    assert.equal(parseYear('26'), 2026);
    assert.equal(parseYear('sem ano'), null);
  });

  test('parseNumber: ponto, vírgula, unidades embutidas e inválidos', () => {
    assert.equal(parseNumber('12.5'), 12.5);
    assert.equal(parseNumber('12,5'), 12.5);
    assert.equal(parseNumber('450 kg'), 450);
    assert.equal(parseNumber('37,8 °C'), 37.8);
    assert.equal(parseNumber('sem número'), null);
  });

  test('parsePriority: alta, média, baixa e inválidos', () => {
    assert.equal(parsePriority('1'), 'high');
    assert.equal(parsePriority('alta'), 'high');
    assert.equal(parsePriority('Urgente'), 'high');
    assert.equal(parsePriority('2'), 'medium');
    assert.equal(parsePriority('média'), 'medium');
    assert.equal(parsePriority('3'), 'low');
    assert.equal(parsePriority('baixa'), 'low');
    assert.equal(parsePriority('desconhecida'), null);
  });

  test('parseDate: termos relativos, DD/MM/YYYY, DD/MM, textual e data inválida', () => {
    const pad = (n) => String(n).padStart(2, '0');
    const format = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    const today = new Date();
    assert.equal(parseDate('hoje')?.label, format(today));

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(parseDate('amanhã')?.label, format(tomorrow));

    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    assert.equal(parseDate('depois de amanhã')?.label, format(afterTomorrow));

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    assert.equal(parseDate('ontem')?.label, format(yesterday));

    const full = parseDate('15/08/2026');
    assert.equal(full?.label, '15/08/2026');
    assert.equal(full?.date.getFullYear(), 2026);
    assert.equal(full?.date.getMonth(), 7);
    assert.equal(full?.date.getDate(), 15);

    const short = parseDate('15/08');
    assert.equal(short?.label, `15/08/${today.getFullYear()}`);

    const textual = parseDate('25 de outubro de 2026');
    assert.equal(textual?.label, '25/10/2026');
    assert.equal(textual?.date.getFullYear(), 2026);
    assert.equal(textual?.date.getMonth(), 9);
    assert.equal(textual?.date.getDate(), 25);

    assert.equal(parseDate('31/02/2026'), null);
    assert.equal(parseDate('data inválida'), null);
  });

  test('isConfirm e isCancel: respostas válidas e inválidas', () => {
    assert.equal(isConfirm('sim'), true);
    assert.equal(isConfirm('Sim, pode confirmar!'), true);
    assert.equal(isConfirm('ok'), true);
    assert.equal(isConfirm('tá bom'), true);
    assert.equal(isConfirm('não'), false);
    assert.equal(isConfirm('talvez'), false);

    assert.equal(isCancel('não'), true);
    assert.equal(isCancel('nao quero'), true);
    assert.equal(isCancel('cancelar'), true);
    assert.equal(isCancel('voltar'), true);
    assert.equal(isCancel('sim'), false);
    assert.equal(isCancel('talvez'), false);
  });
});

describe('dashboardMetrics - regras de negócio do painel e formulários', () => {
  test('calculateChange, formatMetric e calculateEfficiency tratam zero, aumento, queda e limite 100%', () => {
    assert.equal(calculateChange(150, 100), 50);
    assert.equal(calculateChange(50, 100), -50);
    assert.equal(calculateChange(100, 0), 100);
    assert.equal(calculateChange(0, 0), 0);

    const inc = formatMetric(150, 100, 'energy');
    assert.deepEqual(inc, {
      value: 150,
      changePercent: '50.0% ',
      increasing: true,
      color: '#a16207',
    });

    const dec = formatMetric(50, 100, 'waste');
    assert.deepEqual(dec, {
      value: 50,
      changePercent: '50.0% ',
      increasing: false,
      color: '#15803d',
    });

    // Eficiência ideal: razão 0.8 (ex: 80 kWh / 100 kg = 100%)
    assert.equal(calculateEfficiency(80, 100), 100);
    assert.equal(calculateEfficiency(40, 100), 50);
    // Teto máximo de 100% e proteção contra divisão por zero
    assert.equal(calculateEfficiency(200, 100), 100);
    assert.equal(calculateEfficiency(80, 0), 0);
    assert.equal(calculateEfficiency(80, -10), 0);
  });

  test('calculateHaversineDistance calcula distância geográfica em km com precisão', () => {
    // Mesma coordenada = 0 km
    assert.equal(calculateHaversineDistance(-23.5505, -46.6333, -23.5505, -46.6333), 0);

    // São Paulo (-23.5505, -46.6333) até Rio de Janeiro (-22.9068, -43.1729) ~ 360.7 km
    const spToRj = calculateHaversineDistance(-23.5505, -46.6333, -22.9068, -43.1729);
    assert.ok(spToRj > 355 && spToRj < 365, `Distância esperada ~360.7km, obtida: ${spToRj}`);
  });

  test('parseMarkerAddress e getMarkerAddressLines tratam objetos, JSON string, JSON inválido e fallback', () => {
    assert.deepEqual(parseMarkerAddress({ street: 'Rua A' }), { street: 'Rua A' });
    assert.deepEqual(parseMarkerAddress('{"street":"Rua B"}'), { street: 'Rua B' });
    assert.equal(parseMarkerAddress('{json-invalido'), null);
    assert.equal(parseMarkerAddress(null), null);

    assert.deepEqual(getMarkerAddressLines(null), []);
    assert.deepEqual(
      getMarkerAddressLines({
        address: {
          street: 'Av. Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          cep: '01310-100',
          complement: 'Bloco B',
        },
      }),
      [
        'Av. Paulista, 1000',
        'Bela Vista, São Paulo, SP',
        'CEP: 01310-100',
        'Complemento: Bloco B',
      ]
    );

    assert.deepEqual(
      getMarkerAddressLines({ address: '{corrompido', description: 'Unidade Rural Sul' }),
      ['Unidade Rural Sul']
    );
    assert.deepEqual(getMarkerAddressLines({ address: null, description: '   ' }), [
      'Endereço não informado.',
    ]);
  });

  test('parseStrictScheduleDateTime e parseStrictPtBrDate validam formatos e datas inexistentes no calendário', () => {
    const valid = parseStrictScheduleDateTime('15/11/2026', '14:30');
    assert.ok('iso' in valid);
    const dt = new Date(valid.iso);
    assert.equal(dt.getFullYear(), 2026);
    assert.equal(dt.getMonth(), 10);
    assert.equal(dt.getDate(), 15);
    assert.equal(dt.getHours(), 14);
    assert.equal(dt.getMinutes(), 30);

    assert.deepEqual(parseStrictScheduleDateTime('2026-11-15', '14:30'), {
      error: 'Formato de data inválido. Use DD/MM/AAAA.',
    });
    assert.deepEqual(parseStrictScheduleDateTime('15/11/2026', '14h30'), {
      error: 'Formato de horário inválido. Use HH:MM.',
    });
    assert.deepEqual(parseStrictScheduleDateTime('15/13/2026', '14:30'), {
      error: 'Data inválida. Verifique o dia e o mês informados.',
    });
    assert.deepEqual(parseStrictScheduleDateTime('15/11/2026', '25:00'), {
      error: 'Horário inválido. Informe valores entre 00:00 e 23:59.',
    });
    assert.deepEqual(parseStrictScheduleDateTime('31/02/2026', '10:00'), {
      error: 'Data inexistente no calendário.',
    });

    assert.ok(parseStrictPtBrDate('20/11/2026'));
    assert.equal(parseStrictPtBrDate('31/02/2026'), null);
    assert.equal(parseStrictPtBrDate('15/13/2026'), null);
    assert.equal(parseStrictPtBrDate('invalido'), null);
  });

  test('processExportHistory e processExportMetrics agregam indicadores por mês e tratam lista vazia', () => {
    assert.deepEqual(processExportHistory([]), []);
    assert.deepEqual(processExportMetrics([]), [
      ['Métrica', 'Valor Total', 'Variação'],
      ['Sem dados no período', '-', '-'],
    ]);

    const rows = [
      { measured_at: '2026-10-05T10:00:00Z', waste_processed: 100, energy_generated: 80, tax_savings: 250 },
      { measured_at: '2026-10-20T10:00:00Z', waste_processed: 50, energy_generated: 40, tax_savings: 150 },
      { measured_at: '2026-09-10T10:00:00Z', waste_processed: 200, energy_generated: 160, tax_savings: 500 },
      { measured_at: 'data-invalida', waste_processed: 999, energy_generated: 999, tax_savings: 999 },
    ];

    const history = processExportHistory(rows);
    assert.equal(history.length, 2);
    assert.equal(history[0].energia, '160.00');
    assert.equal(history[0].residuos, '200.00');
    assert.equal(history[0].economia, '500.00');
    assert.equal(history[1].energia, '120.00');
    assert.equal(history[1].residuos, '150.00');
    assert.equal(history[1].economia, '400.00');

    const metrics = processExportMetrics(rows.slice(0, 3));
    assert.deepEqual(metrics, [
      ['Resíduos Processados (kg)', '350.00', '-'],
      ['Energia Gerada (kWh)', '280.00', '-'],
      ['Imposto Abatido (BRL)', 'R$ 900.00', '-'],
      ['Total de Registros', '3', '-'],
    ]);
  });

  test('maskCNPJ, maskPhone e maskCEP formatam entradas parciais, completas e com excesso de dígitos', () => {
    assert.equal(maskCNPJ('12345678000199999'), '12.345.678/0001-99');
    assert.equal(maskPhone('1198765432199'), '(11) 98765-4321');
    assert.equal(maskPhone('1134567890'), '(11) 3456-7890');
    assert.equal(maskCEP('0131010099'), '01310-100');
  });
});
