import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/db';
import { ingestProperty } from '../modules/crux/ingestion';
import { AppError, isAppError } from '../modules/crux/shared/errors';
import type { IntentProfile, LifecycleStage, MacroCycle } from '../modules/crux/shared/types';
import { getOrComputeScore, forceRecomputeScore } from '../modules/crux/scoring';
import { streamLensMessage } from '../modules/crux/agents/lens.agent'
import { generateReport } from '../modules/crux/agents/report.agent';
import { createSession, getSession, getMessageHistory } from '../modules/crux/lens/lens.service';
import { generateCard } from '../modules/crux/card/card.generator';
import { getCardByToken } from '../modules/crux/card/card.service';
import { getOrSeedCredits, registerWatch } from '../modules/crux/watch/watch.service';

const router = Router();

// ── Health ──────────────────────────────────────────────────────────────────
// Fully implemented — returns version + timestamp
router.get('/crux/health', (_req: Request, res: Response): void => {
  console.info('CRUX GET /crux/health hit');
  res.status(200).json({
    success: true,
    version: process.env.CRUX_VERSION ?? 'dev',
    timestamp: new Date().toISOString(),
  });
});

// ── Ingestion ───────────────────────────────────────────────────────────────
const IngestSchema = z.object({ address: z.string().min(10) });

router.post('/crux/property', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX POST /crux/property hit');
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Address must be at least 10 characters',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const profile = await ingestProperty(parsed.data.address);
    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

router.get('/crux/property/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX GET /crux/property/:id hit');
  try {
    const { data, error } = await supabase
      .from('crux_properties')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new AppError(500, 'DB_READ_FAILED', error.message);
    if (!data) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Property not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

// ── Scoring ─────────────────────────────────────────────────────────────────
router.post('/crux/score', (_req: Request, res: Response): void => {
  console.info('CRUX POST /crux/score hit');
  res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: 'Scoring engine not yet implemented',
    route: 'POST /api/crux/score',
  });
});

const VALID_INTENTS: IntentProfile[] = ['yield', 'appreciation', 'balanced'];
const VALID_LIFECYCLES: LifecycleStage[] = ['near_completion', 'delivered'];
const VALID_CYCLES: MacroCycle[] = ['growth', 'correction'];

router.get('/crux/score/:property_id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX GET /crux/score/:property_id hit');
  const rawId = req.params.property_id;
  const property_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;
  const intent = typeof req.query.intent === 'string' ? req.query.intent : 'balanced';
  const lifecycle = typeof req.query.lifecycle === 'string' ? req.query.lifecycle : 'delivered';
  const macro_cycle = typeof req.query.macro_cycle === 'string' ? req.query.macro_cycle : 'growth';

  if (!VALID_INTENTS.includes(intent as IntentProfile)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `intent must be one of: ${VALID_INTENTS.join(', ')}` });
    return;
  }
  if (!VALID_LIFECYCLES.includes(lifecycle as LifecycleStage)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `lifecycle must be one of: ${VALID_LIFECYCLES.join(', ')}` });
    return;
  }
  if (!VALID_CYCLES.includes(macro_cycle as MacroCycle)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `macro_cycle must be one of: ${VALID_CYCLES.join(', ')}` });
    return;
  }

  try {
    const score = await getOrComputeScore(
      property_id,
      intent as IntentProfile,
      lifecycle as LifecycleStage,
      macro_cycle as MacroCycle,
    );
    res.status(200).json({ success: true, data: score });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

router.post('/crux/score/:property_id/compute', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX POST /crux/score/:property_id/compute hit');
  const rawId = req.params.property_id;
  const property_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;
  const intent = typeof req.query.intent === 'string' ? req.query.intent : 'balanced';
  const lifecycle = typeof req.query.lifecycle === 'string' ? req.query.lifecycle : 'delivered';
  const macro_cycle = typeof req.query.macro_cycle === 'string' ? req.query.macro_cycle : 'growth';

  if (!VALID_INTENTS.includes(intent as IntentProfile)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `intent must be one of: ${VALID_INTENTS.join(', ')}` });
    return;
  }
  if (!VALID_LIFECYCLES.includes(lifecycle as LifecycleStage)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `lifecycle must be one of: ${VALID_LIFECYCLES.join(', ')}` });
    return;
  }
  if (!VALID_CYCLES.includes(macro_cycle as MacroCycle)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `macro_cycle must be one of: ${VALID_CYCLES.join(', ')}` });
    return;
  }

  try {
    const score = await forceRecomputeScore(
      property_id,
      intent as IntentProfile,
      lifecycle as LifecycleStage,
      macro_cycle as MacroCycle,
    );
    res.status(200).json({ success: true, data: score });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

// ── Lens (chat) ─────────────────────────────────────────────────────────────
router.post('/crux/lens/session', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX POST /crux/lens/session hit');
  try {
    const { property_id } = req.body as { property_id?: string };

    if (!property_id || typeof property_id !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'property_id is required');
    }

    const { data: property, error } = await supabase
      .from('crux_properties')
      .select('id, address_raw, city')
      .eq('id', property_id)
      .maybeSingle();

    if (error || !property) {
      throw new AppError(404, 'PROPERTY_NOT_FOUND', 'Property not found. Ingest it first via POST /crux/property.');
    }

    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    const session = await createSession(property_id, userId);

    res.json({
      success: true,
      data: {
        session_id: session.id,
        property_id: session.property_id,
        expires_at: session.expires_at,
        created_at: session.created_at,
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

router.post('/crux/lens/:session_id/message', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX POST /crux/lens/:session_id/message hit');
  try {
    const rawId = req.params.session_id;
    const session_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;
    const { message } = req.body as { message?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'message is required and cannot be empty');
    }

    if (message.length > 2000) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Message too long. Maximum 2000 characters.');
    }

    await streamLensMessage(session_id, message.trim(), res);
  } catch (err) {
    next(err);
  }
});

router.get('/crux/lens/:session_id/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  console.info('CRUX GET /crux/lens/:session_id/history hit');
  try {
    const rawId = req.params.session_id;
    const session_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;

    await getSession(session_id);

    const messages = await getMessageHistory(session_id);

    res.json({
      success: true,
      data: {
        session_id,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        })),
        count: messages.length,
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ success: false, error: err.code, message: err.message });
      return;
    }
    next(err);
  }
});

