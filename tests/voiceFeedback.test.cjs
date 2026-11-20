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

const {
  NO_SPEECH_RECOGNIZED_MESSAGE,
  isNoSpeechRecognitionError,
} = require('../src/services/voiceFeedback.ts');

test('NO_SPEECH_RECOGNIZED_MESSAGE contém a mensagem esperada e instruções de voz', () => {
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /Desculpe, mas não consegui reconhecer sua fala/);
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /microfone/i);
  assert.match(NO_SPEECH_RECOGNIZED_MESSAGE, /ruído/i);
});

test('isNoSpeechRecognitionError identifica erros de ausência de fala', () => {
  assert.equal(isNoSpeechRecognitionError('Nenhuma fala foi reconhecida.'), true);
  assert.equal(isNoSpeechRecognitionError('Nenhuma fala detectada.'), true);
  assert.equal(isNoSpeechRecognitionError('no-speech'), true);
  assert.equal(isNoSpeechRecognitionError('No speech detected'), true);
  assert.equal(isNoSpeechRecognitionError('Erro de conexão com o servidor'), false);
  assert.equal(isNoSpeechRecognitionError(null), false);
  assert.equal(isNoSpeechRecognitionError(undefined), false);
});
