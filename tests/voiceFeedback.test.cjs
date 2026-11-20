const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    filename
  );
};

const { NO_SPEECH_RECOGNIZED_MESSAGE } = require('../src/services/voiceFeedback.ts');

test('NO_SPEECH_RECOGNIZED_MESSAGE contém a mensagem esperada e instruções de voz', () => {
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /Desculpe, mas não consegui reconhecer sua fala/);
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /microfone/i);
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /ruído/i);
});
