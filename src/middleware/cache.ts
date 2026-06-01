import type { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: unknown;
  timestamp: number;
}

const store = new Map<string, CacheEntry>();

const CACHEABLE_PATTERNS = [
  { pattern: /^\/crux\/card\/share\//, ttl: 2 * 60 * 1000 },
  { pattern: /^\/crux\/health/, ttl: 30 * 1000 },
  { pattern: /^\/api\/health/, ttl: 30 * 1000 },
];

export function clearCache() {
  store.clear();
}

export function responseCache(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    next();
    return;
  }

  const config = CACHEABLE_PATTERNS.find(c => c.pattern.test(req.path));
  if (!config) {
    next();
    return;
  }

  const key = req.path;

  const cached = store.get(key);
  if (cached && Date.now() - cached.timestamp < config.ttl) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    store.set(key, { body, timestamp: Date.now() });
    res.setHeader('X-Cache', 'MISS');
    return originalJson(body);
  };

  next();
}