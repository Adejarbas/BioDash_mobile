const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const ts = require('typescript');

const storage = new Map();
const asyncStorage = {
  setItem: async (key, value) => { storage.set(key, value); },
  getItem: async (key) => (storage.has(key) ? storage.get(key) : null),
  removeItem: async (key) => { storage.delete(key); },
};

let server;
let baseUrl;
let routeHandler = null;
const requests = [];

let evaluateTelemetryReadings;
let buildSensorAlertPayload;
let recordTelemetryOccurrence;
let alertsApi;
let maintenanceApi;
let feedbackLib;
let speechMockState;
let hookCleanupFn;
let hookEffectFn;
let useSpeechRecognitionEvent;
let isSpeechRecognitionAvailable;
let renderToastOverlayNative;
let renderToastOverlayWeb;

function loadModules(apiUrl) {
  const originalEnvUrl = process.env.EXPO_PUBLIC_API_URL;
  const originalLoad = Module._load;
  const originalTsLoader = require.extensions['.ts'];
  const originalTsxLoader = require.extensions['.tsx'];

  for (const rel of [
    '../src/lib/api.ts',
    '../src/lib/anomalyClassifier.ts',
    '../src/lib/iotTelemetry.ts',
    '../src/lib/feedback.ts',
    '../src/lib/toastPortal.ts',
    '../src/lib/toastPortal.web.ts',
    '../src/services/speechRecognition.ts',
  ]) {
    try {
      delete require.cache[require.resolve(rel)];
    } catch {
      // ignore if not cached yet
    }
  }

  process.env.EXPO_PUBLIC_API_URL = apiUrl;

  speechMockState = {
    shouldThrow: false,
    listeners: new Map(),
    removedEvents: [],
  };

  hookEffectFn = null;
  hookCleanupFn = null;

  Module._load = function (request, ...args) {
    if (request === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: asyncStorage };
    }
    if (request === 'react-native') {
      return {
        Platform: { OS: 'web' },
        Alert: { alert: () => {} },
      };
    }
    if (request === 'react') {
      return {
        __esModule: true,
        default: {},
        useRef: (initial) => ({ current: initial }),
        useEffect: (fn) => {
          hookEffectFn = fn;
        },
      };
    }
    if (request === 'react-dom') {
      return {
        createPortal: (children, container) => ({
          __portal: true,
          children,
          containerTag: container.tagName,
        }),
      };
    }
    if (request === 'expo-speech-recognition') {
      if (speechMockState.shouldThrow) {
        throw new Error('Native module ExpoSpeechRecognition not found');
      }
      return {
        ExpoSpeechRecognitionModule: {
          addListener: (eventName, cb) => {
            speechMockState.listeners.set(eventName, cb);
            return {
              remove: () => {
                speechMockState.removedEvents.push(eventName);
                speechMockState.listeners.delete(eventName);
              },
            };
          },
        },
      };
    }
    return originalLoad.call(this, request, ...args);
  };

  const compileTs = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;
    module._compile(compiled, filename);
  };

  require.extensions['.ts'] = compileTs;
  require.extensions['.tsx'] = compileTs;

  try {
    ({ alertsApi, maintenanceApi } = require('../src/lib/api.ts'));
    ({
      evaluateTelemetryReadings,
      buildSensorAlertPayload,
      recordTelemetryOccurrence,
    } = require('../src/lib/iotTelemetry.ts'));
    feedbackLib = require('../src/lib/feedback.ts');
    ({ renderToastOverlay: renderToastOverlayNative } = require('../src/lib/toastPortal.ts'));
    ({ renderToastOverlay: renderToastOverlayWeb } = require('../src/lib/toastPortal.web.ts'));
    ({
      useSpeechRecognitionEvent,
      isSpeechRecognitionAvailable,
    } = require('../src/services/speechRecognition.ts'));
  } finally {
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    if (originalTsxLoader) require.extensions['.tsx'] = originalTsxLoader;
    else delete require.extensions['.tsx'];

    if (originalEnvUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalEnvUrl;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

describe('IoT telemetry, sensor stream & cross-component integration tests', () => {
  before(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const parsedUrl = new URL(req.url, baseUrl);
        const record = {
          method: req.method,
          path: parsedUrl.pathname,
          searchParams: parsedUrl.searchParams,
          headers: req.headers,
          bodyText,
        };
        requests.push(record);
        if (routeHandler) {
          routeHandler(record, res);
          return;
        }
        sendJson(res, 404, { success: false, error: 'Route not mocked' });
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    loadModules(baseUrl);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    storage.clear();
    requests.length = 0;
    routeHandler = null;
  });

  test('evaluateTelemetryReadings prioriza a anomalia mais crítica entre os 4 sensores IoT', () => {
    // 1. Todos os sensores em operação normal
    const normalState = evaluateTelemetryReadings({
      temperatura: 35.5,
      pressao: 1.45,
      ph: 7.1,
      h2s: 120,
    });
    assert.equal(normalState.highestAlert, null);
    assert.equal(normalState.isCritical, false);
    assert.equal(normalState.isMedium, false);
    assert.equal(normalState.isLow, false);

    // 2. Múltiplas anomalias simultâneas (temperatura atenção, pressão média, H2S crítico)
    const multiAnomaly = evaluateTelemetryReadings({
      temperatura: 38.0, // low
      pressao: 1.82,     // medium
      ph: 7.1,           // info
      h2s: 780,          // critical
    });
    assert.ok(multiAnomaly.highestAlert);
    assert.equal(multiAnomaly.highestAlert.sensorType, 'h2s');
    assert.equal(multiAnomaly.highestAlert.alertLevel, 'critical');
    assert.equal(multiAnomaly.highestAlert.readingValue, 780);
    assert.equal(multiAnomaly.isCritical, true);
  });

  test('fluxo completo IoT: leitura de sensor -> detecção de anomalia -> deduplicação (cooldown) -> API /alerts -> agendamento de manutenção e toast', async () => {
    await asyncStorage.setItem('@biodash_jwt_token', 'iot-jwt-token');

    const createdAlerts = [];
    const createdSchedules = [];

    routeHandler = (req, res) => {
      if (req.method === 'POST' && req.path === '/api/alerts') {
        const body = JSON.parse(req.bodyText);
        const created = { id: `alert-${createdAlerts.length + 1}`, ...body };
        createdAlerts.push(created);
        return sendJson(res, 201, { success: true, data: created });
      }
      if (req.method === 'POST' && req.path === '/api/maintenance/schedules') {
        const body = JSON.parse(req.bodyText);
        const sched = { id: `sched-${createdSchedules.length + 1}`, status: 'pending', ...body };
        createdSchedules.push(sched);
        return sendJson(res, 201, { success: true, data: sched });
      }
      return sendJson(res, 404, { success: false, error: 'Not found' });
    };

    const lastRecordedMap = {};
    const activeBiodigester = {
      id: 'uuid-bio-sul-01',
      title: 'Biodigestor Sul 01',
    };

    // Passo 1: Pacote de telemetria IoT chega com temperatura normal (35.5°C) -> não deve chamar API
    const normalEval = evaluateTelemetryReadings({
      temperatura: 35.5,
      pressao: 1.45,
      ph: 7.1,
      h2s: 110,
    });
    const normalRec = await recordTelemetryOccurrence({
      sensorType: 'temperatura',
      readingValue: 35.5,
      anomalyInfo: normalEval.classifications.temperatura,
      activeBiodigester,
      lastRecordedMap,
      now: 1000,
    });
    assert.equal(normalRec.recorded, false);
    assert.equal(normalRec.skippedReason, 'normal');
    assert.equal(requests.length, 0);

    // Passo 2: Pacote de telemetria IoT chega com sobretemperatura crítica (41.4°C)
    const critEval = evaluateTelemetryReadings({
      temperatura: 41.4,
      pressao: 1.45,
      ph: 7.1,
      h2s: 110,
    });
    assert.equal(critEval.isCritical, true);
    assert.equal(critEval.highestAlert.sensorType, 'temperatura');

    const firstRecord = await recordTelemetryOccurrence({
      sensorType: critEval.highestAlert.sensorType,
      readingValue: critEval.highestAlert.readingValue,
      anomalyInfo: critEval.highestAlert,
      activeBiodigester,
      lastRecordedMap,
      cooldownMs: 15000,
      now: 10000,
    });
    assert.equal(firstRecord.recorded, true);
    assert.equal(requests.length, 1);
    assert.equal(createdAlerts.length, 1);
    assert.equal(createdAlerts[0].biodigesterId, 'uuid-bio-sul-01');
    assert.equal(createdAlerts[0].biodigesterName, 'Biodigestor Sul 01');
    assert.equal(createdAlerts[0].sensorId, 'SN-TMP-01');
    assert.equal(createdAlerts[0].sensorType, 'temperatura');
    assert.equal(createdAlerts[0].readingValue, 41.4);
    assert.equal(createdAlerts[0].thresholdValue, 40.0);
    assert.equal(createdAlerts[0].alertLevel, 'critical');

    // Passo 3: Nova leitura idêntica 5 segundos depois (dentro do cooldown de 15s) -> bloqueada por deduplicação
    const duplicateRecord = await recordTelemetryOccurrence({
      sensorType: 'temperatura',
      readingValue: 41.6,
      anomalyInfo: critEval.highestAlert,
      activeBiodigester,
      lastRecordedMap,
      cooldownMs: 15000,
      now: 15000,
    });
    assert.equal(duplicateRecord.recorded, false);
    assert.equal(duplicateRecord.skippedReason, 'cooldown');
    assert.equal(requests.length, 1);

    // Passo 4: Leitura após expirar o cooldown (26s) -> registra nova ocorrência na API
    const afterCooldownRecord = await recordTelemetryOccurrence({
      sensorType: 'temperatura',
      readingValue: 41.8,
      anomalyInfo: critEval.highestAlert,
      activeBiodigester,
      lastRecordedMap,
      cooldownMs: 15000,
      now: 26000,
    });
    assert.equal(afterCooldownRecord.recorded, true);
    assert.equal(requests.length, 2);

    // Passo 5: Integração com componente de Feedback e API de Manutenção (acionamento de manutenção corretiva a partir do alerta IoT)
    const receivedToasts = [];
    const unsubscribeToast = feedbackLib.subscribeToToasts((t) => receivedToasts.push(t));
    try {
      const maintRes = await maintenanceApi.createSchedule({
        name: `Inspeção Corretiva - Sensor de Temperatura (${activeBiodigester.title})`,
        priority: critEval.highestAlert.suggestedPriority,
        scheduledDate: '2026-11-23T09:00:00.000Z',
      });
      assert.equal(maintRes.success, true);
      if (maintRes.success) {
        feedbackLib.showAlert('Sucesso', 'Manutenção priorizada e agendada com sucesso!');
      }
    } finally {
      unsubscribeToast();
    }

    assert.equal(createdSchedules.length, 1);
    assert.equal(createdSchedules[0].priority, 'urgent');
    assert.equal(receivedToasts.length, 1);
    assert.equal(receivedToasts[0].variant, 'success');
    assert.equal(receivedToasts[0].title, 'Sucesso');
  });

  test('cenário de erro IoT: falha HTTP 500 ao persistir alerta de sensor não quebra o fluxo e retorna recorded: false', async () => {
    await asyncStorage.setItem('@biodash_jwt_token', 'iot-jwt-token');

    routeHandler = (_req, res) => {
      sendJson(res, 500, { success: false, error: 'Database connection timeout' });
    };

    const anomaly = evaluateTelemetryReadings({
      temperatura: 35.5,
      pressao: 0.75, // Queda drástica de pressão (critical)
      ph: 7.1,
      h2s: 110,
    }).highestAlert;

    const result = await recordTelemetryOccurrence({
      sensorType: anomaly.sensorType,
      readingValue: anomaly.readingValue,
      anomalyInfo: anomaly,
      activeBiodigester: null,
      lastRecordedMap: {},
      now: 50000,
    });

    assert.equal(result.recorded, false);
    assert.equal(result.response.success, false);
    assert.equal(result.response.error, 'Database connection timeout');
  });

  test('buildSensorAlertPayload mapeia IDs de sensores para temperatura, pressão, pH e H2S e preserva UUID de biodigestor', () => {
    const pTemp = buildSensorAlertPayload(
      'temperatura',
      40.556,
      { alertLevel: 'critical', threshold: 40, unit: '°C', description: 'Alta' },
      { id: 'bio-uuid-123', name: 'Bio 123' }
    );
    assert.equal(pTemp.sensorId, 'SN-TMP-01');
    assert.equal(pTemp.biodigesterId, 'bio-uuid-123');
    assert.equal(pTemp.readingValue, 40.56);

    const pPress = buildSensorAlertPayload(
      'pressao',
      1.95,
      { alertLevel: 'critical', threshold: 1.9, unit: 'bar', description: 'Alta' },
      null
    );
    assert.equal(pPress.sensorId, 'SN-PRS-02');
    assert.equal(pPress.biodigesterId, null);
    assert.equal(pPress.biodigesterName, 'Biodigestor Principal');

    const pPh = buildSensorAlertPayload(
      'ph',
      6.1,
      { alertLevel: 'critical', threshold: 6.2, unit: 'pH', description: 'Ácido' }
    );
    assert.equal(pPh.sensorId, 'SN-PH-01');

    const pH2s = buildSensorAlertPayload(
      'h2s',
      750,
      { alertLevel: 'critical', threshold: 700, unit: 'ppm', description: 'Tóxico' }
    );
    assert.equal(pH2s.sensorId, 'SN-H2S-01');
  });

  test('speechRecognition service: registra e remove listener quando módulo nativo está disponível', () => {
    assert.equal(isSpeechRecognitionAvailable, true);
    const receivedEvents = [];
    useSpeechRecognitionEvent('result', (ev) => receivedEvents.push(ev));
    assert.equal(typeof hookEffectFn, 'function');

    hookCleanupFn = hookEffectFn();
    assert.equal(speechMockState.listeners.has('result'), true);

    const callback = speechMockState.listeners.get('result');
    callback({ transcript: 'status do biodigestor' });
    assert.deepEqual(receivedEvents, [{ transcript: 'status do biodigestor' }]);

    hookCleanupFn();
    assert.deepEqual(speechMockState.removedEvents, ['result']);
  });

  test('toastPortal: renderiza diretamente no nativo e usa createPortal(node, document.body) na Web quando document.body existe', () => {
    const fakeNode = { type: 'View', props: { children: 'Toast' } };
    assert.equal(renderToastOverlayNative(fakeNode), fakeNode);

    const originalDoc = global.document;
    try {
      delete global.document;
      assert.equal(renderToastOverlayWeb(fakeNode), fakeNode);

      global.document = { body: { nodeType: 1, tagName: 'BODY' } };
      const portalResult = renderToastOverlayWeb(fakeNode);
      assert.equal(portalResult.children, fakeNode);
      assert.equal(portalResult.containerInfo.tagName, 'BODY');
    } finally {
      if (originalDoc === undefined) delete global.document;
      else global.document = originalDoc;
    }
  });
});
