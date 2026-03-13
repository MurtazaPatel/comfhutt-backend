import { Router, Request, Response } from "express";
import { z } from "zod";
import { registerSchema, loginSchema } from "../validations/auth";
import { register, login, loginWithGoogle, refreshSession, logout } from "../services/auth";
import { requireInternalSecret } from "../middleware/internalSecret";
import { requireAuth } from "../middleware/requireAuth";
import { supabaseAuth } from "../lib/db";
import { env } from "../config/env";

const router = Router();

/**
 * POST /api/auth/register
 */
router.post("/register", requireInternalSecret, async (req: Request, res: Response) => {
  try {
    const bodySchema = registerSchema.extend({
      name: z.string().optional(),
    });

    const validation = bodySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: "Invalid fields",
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password, name } = validation.data;

    const user = await register(email, password, name);

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error: any) {
    if (error.message === "Email already in use") {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    console.error("Register API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/login
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: "Invalid fields",
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = validation.data;

    const { user, session } = await login(email, password);

    res.json({
      success: true,
      user,
      session,
    });
  } catch (error: any) {
    if (error.message === "Invalid credentials") {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    console.error("Login API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = authHeader.split(" ")[1];
    
    await logout(token);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Logout API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/refresh
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: "Missing refresh_token" });
      return;
    }

    const { session } = await refreshSession(refresh_token);
    res.json({ session });
  } catch (error) {
    console.error("Refresh API Error:", error);
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

/**
 * GET /api/auth/me
 */
router.get("/me", requireAuth, (req: Request, res: Response) => {
  res.json((req as any).user);
});

/**
 * GET /api/auth/google
 */
router.get("/google", async (_req: Request, res: Response) => {
  try {
    const { url } = await loginWithGoogle();
    res.json({ url });
  } catch (error) {
    console.error("Google login API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/auth/callback
 */
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== "string") {
      res.redirect(`${env.FRONTEND_URL}/login?error=Invalid_code`);
      return;
    }

    const { data, error } = await supabaseAuth.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("Callback Exchange Error:", error);
      res.redirect(`${env.FRONTEND_URL}/login?error=Exchange_failed`);
      return;
    }

    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set("access_token", data.session.access_token);
    redirectUrl.searchParams.set("refresh_token", data.session.refresh_token);
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Callback API Error:", error);
    res.redirect(`${env.FRONTEND_URL}/login?error=Internal_error`);
  }
});

export default router;
