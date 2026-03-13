import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

const sender = 'ComfHutt <support@comfhutt.com>';

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set. Skipping email.");
    return;
  }
  try {
    await resend.emails.send({
      from: sender,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    // Do not re-throw the error to prevent blocking the user
  }
};
