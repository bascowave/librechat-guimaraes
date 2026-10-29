import type { GAAdminMethods } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';

type GAHandler = (req: ServerRequest, res: Response, next: NextFunction) => void | Promise<void>;

export function createGAEmailGuard(adminEmail: string): GAHandler {
  return (req: ServerRequest, res, next) => {
    if (req.user?.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      res.status(403).json({ code: 'GA_ADMIN_FORBIDDEN' });
      return;
    }
    next();
  };
}

export function createGAAdminHandlers(deps: GAAdminMethods & { allowRegistration?: string }): {
  usage: GAHandler;
  summary: GAHandler;
} {
  return {
    async usage(req: ServerRequest, res) {
      const days = req.query.days === undefined ? 30 : Number(req.query.days);
      const since = new Date(Date.now() - days * 86400000);
      if (!Number.isSafeInteger(days) || days < 1 || Number.isNaN(since.getTime())) {
        res.status(400).json({ code: 'GA_INVALID_DAYS' });
        return;
      }
      try {
        const usage = await deps.getGAUsage(since, req.user?.tenantId);
        res.json({ days, since, ...usage });
      } catch {
        res.status(500).json({ code: 'GA_USAGE_UNAVAILABLE' });
      }
    },
    async summary(req: ServerRequest, res) {
      try {
        const summary = await deps.getGASummary(req.user?.tenantId);
        res.json({ ...summary, allowRegistration: deps.allowRegistration ?? null });
      } catch {
        res.status(500).json({ code: 'GA_SUMMARY_UNAVAILABLE' });
      }
    },
  };
}
