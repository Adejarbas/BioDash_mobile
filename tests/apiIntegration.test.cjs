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

let authLib;
let apiRequest;
let markersApi;
let indicatorsApi;
let maintenanceApi;
let alertsApi;
let profileApi;
let chatbotApi;
let semanticSearchApi;
let biodigestoresApi;
let MAX_CHATBOT_AUDIO_BYTES;

function loadTsModules(apiUrl) {
  const originalEnvUrl = process.env.EXPO_PUBLIC_API_URL;
  const originalLoad = Module._load;
  const originalTsLoader = require.extensions['.ts'];

  const authPath = require.resolve('../src/lib/auth.ts');
  const apiPath = require.resolve('../src/lib/api.ts');
  delete require.cache[authPath];
  delete require.cache[apiPath];

  process.env.EXPO_PUBLIC_API_URL = apiUrl;

  Module._load = function (request, ...args) {
    if (request === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: asyncStorage };
    }
    return originalLoad.call(this, request, ...args);
  };

  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    module._compile(compiled, filename);
  };

  try {
    ({ authLib } = require('../src/lib/auth.ts'));
    ({
      apiRequest,
      markersApi,
      indicatorsApi,
      maintenanceApi,
      alertsApi,
      profileApi,
      chatbotApi,
      semanticSearchApi,
      biodigestoresApi,
      MAX_CHATBOT_AUDIO_BYTES,
    } = require('../src/lib/api.ts'));
  } finally {
    Module._load = originalLoad;

    if (originalTsLoader) {
      require.extensions['.ts'] = originalTsLoader;
    } else {
      delete require.extensions['.ts'];
    }

    if (originalEnvUrl === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = originalEnvUrl;
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

describe('HTTP integration tests for auth.ts and api.ts', () => {
  before(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyText = bodyBuffer.toString('utf8');
        const parsedUrl = new URL(req.url, baseUrl);

        const reqRecord = {
          method: req.method,
          path: parsedUrl.pathname,
          search: parsedUrl.search,
          searchParams: parsedUrl.searchParams,
          headers: req.headers,
          bodyBuffer,
          bodyText,
        };
        requests.push(reqRecord);

        if (routeHandler) {
          routeHandler(reqRecord, res);
          return;
        }
        sendJson(res, 404, { success: false, error: 'Route not mocked' });
      });
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    loadTsModules(baseUrl);
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

  test('authLib.signIn stores JWT and authenticated APIs send Bearer token, JSON Content-Type, and parse { success, data }', async () => {
    routeHandler = (req, res) => {
      if (req.method === 'POST' && req.path === '/api/auth/login') {
        return sendJson(res, 200, {
          success: true,
          data: {
            token: 'jwt-integration-token',
            user: { id: 'user-42', email: 'op@biogen.com' },
          },
        });
      }

      if (req.method === 'GET' && req.path === '/api/indicators') {
        return sendJson(res, 200, { success: true, data: [{ month: '11', energyGenerated: 420 }] });
      }
      if (req.method === 'POST' && req.path === '/api/markers') {
        return sendJson(res, 201, { success: true, data: { id: 'marker-1', name: 'Bio Norte' } });
      }
      if (req.method === 'POST' && req.path === '/api/maintenance/schedules') {
        return sendJson(res, 201, { success: true, data: { id: 'sched-1', status: 'pending' } });
      }
      if (req.method === 'PUT' && req.path === '/api/maintenance/schedules/sched-1') {
        return sendJson(res, 200, { success: true, data: { id: 'sched-1', status: 'completed' } });
      }
      if (req.method === 'PUT' && req.path === '/api/profile') {
        return sendJson(res, 200, { success: true, data: { company_name: 'BioGen Ltda' } });
      }
      if (req.method === 'POST' && req.path === '/api/semantic-search') {
        return sendJson(res, 200, { success: true, data: [{ title: 'Pressão CH4' }] });
      }
      if (req.method === 'GET' && req.path === '/api/markers') {
        return sendJson(res, 200, { success: true, data: [{ id: 'bio-1', user_id: 'user-42' }] });
      }

      return sendJson(res, 404, { success: false, error: `Unexpected route ${req.method} ${req.path}` });
    };

    const loginData = await authLib.signIn('op@biogen.com', 'secret123');
    assert.equal(loginData.token, 'jwt-integration-token');
    assert.equal(await authLib.getToken(), 'jwt-integration-token');

    const indicatorsRes = await indicatorsApi.fetch();
    assert.deepEqual(indicatorsRes, {
      success: true,
      data: [{ month: '11', energyGenerated: 420 }],
      message: undefined,
    });

    const markersRes = await markersApi.save({ name: 'Bio Norte', lat: -23.5, lng: -46.6 });
    assert.deepEqual(markersRes, {
      success: true,
      data: { id: 'marker-1', name: 'Bio Norte' },
      message: undefined,
    });

    const createSchedRes = await maintenanceApi.createSchedule({
      name: 'Troca de filtro',
      priority: 'high',
      scheduledDate: '2026-12-01',
    });
    assert.deepEqual(createSchedRes, {
      success: true,
      data: { id: 'sched-1', status: 'pending' },
      message: undefined,
    });

    const updateSchedRes = await maintenanceApi.updateSchedule('sched-1', 'completed');
    assert.deepEqual(updateSchedRes, {
      success: true,
      data: { id: 'sched-1', status: 'completed' },
      message: undefined,
    });

    const profileRes = await profileApi.update({ company_name: 'BioGen Ltda' });
    assert.deepEqual(profileRes, {
      success: true,
      data: { company_name: 'BioGen Ltda' },
      message: undefined,
    });

    const searchRes = await semanticSearchApi.search({ query: 'metano' });
    assert.deepEqual(searchRes, {
      success: true,
      data: [{ title: 'Pressão CH4' }],
      message: undefined,
    });

    const bioRes = await biodigestoresApi.fetch('user-42');
    assert.deepEqual(bioRes, {
      success: true,
      data: [{ id: 'bio-1', user_id: 'user-42' }],
      message: undefined,
    });

    assert.equal(requests.length, 8);
    const authedRequests = requests.slice(1);
    for (const req of authedRequests) {
      assert.equal(req.headers.authorization, 'Bearer jwt-integration-token');
      assert.equal(req.headers['content-type'], 'application/json');
    }

    assert.equal(requests[7].searchParams.get('user_id'), 'user-42');
  });

  test('alertsApi.fetch sends exact query parameters for filters and omits query string when empty', async () => {
    await asyncStorage.setItem('@biodash_jwt_token', 'alerts-token');

    routeHandler = (req, res) => {
      sendJson(res, 200, { success: true, data: { items: [], total: 0 } });
    };

    const filteredRes = await alertsApi.fetch({
      biodigesterId: 'bio-9',
      sensorType: 'ch4',
      level: 'critical',
      status: 'active',
      startDate: '2026-11-01',
      endDate: '2026-11-22',
      page: 2,
      limit: 25,
    });
    assert.equal(filteredRes.success, true);

    const unfilteredRes = await alertsApi.fetch();
    assert.equal(unfilteredRes.success, true);

    assert.equal(requests.length, 2);
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].path, '/api/alerts');
    assert.deepEqual(Object.fromEntries(requests[0].searchParams.entries()), {
      biodigesterId: 'bio-9',
      sensorType: 'ch4',
      level: 'critical',
      status: 'active',
      startDate: '2026-11-01',
      endDate: '2026-11-22',
      page: '2',
      limit: '25',
    });

    assert.equal(requests[1].path, '/api/alerts');
    assert.equal(requests[1].search, '');
  });

  test('alertsApi.resolve sends PATCH first and falls back to PUT on HTTP 405 or 500', async () => {
    await asyncStorage.setItem('@biodash_jwt_token', 'resolve-token');

    // Case 1: PATCH succeeds -> no PUT fallback
    routeHandler = (req, res) => {
      if (req.method === 'PATCH' && req.path === '/api/alerts/alert-1') {
        return sendJson(res, 200, { success: true, data: { id: 'alert-1', via: 'PATCH' } });
      }
      return sendJson(res, 500, { error: 'Should not fallback' });
    };

    const patchOk = await alertsApi.resolve('alert-1', 'Válvula ajustada');
    assert.deepEqual(patchOk, { success: true, data: { id: 'alert-1', via: 'PATCH' }, message: undefined });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].bodyText), {
      status: 'resolved',
      resolutionNotes: 'Válvula ajustada',
    });

    // Case 2: PATCH returns 405 -> falls back to PUT
    requests.length = 0;
    routeHandler = (req, res) => {
      if (req.method === 'PATCH' && req.path === '/api/alerts/alert-2') {
        return sendJson(res, 405, { error: 'Method Not Allowed' });
      }
      if (req.method === 'PUT' && req.path === '/api/alerts/alert-2') {
        return sendJson(res, 200, { success: true, data: { id: 'alert-2', via: 'PUT-after-405' } });
      }
      return sendJson(res, 404, { error: 'Unexpected' });
    };

    const putAfter405 = await alertsApi.resolve('alert-2', 'Sensor calibrado');
    assert.deepEqual(putAfter405, {
      success: true,
      data: { id: 'alert-2', via: 'PUT-after-405' },
      message: undefined,
    });
    assert.deepEqual(requests.map((r) => r.method), ['PATCH', 'PUT']);
    assert.deepEqual(JSON.parse(requests[1].bodyText), {
      status: 'resolved',
      resolutionNotes: 'Sensor calibrado',
    });

    // Case 3: PATCH returns 500 -> falls back to PUT
    requests.length = 0;
    routeHandler = (req, res) => {
      if (req.method === 'PATCH' && req.path === '/api/alerts/alert-3') {
        return sendJson(res, 500, { error: 'Internal Server Error' });
      }
      if (req.method === 'PUT' && req.path === '/api/alerts/alert-3') {
        return sendJson(res, 200, { success: true, data: { id: 'alert-3', via: 'PUT-after-500' } });
      }
      return sendJson(res, 404, { error: 'Unexpected' });
    };

    const putAfter500 = await alertsApi.resolve('alert-3', 'Reiniciado');
    assert.deepEqual(putAfter500, {
      success: true,
      data: { id: 'alert-3', via: 'PUT-after-500' },
      message: undefined,
    });
    assert.deepEqual(requests.map((r) => r.method), ['PATCH', 'PUT']);
  });

  test('chatbotApi.send forwards payload and chatbotApi.transcribeAudio validates size locally and sends multipart/form-data', async () => {
    await asyncStorage.setItem('@biodash_jwt_token', 'chat-token');

    const chatPayload = {
      message: 'Como está a produção hoje?',
      history: [{ role: 'user', text: 'Oi' }, { role: 'bot', text: 'Olá!' }],
      context: { last_intent: 'status', selected_biodigestor: 'bio-1' },
    };

    routeHandler = (req, res) => {
      if (req.method === 'POST' && req.path === '/api/chatbot') {
        return sendJson(res, 200, {
          success: true,
          data: { reply: 'Produção estável em 85%.' },
        });
      }
      if (req.method === 'POST' && req.path === '/api/chatbot/transcribe') {
        if (req.bodyText.includes('sample-no-speech')) {
          return sendJson(res, 200, {
            success: true,
            data: { text: '', status: 'no-recognized', language: 'pt', duration: 3.5 },
          });
        }
        return sendJson(res, 200, {
          success: true,
          data: { text: 'Verificar pressão do biodigestor', status: 'success', language: 'pt', duration: 4.3 },
        });
      }
      return sendJson(res, 404, { error: 'Not found' });
    };

    const sendRes = await chatbotApi.send(chatPayload);
    assert.deepEqual(sendRes, {
      success: true,
      data: { reply: 'Produção estável em 85%.' },
      message: undefined,
    });
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].bodyText), chatPayload);

    // Oversized audio (> 400 * 1024 bytes) must fail locally without hitting server
    const oversizedBlob = new Blob([new Uint8Array(MAX_CHATBOT_AUDIO_BYTES + 1)], { type: 'audio/webm' });
    const oversizedRes = await chatbotApi.transcribeAudio(oversizedBlob, 'too-big.webm', 15);
    assert.equal(oversizedRes.success, false);
    assert.match(oversizedRes.error, /400 KB/);
    assert.equal(requests.length, 1);

    // Valid audio -> status: "no-recognized"
    const silentBlob = new Blob([Buffer.from('sample-no-speech')], { type: 'audio/webm' });
    const noRecRes = await chatbotApi.transcribeAudio(silentBlob, 'silent.webm', 3.5);
    assert.deepEqual(noRecRes, {
      success: true,
      data: { text: '', status: 'no-recognized', language: 'pt', duration: 3.5 },
      message: undefined,
    });

    // Valid audio -> status: "success"
    const voiceBlob = new Blob([Buffer.from('sample-voice-bytes')], { type: 'audio/webm' });
    const okRes = await chatbotApi.transcribeAudio(voiceBlob, 'voice.webm', 4.26);
    assert.deepEqual(okRes, {
      success: true,
      data: { text: 'Verificar pressão do biodigestor', status: 'success', language: 'pt', duration: 4.3 },
      message: undefined,
    });

    assert.equal(requests.length, 3);
    for (const transcribeReq of requests.slice(1)) {
      assert.equal(transcribeReq.method, 'POST');
      assert.equal(transcribeReq.path, '/api/chatbot/transcribe');
      assert.equal(transcribeReq.headers.authorization, 'Bearer chat-token');
      assert.match(transcribeReq.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.match(transcribeReq.bodyText, /name="audio"/);
      assert.match(transcribeReq.bodyText, /name="durationSeconds"/);
    }
    assert.match(requests[2].bodyText, /4\.3/);
  });

  test('apiRequest handles HTTP 4xx/5xx JSON errors, invalid non-JSON responses, and connection errors', async () => {
    routeHandler = (req, res) => {
      if (req.path === '/api/err-400') {
        return sendJson(res, 400, { error: 'Parâmetro inválido' });
      }
      if (req.path === '/api/err-500') {
        return sendJson(res, 500, { message: 'Falha interna no servidor' });
      }
      if (req.path === '/api/invalid-json') {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        return res.end('<html>Bad Gateway</html>');
      }
      return sendJson(res, 404, { error: 'Not found' });
    };

    const res400 = await apiRequest('/err-400');
    assert.deepEqual(res400, { success: false, error: 'Parâmetro inválido' });

    const res500 = await apiRequest('/err-500');
    assert.deepEqual(res500, { success: false, error: 'Falha interna no servidor' });

    const invalidJsonRes = await apiRequest('/invalid-json');
    assert.deepEqual(invalidJsonRes, {
      success: false,
      error: 'O servidor não enviou um JSON válido.',
    });

    // Obtain an unused port by listening and closing an ephemeral server
    const closedPort = await new Promise((resolve, reject) => {
      const tempServer = http.createServer();
      tempServer.listen(0, '127.0.0.1', () => {
        const { port } = tempServer.address();
        tempServer.close((err) => (err ? reject(err) : resolve(port)));
      });
    });

    const connErrRes = await apiRequest(`http://127.0.0.1:${closedPort}/api/unreachable`);
    assert.deepEqual(connErrRes, {
      success: false,
      error: 'Erro de conexão. Verifique se o backend está rodando.',
    });
  });
});
