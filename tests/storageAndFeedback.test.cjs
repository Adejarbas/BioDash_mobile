const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const ts = require('typescript');

const storageMap = new Map();
const asyncStorageMock = {
  setItem: async (key, value) => { storageMap.set(key, value); },
  getItem: async (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  removeItem: async (key) => { storageMap.delete(key); },
};

let readAsStringCalls = [];
let readAsStringImpl = async () => Buffer.from('fake-png-bytes').toString('base64');
const fileSystemMock = {
  readAsStringAsync: async (uri, options) => {
    readAsStringCalls.push({ uri, options });
    return readAsStringImpl(uri, options);
  },
};

let alertCalls = [];
const reactNativeMock = {
  Platform: { OS: 'web' },
  Alert: {
    alert: (...args) => {
      alertCalls.push(args);
    },
  },
};

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

let server;
let baseUrl;
let routeHandler;
let storageLib;
let feedbackLib;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      if (routeHandler) {
        await routeHandler(req, res, body);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  process.env.EXPO_PUBLIC_API_URL = baseUrl;

  const originalLoad = Module._load;
  const originalTsLoader = require.extensions['.ts'];

  Module._load = function (request, ...args) {
    if (request === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: asyncStorageMock };
    }
    if (request === 'expo-file-system/legacy') {
      return fileSystemMock;
    }
    if (request === 'react-native') {
      return { __esModule: true, ...reactNativeMock };
    }
    return originalLoad.call(this, request, ...args);
  };

  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    module._compile(transpiled.outputText, filename);
  };

  try {
    storageLib = require('../src/lib/storage.ts');
    feedbackLib = require('../src/lib/feedback.ts');
  } finally {
    Module._load = originalLoad;
    if (originalTsLoader) {
      require.extensions['.ts'] = originalTsLoader;
    } else {
      delete require.extensions['.ts'];
    }
  }
});

beforeEach(() => {
  storageMap.clear();
  readAsStringCalls = [];
  readAsStringImpl = async () => Buffer.from('fake-png-bytes').toString('base64');
  alertCalls = [];
  reactNativeMock.Platform.OS = 'web';
  routeHandler = null;
  global.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete global.window;
  } else {
    global.window = originalWindow;
  }
});

after(async () => {
  global.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete global.window;
  } else {
    global.window = originalWindow;
  }
  if (originalApiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  }
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

// --- storage.ts: uploadFile ---

test('uploadFile throws when no JWT token is present in AsyncStorage', async () => {
  await assert.rejects(
    () => storageLib.uploadFile('file:///tmp/photo.png', 'photo.png'),
    (err) => {
      assert.equal(err.message, 'Usuário não autenticado.');
      return true;
    }
  );
});

test('uploadFile requests upload-url, reads base64 via FileSystem, PUTs bytes, and returns key', async () => {
  await asyncStorageMock.setItem('@biodash_jwt_token', 'jwt-abc-123');
  const expectedBytes = Buffer.from('hello-png-binary');
  readAsStringImpl = async () => expectedBytes.toString('base64');

  const requests = [];
  routeHandler = async (req, res, body) => {
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });

    if (req.method === 'POST' && req.url === '/api/storage/upload-url') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            uploadUrl: `${baseUrl}/storage-bucket/uploads/photo.png?sig=1`,
            key: 'uploads/photo.png',
          },
        })
      );
      return;
    }

    if (req.method === 'PUT' && req.url === '/storage-bucket/uploads/photo.png?sig=1') {
      res.writeHead(201);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  };

  const key = await storageLib.uploadFile('file:///data/user/0/photo.png', 'photo.png');

  assert.equal(key, 'uploads/photo.png');
  assert.equal(readAsStringCalls.length, 1);
  assert.deepEqual(readAsStringCalls[0], {
    uri: 'file:///data/user/0/photo.png',
    options: { encoding: 'base64' },
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/api/storage/upload-url');
  assert.equal(requests[0].headers.authorization, 'Bearer jwt-abc-123');
  assert.deepEqual(JSON.parse(requests[0].body.toString('utf8')), {
    fileName: 'photo.png',
    contentType: 'image/png',
  });

  assert.equal(requests[1].method, 'PUT');
  assert.equal(requests[1].headers['content-type'], 'image/png');
  assert.equal(requests[1].headers['x-ms-blob-type'], undefined);
  assert.deepEqual(requests[1].body, expectedBytes);
});

