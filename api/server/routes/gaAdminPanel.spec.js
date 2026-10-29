const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(
  path.resolve(__dirname, '../../../client/public/ga-admin/index.html'),
  'utf8',
);
const spec = {
  name: 'ga-1',
  label: 'Modelo GA-1',
  default: true,
  preset: { endpoint: 'OpenRouter', model: 'model-a', temperature: 0.5 },
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
let dom;
afterEach(() => dom?.window.close());

async function settle() {
  for (let count = 0; count < 100; count++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (dom.window.document.getElementById('status').textContent !== 'Carregando…') return;
  }
  throw new Error('O painel não concluiu a operação');
}
function open(fetch) {
  dom = new JSDOM(html, {
    url: 'http://localhost/ga-admin/index.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = fetch;
    },
  });
  return dom.window.document;
}

test('mostra orientação de login se o refresh falhar', async () => {
  const fetch = jest.fn().mockResolvedValue(json({}, 401));
  const doc = open(fetch);
  await settle();
  expect(doc.getElementById('status').textContent).toBe('Faça login em /login primeiro');
  expect(doc.getElementById('panel').hidden).toBe(true);
  expect(fetch).toHaveBeenCalledWith('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  });
});

test('nega painel quando a API GA recusa o usuário', async () => {
  const doc = open(
    jest.fn(async (url) => (url.includes('/refresh') ? json({ token: 'token' }) : json({}, 403))),
  );
  await settle();
  expect(doc.getElementById('status').textContent).toContain('Acesso negado');
  expect(doc.getElementById('panel').hidden).toBe(true);
});

test('salva os dois roles preservando overrides, prioridade e parâmetros do spec', async () => {
  const writes = [];
  const fetch = jest.fn(async (url, options) => {
    if (options.method === 'PUT') {
      writes.push([url, JSON.parse(options.body)]);
      return json({ config: {} });
    }
    if (url.includes('/refresh')) return json({ token: 'token' });
    if (url.includes('/summary'))
      return json({ users: 1, conversations: 0, messages: 0, allowRegistration: 'false' });
    if (url.endsWith('/base'))
      return json({
        config: { modelSpecs: { list: [spec] }, interfaceConfig: { customWelcome: 'Olá' } },
      });
    return json({
      config: {
        priority: url.endsWith('ADMIN') ? 20 : 10,
        overrides: {
          interface: { customWelcome: 'Anterior' },
          modelSpecs: { list: [spec] },
          balance: { enabled: false },
        },
      },
    });
  });
  const doc = open(fetch);
  await settle();
  expect(doc.getElementById('panel').hidden).toBe(false);
  doc.querySelector('[data-key="model"]').value = 'model-b';
  doc
    .getElementById('models-form')
    .dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  expect(writes).toHaveLength(2);
  expect(writes.map(([url]) => url)).toEqual([
    '/api/admin/config/role/USER',
    '/api/admin/config/role/ADMIN',
  ]);
  for (const [, body] of writes) {
    expect(body.overrides.interface.customWelcome).toBe('Anterior');
    expect(body.overrides.balance).toEqual({ enabled: false });
    expect(body.overrides.modelSpecs).toMatchObject({
      enforce: true,
      prioritize: true,
      list: [{ preset: { model: 'model-b', temperature: 0.5 } }],
    });
  }
  expect(writes[1][1].priority).toBe(20);
  doc.getElementById('welcome').value = 'Novo';
  doc
    .getElementById('settings-form')
    .dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  expect(writes).toHaveLength(4);
  expect(writes[2][1].overrides.interface.customWelcome).toBe('Novo');
  expect(doc.getElementById('registration').textContent).toBe('false');
});
