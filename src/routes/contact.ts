import { Router, Request, Response } from "express";
import { ContactFormSchema } from "../validations/contact";
import { sendEmail } from "../lib/email";
import { upsertLead, logLeadEvent } from "../services/leads";
import { createContactMessage } from "../services/contact";

const router = Router();

/**
 * POST /api/contact
 * Matches the Next.js route: always returns 200 with a friendly message,
 * even on internal errors, so the user is never shown a failure.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const result = ContactFormSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid input",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const { name, email, message } = result.data;

    let leadId;
    try {
      leadId = await upsertLead(email, name, "CONTACT");
    } catch (error) {
      console.error("Error upserting lead:", error);
      // Fail gracefully
      res.status(200).json({
        message: "Thanks for reaching out. We'll get back to you shortly.",
      });
      return;
    }

    try {
      await createContactMessage(
        leadId,
        "New message from ComfHutt website",
        message
      );
    } catch (error) {
      console.error("Error creating contact message:", error);
      // Fail gracefully
      res.status(200).json({
        message: "Thanks for reaching out. We'll get back to you shortly.",
      });
      return;
    }

    // Log the lead event
    try {
      await logLeadEvent(leadId, "CONTACT_FORM_SUBMISSION", "CONTACT");
    } catch (eventError) {
      console.error("Error logging lead event:", eventError);
      // Non-critical error
    }

    // Send Internal Notification Email
    const internalEmailHtml = `
      <h1>New message from ComfHutt website</h1>
      <p>A new message was submitted via the ComfHutt website.</p>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `;
    await sendEmail(
      "internal@comfhutt.com",
      "New message from ComfHutt website",
      internalEmailHtml
    );

    // Send User Confirmation Email
    const userEmailHtml = `
      <p>Hi ${name || "there"},</p>
      <p>Thanks for getting in touch with ComfHutt.</p>
      <p>We've received your message and someone from our team will review it shortly. Whether you're exploring fractional real estate investing or have a specific question in mind, we're glad you reached out.</p>
      <p>As we continue building ComfHutt, our focus is on making real estate investing more transparent, accessible, and investor-first.</p>
      <p>We'll get back to you soon.</p>
      <p>— Team ComfHutt</p>
    `;
    await sendEmail(
      email,
      "Thanks for reaching out to ComfHutt",
      userEmailHtml
    );

    res.status(200).json({
      message: "Thanks for reaching out. We'll get back to you shortly.",
    });
  } catch (error) {
    console.error("Contact API Error:", error);
    // Always return a success response to the user
    res.status(200).json({
      message: "Thanks for reaching out. We'll get back to you shortly.",
    });
  }
});

export default router;
