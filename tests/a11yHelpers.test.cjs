const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const originalLoad = Module._load;
const originalTsLoader = require.extensions['.ts'] || require.extensions['.tsx'];
Module._load = function (request, ...args) {
  if (request === 'react') {
    return {
      __esModule: true,
      default: { createContext: (v) => v },
      createContext: (v) => v,
      useState: (v) => [v, () => {}],
      useContext: (c) => c,
      useEffect: () => {},
    };
  }
  if (request === '@react-native-async-storage/async-storage') {
    return {
      __esModule: true,
      default: { getItem: async () => null, setItem: async () => {} },
    };
  }
  if (request === 'react-native') {
    return {
      Alert: { alert: () => {} },
      Platform: { OS: 'web' },
    };
  }
  return originalLoad.call(this, request, ...args);
};

const compileTs = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText,
    filename
  );
};
require.extensions['.ts'] = compileTs;
require.extensions['.tsx'] = compileTs;

const { parseInlineMarkdown, stripMarkdown } = require('../src/lib/markdownText.ts');
const { getCriticalityBadgeInfo } = require('../src/lib/anomalyClassifier.ts');
const { lightColors, darkColors } = require('../src/context/ThemeContext.tsx');
const { inferFeedbackVariant, showAlert, subscribeToToasts } = require('../src/lib/feedback.ts');

Module._load = originalLoad;
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;

test('parseInlineMarkdown e stripMarkdown removem delimitadores de negrito e itálico', () => {
  const segments = parseInlineMarkdown('Olá **usuário**, revise *esta seção* agora.');
  assert.deepEqual(segments, [
    { text: 'Olá ' },
    { text: 'usuário', bold: true },
    { text: ', revise ' },
    { text: 'esta seção', italic: true },
    { text: ' agora.' },
  ]);
  assert.equal(stripMarkdown('Confirmar **sim** ou *não*?'), 'Confirmar sim ou não?');
  assert.equal(stripMarkdown('Texto simples sem marcação'), 'Texto simples sem marcação');
});

test('getCriticalityBadgeInfo atende contraste WCAG AA (>= 4.5:1) nos temas claro e escuro', () => {
  const levels = ['critical', 'medium', 'low', 'info'];
  for (const theme of ['light', 'dark']) {
    for (const level of levels) {
      const badge = getCriticalityBadgeInfo(level, theme);
      const ratio = contrastRatio(badge.color, badge.bgColor);
      assert.ok(
        ratio >= 4.5,
        `Contraste insuficiente para ${theme}/${level}: ${badge.color} em ${badge.bgColor} = ${ratio.toFixed(2)}:1`
      );
    }
  }
});

test('tokens de ThemeContext atendem WCAG AA (>= 4.5:1)', () => {
  for (const [name, palette] of [
    ['light', lightColors],
    ['dark', darkColors],
  ]) {
    assert.ok(contrastRatio(palette.onPrimary, palette.primary) >= 4.5, `${name}: onPrimary em primary`);
    assert.ok(contrastRatio(palette.text, palette.background) >= 4.5, `${name}: text em background`);
    assert.ok(contrastRatio(palette.text, palette.cardBackground) >= 4.5, `${name}: text em cardBackground`);
    assert.ok(contrastRatio(palette.textMuted, palette.background) >= 4.5, `${name}: textMuted em background`);
    assert.ok(contrastRatio(palette.textMuted, palette.cardBackground) >= 4.5, `${name}: textMuted em cardBackground`);
    assert.ok(contrastRatio(palette.danger, palette.cardBackground) >= 4.5, `${name}: danger em cardBackground`);
    assert.ok(contrastRatio(palette.danger, palette.dangerBg) >= 4.5, `${name}: danger em dangerBg`);
  }
  assert.ok(contrastRatio(lightColors.primary, lightColors.cardBackground) >= 4.5, 'light: primary em cardBackground');
  assert.ok(contrastRatio(lightColors.primary, lightColors.background) >= 4.5, 'light: primary em background');
  assert.ok(contrastRatio(lightColors.inputBorder, lightColors.cardBackground) >= 3.0, 'light: inputBorder >= 3:1');
  assert.ok(contrastRatio(darkColors.inputBorder, darkColors.cardBackground) >= 3.0, 'dark: inputBorder >= 3:1');
});

test('inferFeedbackVariant e showAlert emitem toast tipado quando há listener ativo', () => {
  assert.equal(inferFeedbackVariant('Sucesso'), 'success');
  assert.equal(inferFeedbackVariant('Erro ao salvar'), 'error');
  assert.equal(inferFeedbackVariant('Aviso'), 'warning');
  assert.equal(inferFeedbackVariant('Sobre o BioDash'), 'info');

  const received = [];
  const unsubscribe = subscribeToToasts((toast) => received.push(toast));
  try {
    showAlert('Sucesso', 'Operação concluída!');
  } finally {
    unsubscribe();
  }
  assert.equal(received.length, 1);
  assert.equal(received[0].variant, 'success');
  assert.equal(received[0].title, 'Sucesso');
  assert.equal(received[0].message, 'Operação concluída!');
});
