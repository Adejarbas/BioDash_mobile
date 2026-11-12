const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'secret-for-unit-tests';
const authMiddleware = require('../src/middleware/auth');

function execute(authorization) {
  const req = { headers: { authorization } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  authMiddleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('rejeita requisições sem token Bearer', () => {
  for (const header of [undefined, 'Basic abc']) {
    const result = execute(header);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.res.body.success, false);
    assert.equal(result.nextCalled, false);
  }
});

test('rejeita tokens inválidos ou expirados', () => {
  const expired = jwt.sign({ id: '1' }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of ['invalid', expired, jwt.sign({ id: '1' }, 'wrong-secret')]) {
    const result = execute(`Bearer ${token}`);
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, false);
  }
});

test('autoriza token válido e disponibiliza o usuário', () => {
  const token = jwt.sign({ id: '42', email: 'a@example.com' }, process.env.JWT_SECRET);
  const result = execute(`Bearer ${token}`);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.id, '42');
  assert.equal(result.req.user.email, 'a@example.com');
});
