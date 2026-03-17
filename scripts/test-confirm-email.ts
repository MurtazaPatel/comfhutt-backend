import { sendEmail } from "../src/lib/email";
import { confirmSignupHtml } from "../src/emails/auth-templates";

async function testEmail() {
  const to = "murtaza@comfhutt.com";
  const subject = "TEST — Confirm your ComfHutt account";
  const actionUrl = "https://comfhutt.com/auth/confirm?token_hash=test123&type=signup&next=/";
  
  const html = confirmSignupHtml(actionUrl);

  console.log("Attempting to send email to " + to + "...");
  
  try {
    await sendEmail(to, subject, html);
    console.log("sendEmail function completed.");
    // email.ts catches errors internally and logs them, but if Resend is successful it won't throw.
  } catch (error) {
    console.error("Caught error in test script:", error);
  }
}

testEmail();