test('uploadFile includes x-ms-blob-type: BlockBlob header for Azure Blob Storage URLs', async () => {
  await asyncStorageMock.setItem('@biodash_jwt_token', 'jwt-azure');

  routeHandler = async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/storage/upload-url') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            uploadUrl: 'https://biodash.blob.core.windows.net/media/doc.pdf?sas=token',
            key: 'media/doc.pdf',
          },
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  };

  const azurePutCalls = [];
  global.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('.blob.core.windows.net')) {
      azurePutCalls.push({ url, options });
      return { ok: true, status: 201 };
    }
    return originalFetch(url, options);
  };

  const key = await storageLib.uploadFile('file:///tmp/doc.pdf', 'doc.pdf');

  assert.equal(key, 'media/doc.pdf');
  assert.equal(azurePutCalls.length, 1);
  assert.equal(azurePutCalls[0].options.method, 'PUT');
  assert.equal(azurePutCalls[0].options.headers['Content-Type'], 'application/pdf');
  assert.equal(azurePutCalls[0].options.headers['x-ms-blob-type'], 'BlockBlob');
});

test('uploadFile throws clear error when /api/storage/upload-url fails', async () => {
  await asyncStorageMock.setItem('@biodash_jwt_token', 'jwt-err');

  routeHandler = async (_req, res) => {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Permissão negada para upload.' }));
  };

  await assert.rejects(
    () => storageLib.uploadFile('file:///tmp/photo.png', 'photo.png'),
    (err) => {
      assert.equal(err.message, 'Permissão negada para upload.');
      return true;
    }
  );
});

test('uploadFile throws clear error when storage PUT returns non-2xx', async () => {
  await asyncStorageMock.setItem('@biodash_jwt_token', 'jwt-put-err');

  routeHandler = async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/storage/upload-url') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            uploadUrl: `${baseUrl}/storage-bucket/fail.png`,
            key: 'fail.png',
          },
        })
      );
      return;
    }
    if (req.method === 'PUT' && req.url === '/storage-bucket/fail.png') {
      res.writeHead(503);
      res.end('Service Unavailable');
      return;
    }
    res.writeHead(404);
    res.end();
  };

  await assert.rejects(
    () => storageLib.uploadFile('file:///tmp/fail.png', 'fail.png'),
    (err) => {
      assert.equal(err.message, 'Erro no envio para o storage: status 503');
      return true;
    }
  );
});

// --- storage.ts: getDownloadUrl ---

test('getDownloadUrl returns null for empty key or missing token', async () => {
  let serverCalled = false;
  routeHandler = async (_req, res) => {
    serverCalled = true;
    res.writeHead(200);
    res.end();
  };

  assert.equal(await storageLib.getDownloadUrl(''), null);
  assert.equal(await storageLib.getDownloadUrl('uploads/photo.png'), null);
  assert.equal(serverCalled, false);
});

test('getDownloadUrl sends Authorization header and returns downloadUrl or null on HTTP error', async () => {
  await asyncStorageMock.setItem('@biodash_jwt_token', 'jwt-dl-1');

  const receivedRequests = [];
  let shouldFail = false;

  routeHandler = async (req, res) => {
    receivedRequests.push({ method: req.method, url: req.url, headers: req.headers });
    if (shouldFail) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Erro interno' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: { downloadUrl: 'https://cdn.example.com/signed/photo.png?token=xyz' },
      })
    );
  };

  const url = await storageLib.getDownloadUrl('uploads/photo 1.png');
  assert.equal(url, 'https://cdn.example.com/signed/photo.png?token=xyz');
  assert.equal(receivedRequests.length, 1);
  assert.equal(receivedRequests[0].method, 'GET');
  assert.equal(
    receivedRequests[0].url,
    `/api/storage/download-url?key=${encodeURIComponent('uploads/photo 1.png')}`
  );
  assert.equal(receivedRequests[0].headers.authorization, 'Bearer jwt-dl-1');

  shouldFail = true;
  const failedUrl = await storageLib.getDownloadUrl('uploads/photo 1.png');
  assert.equal(failedUrl, null);
});

