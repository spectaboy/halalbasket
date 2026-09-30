// Run with: node --test scripts/check-account-connection.cjs
// No real accounts, emails, credentials, or hosted writes are used.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHmac } = require('node:crypto');
const ts = require('typescript');

function load(file, dependencies, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: { log() {}, warn() {}, error() {} },
    ...globals,
  });
  return module.exports;
}

function profile(responses) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, operation: 'select' };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key, value) { call.filter = [key, value]; return query; },
        insert(value) { call.operation = 'insert'; call.value = value; return query; },
        update(value) { call.operation = 'update'; call.value = value; return query; },
        async maybeSingle() { assert.ok(responses.length); return responses.shift(); },
        async single() { assert.ok(responses.length); return responses.shift(); },
      };
      return query;
    },
  };
  const { ProfileService } = load('app/services/profile.ts', {
    '../config/supabase': { supabase: client }, '../utils/logger': { logger: { error() {} } },
  });
  return { service: ProfileService, calls };
}

const row = { id: 'profile-id', clerk_id: 'user_test', role: 'customer', is_admin: false };

test('new account creates a profile using only its Clerk identity and email', async () => {
  const { service, calls } = profile([{ data: null }, { data: row }]);
  assert.equal(await service.ensureUser('user_test', 'test@example.com'), row);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].value)), {
    clerk_id: 'user_test', email: 'test@example.com',
  });
});

test('webhook winning the insert race resolves the existing profile', async () => {
  const { service } = profile([
    { data: null }, { error: { code: '23505', message: 'Duplicate' } }, { data: row },
  ]);
  assert.equal(await service.ensureUser('user_test'), row);
});

test('failed profile reads propagate without creating a duplicate', async () => {
  const error = new Error('JWT expired');
  const { service, calls } = profile([{ error }]);
  await assert.rejects(service.ensureUser('user_test'), error);
  assert.equal(calls.length, 1);
});

test('profile save reports failure when RLS updates no row', async () => {
  const { service } = profile([{ data: null }, { data: { id: row.id } }]);
  assert.equal(await service.updateUser(row.id, { first_name: 'Test' }), false);
  assert.equal(await service.updateUser(row.id, { first_name: 'Test' }), true);
});

test('seller and driver connection errors remain visible to the session', async () => {
  const error = new Error('Database unavailable');
  const { service } = profile([{ error }, { error }]);
  await assert.rejects(service.getSellerByUserId(row.id), error);
  await assert.rejects(service.getDriverByUserId(row.id), error);
});

test('Supabase reads the current Clerk token and clears it on sign-out', async () => {
  let options;
  const { setSupabaseTokenGetter } = load('app/config/supabase.ts', {
    '@supabase/supabase-js': { createClient: (_url, _key, config) => {
      options = config;
      return { functions: { invoke() {} }, rpc() {} };
    } },
    'expo-updates': {}, 'react-native-url-polyfill/auto': {},
    '../utils/logger': { logger: {} },
  }, { process: { env: {} }, __DEV__: true });
  assert.equal(await options.accessToken(), null);
  let token = 'first-session-token';
  setSupabaseTokenGetter(async () => token);
  assert.equal(await options.accessToken(), token);
  token = 'refreshed-session-token';
  assert.equal(await options.accessToken(), token);
  setSupabaseTokenGetter(async () => { throw new Error('Token unavailable'); });
  await assert.rejects(options.accessToken(), /Token unavailable/);
  setSupabaseTokenGetter(null);
  assert.equal(await options.accessToken(), null);
});

function webhook() {
  let handler;
  const writes = [];
  const secret = Buffer.from('only-a-local-webhook-test-secret').toString('base64');
  load('supabase/functions/clerk-webhook/index.ts', {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn) => { handler = fn; } },
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => ({
      from: (table) => ({ upsert: async (value, options) => {
        writes.push({ table, value, options });
        return { error: null };
      } }),
    }) },
  }, {
    Deno: { env: { get: (key) => key === 'CLERK_WEBHOOK_SECRET' ? `whsec_${secret}` : 'local-test' } },
    atob, btoa, crypto, TextEncoder, Response,
  });
  function request(type, email, valid = true) {
    const body = JSON.stringify({ type, data: {
      id: 'user_test', primary_email_address_id: 'email-primary', first_name: 'Test',
      email_addresses: [{ id: 'email-primary', email_address: email, verification: { status: 'verified' } }],
    } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(`test-message.${timestamp}.${body}`).digest('base64');
    return new Request('https://local.invalid/webhook', {
      method: 'POST', body, headers: {
        'svix-id': 'test-message', 'svix-timestamp': timestamp,
        'svix-signature': `v1,${valid ? signature : 'invalid'}`,
      },
    });
  }
  return { handler, writes, request };
}

for (const email of ['shopper@example.com', 'shopper@ucalgary.ca']) {
  test(`signed Clerk events sync ${email} without unsupported columns`, async () => {
    const { handler, writes, request } = webhook();
    for (const type of ['user.created', 'user.updated']) {
      assert.equal((await handler(request(type, email))).status, 200);
    }
    assert.equal(writes.length, 2);
    for (const { table, value, options } of writes) {
      assert.equal(table, 'users');
      assert.equal(value.email, email);
      assert.equal(value.clerk_id, 'user_test');
      assert.ok(!('university_email' in value));
      assert.ok(!('role' in value) && !('is_admin' in value));
      assert.equal(options.ignoreDuplicates, true);
    }
  });
}

test('unsigned or incorrectly signed webhook requests cannot write profiles', async () => {
  const { handler, writes, request } = webhook();
  assert.equal((await handler(new Request('https://local.invalid'))).status, 401);
  assert.equal((await handler(request('user.created', 'test@example.com', false))).status, 401);
  assert.equal(writes.length, 0);
});
