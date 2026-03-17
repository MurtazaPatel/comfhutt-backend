import { Router, Request, Response } from "express";
import { sendEmail } from "../lib/email";
import {
  confirmSignupHtml,
  inviteUserHtml,
  magicLinkHtml,
  resetPasswordHtml,
  changeEmailHtml,
  reauthHtml,
} from "../emails/auth-templates";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    // 1. VERIFY HOOK SECRET
    const hookSecret = process.env.SUPABASE_HOOK_SECRET;
    const signature = req.headers["x-supabase-signature"] as string | undefined;

    if (hookSecret) {
      if (signature !== hookSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    } else {
      console.warn("SUPABASE_HOOK_SECRET is not set. Allowing request for local dev.");
    }

    // 2. PARSE BODY
    const { user, email_data } = req.body;
    
    if (!user?.email || !email_data) {
      return res.status(200).json({ success: true, message: "Missing required fields" });
    }

    const {
      token,
      token_hash,
      redirect_to,
      email_action_type,
      site_url
    } = email_data;

    // 3. BUILD ACTION URL
    const baseUrl = process.env.SITE_URL || site_url || "https://comfhutt.com";
    const nextUrl = encodeURIComponent(redirect_to ?? "/");
    const actionUrl = `${baseUrl}/auth/confirm?token_hash=${token_hash}&type=${email_action_type}&next=${nextUrl}`;

    // 4. SWITCH ON email_action_type
    const to = user.email;

    switch (email_action_type) {
      case "signup":
        await sendEmail(to, "Confirm your ComfHutt account", confirmSignupHtml(actionUrl));
        break;
      case "invite":
        await sendEmail(to, "You've been invited to ComfHutt", inviteUserHtml(actionUrl));
        break;
      case "magiclink":
        await sendEmail(to, "Your ComfHutt login link", magicLinkHtml(actionUrl));
        break;
      case "recovery":
        await sendEmail(to, "Reset your ComfHutt password", resetPasswordHtml(actionUrl));
        break;
      case "email_change":
        await sendEmail(to, "Confirm your new email — ComfHutt", changeEmailHtml(actionUrl));
        break;
      case "reauthentication":
        // Pass raw OTP token, not URL
        await sendEmail(to, "Confirm it's you — ComfHutt", reauthHtml(token));
        break;
      default:
        console.log(`Unknown email_action_type: ${email_action_type}`);
        break;
    }

    // 5. ALWAYS return { success: true } with status 200
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Auth email hook error:", error);
    // Never return non-200 on error to avoid endless Supabase retries
    return res.status(200).json({ success: true, message: "Internal error caught" });
  }
});

export default router;