// --- feedback.ts: showAlert ---

test('showAlert emits to toastListeners when subscribed, respecting explicit variant override', () => {
  const received = [];
  const unsubscribe = feedbackLib.subscribeToToasts((toast) => received.push(toast));

  try {
    feedbackLib.showAlert('Sucesso', 'Arquivo salvo.');
    feedbackLib.showAlert('Sucesso', 'Operação com ressalva.', 'warning');

    assert.equal(received.length, 2);
    assert.equal(received[0].title, 'Sucesso');
    assert.equal(received[0].message, 'Arquivo salvo.');
    assert.equal(received[0].variant, 'success');
    assert.equal(received[0].durationMs, 4500);

    assert.equal(received[1].variant, 'warning');
  } finally {
    unsubscribe();
  }
});

test('showAlert falls back to window.alert on Web and Alert.alert on native when no listener is subscribed', () => {
  const webAlerts = [];
  global.window = {
    alert: (msg) => webAlerts.push(msg),
  };

  reactNativeMock.Platform.OS = 'web';
  feedbackLib.showAlert('Aviso', 'Verifique os dados.');
  assert.deepEqual(webAlerts, ['Aviso\n\nVerifique os dados.']);
  assert.equal(alertCalls.length, 0);

  reactNativeMock.Platform.OS = 'android';
  feedbackLib.showAlert('Erro', 'Falha na conexão.');
  assert.deepEqual(alertCalls, [['Erro', 'Falha na conexão.']]);
});

// --- feedback.ts: showConfirm ---

test('showConfirm emits to confirmListeners on Web when subscribed', () => {
  reactNativeMock.Platform.OS = 'web';
  const received = [];
  const unsubscribe = feedbackLib.subscribeToConfirm((payload) => received.push(payload));
  let confirmed = false;

  try {
    feedbackLib.showConfirm(
      'Excluir item',
      'Deseja remover este registro?',
      () => { confirmed = true; },
      'Excluir',
      true
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].title, 'Excluir item');
    assert.equal(received[0].message, 'Deseja remover este registro?');
    assert.equal(received[0].confirmText, 'Excluir');
    assert.equal(received[0].destructive, true);
    assert.equal(confirmed, false);

    received[0].onConfirm();
    assert.equal(confirmed, true);
  } finally {
    unsubscribe();
  }
});

test('showConfirm falls back to window.confirm on Web and calls onConfirm only when true', () => {
  reactNativeMock.Platform.OS = 'web';
  const confirmPrompts = [];
  let confirmResult = false;
  global.window = {
    confirm: (msg) => {
      confirmPrompts.push(msg);
      return confirmResult;
    },
  };

  let count = 0;
  feedbackLib.showConfirm('Confirmar', 'Continuar?', () => { count += 1; });
  assert.equal(count, 0);

  confirmResult = true;
  feedbackLib.showConfirm('Confirmar', 'Continuar?', () => { count += 1; });
  assert.equal(count, 1);
  assert.deepEqual(confirmPrompts, ['Confirmar\n\nContinuar?', 'Confirmar\n\nContinuar?']);
});

test('showConfirm calls Alert.alert with Cancelar and confirmText buttons on native', () => {
  reactNativeMock.Platform.OS = 'ios';
  let confirmed = false;
  const onConfirm = () => { confirmed = true; };

  feedbackLib.showConfirm('Remover', 'Tem certeza?', onConfirm, 'Apagar', true);

  assert.equal(alertCalls.length, 1);
  const [title, message, buttons] = alertCalls[0];
  assert.equal(title, 'Remover');
  assert.equal(message, 'Tem certeza?');
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons[0], { text: 'Cancelar', style: 'cancel' });
  assert.equal(buttons[1].text, 'Apagar');
  assert.equal(buttons[1].style, 'destructive');
  assert.equal(buttons[1].onPress, onConfirm);

  buttons[1].onPress();
  assert.equal(confirmed, true);
});
