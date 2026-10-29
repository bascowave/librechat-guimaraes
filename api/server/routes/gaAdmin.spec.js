const express = require('express');
const request = require('supertest');
const { createGAEmailGuard, createGAAdminHandlers } = require('../../../packages/api/src/admin/ga');

function appFor(email, handlers) {
  const app = express();
  app.use((req, res, next) => {
    req.user = email ? { email, tenantId: 'tenant-ga' } : undefined;
    next();
  });
  app.use(createGAEmailGuard('ti@guimaraesaranha.com.br'));
  app.get('/usage', handlers?.usage ?? ((req, res) => res.sendStatus(204)));
  if (handlers) app.get('/summary', handlers.summary);
  return app;
}

describe('GA admin', () => {
  test.each(['ti@guimaraesaranha.com.br', 'TI@GuimaraesAranha.com.br'])(
    'aceita o e-mail autorizado sem distinguir maiúsculas: %s',
    async (email) => {
      expect((await request(appFor(email)).get('/usage')).status).toBe(204);
    },
  );
  test.each(['outro@guimaraesaranha.com.br', undefined, 'ti@guimaraesaranha.com.br.evil'])(
    'nega e-mail diferente ou ausente: %s',
    async (email) => {
      const response = await request(appFor(email)).get('/usage');
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ code: 'GA_ADMIN_FORBIDDEN' });
    },
  );
  test('respeita o e-mail configurado', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.user = { email: 'GESTOR@example.com' };
      next();
    });
    app.use(createGAEmailGuard('gestor@example.com'));
    app.get('/', (req, res) => res.sendStatus(204));
    expect((await request(app).get('/')).status).toBe(204);
  });
  test('valida dias, encaminha tenant e não expõe falhas do banco', async () => {
    const getGAUsage = jest.fn().mockResolvedValue({ transactions: [], messages: [] });
    const handlers = createGAAdminHandlers({ getGAUsage, getGASummary: jest.fn() });
    const app = appFor('ti@guimaraesaranha.com.br', handlers);
    const response = await request(app).get('/usage');
    expect(response.status).toBe(200);
    expect(response.body.days).toBe(30);
    expect(getGAUsage).toHaveBeenCalledWith(expect.any(Date), 'tenant-ga');
    for (const days of ['0', '-1', 'abc', '1.5', 'Infinity', '99999999999999999']) {
      expect((await request(app).get(`/usage?days=${days}`)).status).toBe(400);
    }
    expect(getGAUsage).toHaveBeenCalledTimes(1);
    getGAUsage.mockRejectedValue(new Error('mongodb://secret:password/internal'));
    const failure = await request(app).get('/usage?days=7');
    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ code: 'GA_USAGE_UNAVAILABLE' });
  });
  test('retorna resumo e registro somente leitura, sem ocultar falhas como ausência', async () => {
    const getGASummary = jest.fn().mockResolvedValue({ users: 2, conversations: 3, messages: 4 });
    const app = appFor(
      'ti@guimaraesaranha.com.br',
      createGAAdminHandlers({
        getGAUsage: jest.fn(),
        getGASummary,
        allowRegistration: 'false',
      }),
    );
    const response = await request(app).get('/summary');
    expect(response.body).toEqual({
      users: 2,
      conversations: 3,
      messages: 4,
      allowRegistration: 'false',
    });
    expect(getGASummary).toHaveBeenCalledWith('tenant-ga');
    getGASummary.mockRejectedValue(new Error('secret'));
    const failure = await request(app).get('/summary');
    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ code: 'GA_SUMMARY_UNAVAILABLE' });
  });
});