// ── Watch ───────────────────────────────────────────────────────────────────
router.get('/crux/watch/credits', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sign in to view your Watch credits.')
    }
    const credits = await getOrSeedCredits(userId)
    res.json({
      success: true,
      data: {
        credits_remaining: credits.credits_remaining,
        credits_total: credits.credits_total,
        credits_used: credits.credits_total - credits.credits_remaining,
      },
    })
  } catch (err) {
    next(err)
  }
});

router.post('/crux/watch/:property_id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { property_id } = req.params
    const userId = (req as any).user?.id
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Watch requires an account. Sign in to use Watch credits.')
    }
    const result = await registerWatch(userId, property_id as string)
    res.json({
      success: true,
      data: {
        watch_id: result.watch_id,
        property_id,
        credits_remaining: result.credits_remaining,
        already_watching: result.already_watching,
        message: result.already_watching
          ? 'Already watching this property.'
          : `Watch registered. ${result.credits_remaining} credit${result.credits_remaining === 1 ? '' : 's'} remaining.`,
        monitoring_status: 'pending_activation',
        monitoring_note: 'Score-change alerts are coming soon. Your watch is registered.',
      },
    })
  } catch (err) {
    next(err)
  }
});

// ── Cast ────────────────────────────────────────────────────────────────────
router.get('/crux/cast/:property_id', (_req: Request, res: Response): void => {
  console.info('CRUX GET /crux/cast/:property_id hit');
  res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: 'CRUX Cast not yet implemented',
    route: 'GET /api/crux/cast/:property_id',
  });
});

// ── Yield ───────────────────────────────────────────────────────────────────
router.get('/crux/yield/:property_id', (_req: Request, res: Response): void => {
  console.info('CRUX GET /crux/yield/:property_id hit');
  res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: 'CRUX Yield not yet implemented',
    route: 'GET /api/crux/yield/:property_id',
  });
});

// ── Card ────────────────────────────────────────────────────────────────────
router.post('/crux/card/:property_id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const rawId = req.params.property_id;
  const property_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;
  const rawIntent = req.query.intent;
  const intent = (typeof rawIntent === 'string' ? rawIntent : undefined) || 'balanced';
  const userId = (req as any).user?.id ?? null;
  try {
    const validIntents = ['yield', 'appreciation', 'balanced'];
    if (!validIntents.includes(intent)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid intent: ${intent}`);
    }
    const card = await generateCard(property_id, intent, userId);
    res.json({
      success: true,
      data: {
        card_id: card.id,
        share_token: card.share_token,
        share_url: card.card_data.deep_link,
        expires_at: card.expires_at,
        card_data: card.card_data,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public endpoint — no auth required ever
router.get('/crux/card/share/:share_token', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.params.share_token;
    const share_token = Array.isArray(rawToken) ? (rawToken[0] ?? '') : rawToken;
    const card = await getCardByToken(share_token);
    res.json({
      success: true,
      data: {
        card_id: card.id,
        share_token: card.share_token,
        card_data: card.card_data,
        view_count: card.view_count,
        created_at: card.created_at,
        expires_at: card.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Dashboard ───────────────────────────────────────────────────────────────
router.get('/crux/dashboard', (_req: Request, res: Response): void => {
  console.info('CRUX GET /crux/dashboard hit');
  res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: 'User dashboard not yet implemented',
    route: 'GET /api/crux/dashboard',
  });
});

// ── Report ──────────────────────────────────────────────────────────────────
router.get('/crux/report/:property_id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params.property_id
    const property_id = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId
    const intent = typeof req.query.intent === 'string' ? req.query.intent : 'balanced'

    const validIntents = ['yield', 'appreciation', 'balanced']
    if (!validIntents.includes(intent)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid intent: ${intent}`)
    }

    const report = await generateReport(property_id, intent)
    res.json({ success: true, data: report })
  } catch (err) {
    next(err)
  }
})

export default router;
