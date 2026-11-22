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

if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
else delete require.extensions['.ts'];

describe('anomalyClassifier - classifySensorReading', () => {
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

    const unknown = classifySensorReading('sensor_desconhecido', 999);
    assert.equal(unknown.isAnomaly, false);
    assert.equal(unknown.alertLevel, 'info');
    assert.equal(unknown.label, 'Informativo');
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
    const pad = n => String(n).padStart(2, '0');
    const format = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

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
