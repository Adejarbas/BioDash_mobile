const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Carrega a biblioteca TypeScript com armazenamento isolado, sem iniciar o Expo.
const storage = new Map();
const asyncStorage = {
  setItem: async (key, value) => { storage.set(key, value); },
  getItem: async key => storage.get(key) ?? null,
  removeItem: async key => { storage.delete(key); },
};
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalTsLoader = require.extensions['.ts'];
Module._load = function (request, ...args) {
  if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
};
const { authLib } = require('../src/lib/auth.ts');
Module._load = originalLoad;
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
else delete require.extensions['.ts'];

beforeEach(() => { storage.clear(); global.fetch = originalFetch; });
after(() => { global.fetch = originalFetch; });

test('login envia credenciais e salva a sessão', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /\/auth\/login$/);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email: 'a@example.com', password: 'senha' });
    return { ok: true, json: async () => ({ success: true, data: { token: 'token', user: { id: '1', email: 'a@example.com' } } }) };
  };
  await authLib.signIn('a@example.com', 'senha');
  assert.equal(await authLib.getToken(), 'token');
  assert.deepEqual(await authLib.getUser(), { id: '1', email: 'a@example.com' });
  assert.equal(await authLib.isAuthenticated(), true);
});

test('login rejeita erro retornado pela API sem criar sessão', async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ success: false, message: 'Credenciais inválidas' }) });
  await assert.rejects(authLib.signIn('a@example.com', 'errada'), /Credenciais inválidas/);
  assert.equal(await authLib.isAuthenticated(), false);
});

test('cadastro apresenta erro de validação', async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ success: false, errors: { email: ['Email inválido'] } }) });
  await assert.rejects(authLib.signUp({ email: 'inválido', password: '123' }), /Email inválido/);
});

test('dados corrompidos são removidos e logout limpa a sessão', async () => {
  await asyncStorage.setItem('@biodash_user', '{inválido');
  assert.equal(await authLib.getUser(), null);
  assert.equal(await asyncStorage.getItem('@biodash_user'), null);
  await asyncStorage.setItem('@biodash_jwt_token', 'token');
  await asyncStorage.setItem('@biodash_user', '{}');
  await authLib.signOut();
  assert.equal(await authLib.getToken(), null);
  assert.equal(await authLib.getUser(), null);
});
