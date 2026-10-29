const express = require('express');
const { createGAEmailGuard, createGAAdminHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
const handlers = createGAAdminHandlers({
  getGAUsage: db.getGAUsage,
  getGASummary: db.getGASummary,
  allowRegistration: process.env.ALLOW_REGISTRATION,
});
router.use(
  requireJwtAuth,
  requireCapability(SystemCapabilities.ACCESS_ADMIN),
  createGAEmailGuard(process.env.GA_ADMIN_EMAIL || 'ti@guimaraesaranha.com.br'),
);
router.get('/usage', handlers.usage);
router.get('/summary', handlers.summary);

module.exports = router;
