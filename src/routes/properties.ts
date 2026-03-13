import { Router, Request, Response } from "express";
import { generateProperties } from "../lib/mock-data";

const router = Router();

/**
 * GET /api/properties
 * Matches the Next.js route response shape: { data, total, page, limit, totalPages }
 * Supports ?page=, ?limit=, ?regions= query params.
 */
router.get("/", (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string || "1", 10);
  const limit = parseInt(req.query.limit as string || "15", 10);
  const regionsParam = req.query.regions as string | undefined;

  // Generate a large pool to filter from
  let properties = generateProperties(50);

  if (regionsParam) {
    const regions = regionsParam.toLowerCase().split(",");
    properties = properties.filter(p =>
      regions.some(r => p.state.toLowerCase().includes(r) || p.city.toLowerCase().includes(r))
    );
  }

  // Calculate pagination
  const total = properties.length;
  const start = (page - 1) * limit;
  const end = start + limit;

  // Apply slice
  const data = properties.slice(start, end);

  res.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export default router;
