import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

const rawPort = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
const smtpPort = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 587;
if (env.SMTP_HOST && env.SMTP_USER) {
  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: smtpPort === 587 ? 2525 : smtpPort, // Fallback to 2525 if 587 is blocked by local ISPs
      secure: smtpPort === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  } catch (error) {
    console.error("Failed to initialize Nodemailer transporter:", error.message);
  }
}

/**
 * Dispatch an email using Brevo REST API, Resend REST API, SMTP, or local dev fallback
 */
const sendMail = async ({ to, subject, html, text }) => {
  const recipient = Array.isArray(to) ? to[0] : to;

  // 1. Try Brevo REST API if Brevo key is configured
  const brevoApiKey = env.BREVO_API_KEY || (env.SMTP_PASS && env.SMTP_PASS.startsWith("xkeysib-") ? env.SMTP_PASS : null);
  if (brevoApiKey) {
    try {
      let senderEmail = "gloxad07@gmail.com";
      let senderName = "GLOXAD";
      if (env.SMTP_FROM) {
        const match = env.SMTP_FROM.match(/<([^>]+)>/);
        if (match) {
          senderEmail = match[1];
          senderName = env.SMTP_FROM.split("<")[0].trim().replace(/['"]/g, "") || "GLOXAD";
        } else if (env.SMTP_FROM.includes("@")) {
          senderEmail = env.SMTP_FROM.trim();
        }
      }

      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: recipient }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });

      const data = await res.json();
      if (res.ok && data.messageId) {
        console.log(`[BREVO EMAIL SENT] ID: ${data.messageId} | To: ${recipient}`);
        return { success: true, provider: "brevo", id: data.messageId };
      } else {
        console.warn(`[BREVO API NOTICE] ${data.message || JSON.stringify(data)}`);
      }
    } catch (err) {
      console.warn(`[BREVO API ERROR] ${err.message}`);
    }
  }

  // 2. Try Resend HTTP API if RESEND_APIKEY is set
  if (env.RESEND_APIKEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_APIKEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.SMTP_FROM || "Gloxad Academy <onboarding@resend.dev>",
          to: [recipient],
          subject,
          html,
          text,
        }),
      });

      const data = await res.json();
      if (res.ok && data.id) {
        console.log(`[RESEND EMAIL SENT] ID: ${data.id} | To: ${recipient}`);
        return { success: true, provider: "resend", id: data.id };
      } else {
        console.warn(`[RESEND NOTICE] ${data.message || JSON.stringify(data)}`);
      }
    } catch (err) {
      console.warn(`[RESEND ERROR] ${err.message}`);
    }
  }

  // 3. Try SMTP Relay if configured
  if (transporter) {
    try {
      await transporter.sendMail({
        from: env.SMTP_FROM || "Gloxad Academy <no-reply@gloxad.com>",
        to: recipient,
        subject,
        text,
        html,
      });
      console.log(`[SMTP EMAIL SENT] To: ${recipient} | Subject: ${subject}`);
      return { success: true, provider: "smtp" };
    } catch (err) {
      console.warn(`[SMTP DISPATCH NOTICE] ${err.message}`);
    }
  }

  // 4. Guaranteed local dev fallback
  const logLine = `[DEV EMAIL DISPATCH] To: ${recipient} | Subject: ${subject}`;
  console.log(logLine);
  console.log(`[DEV EMAIL DISPATCH]\nTo: ${recipient}\nSubject: ${subject}\nBody:\n${text}`);
  try {
    const fs = await import("fs");
    fs.appendFileSync(".dev-emails.log", `${logLine}\n${text}\n---\n`);
  } catch (e) {}

  return { success: true, devMode: true };
};

export const sendEmailVerificationOtp = async (email, otp) => {
  const subject = "Gloxad Academy - Email Verification OTP";
  const text = `Your Gloxad Academy email verification code is: ${otp}. It will expire in 15 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Gloxad Academy</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello,</p>
      <p style="font-size: 15px; color: #1E293B;">Your email verification code is:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #4F46E5; padding: 12px 0; text-align: center; background: #F8FAFC; border-radius: 6px; margin: 16px 0;">
        ${otp}
      </div>
      <p style="font-size: 13px; color: #64748B;">This code will expire in 15 minutes. If you did not create an account, please disregard this email.</p>
    </div>
  `;

  return await sendMail({ to: email, subject, text, html });
};

export const sendPasswordResetOtp = async (email, otp) => {
  const subject = "Gloxad Academy - Password Reset OTP";
  const text = `Your Gloxad Academy password reset code is: ${otp}. It will expire in 15 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Gloxad Academy</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello,</p>
      <p style="font-size: 15px; color: #1E293B;">You requested a password reset. Your recovery code is:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #4F46E5; padding: 12px 0; text-align: center; background: #F8FAFC; border-radius: 6px; margin: 16px 0;">
        ${otp}
      </div>
      <p style="font-size: 13px; color: #64748B;">This code will expire in 15 minutes. If you did not request this change, your account remains secure.</p>
    </div>
  `;

  return await sendMail({ to: email, subject, text, html });
};

export const sendWelcomeEmail = async (email, name) => {
  const subject = "Welcome to Gloxad Academy! 🎓";
  const text = `Hello ${name || "there"},\n\nWelcome to Gloxad Academy! Your email has been verified and your account is active.\n\nHappy learning!`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Welcome to Gloxad Academy! 🎓</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "there"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Your email has been verified and your account is ready to go.</p>
      <p style="font-size: 14px; color: #64748B;">You can now explore our course catalog, enroll in interactive classes, and start learning.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;

  return await sendMail({ to: email, subject, text, html });
};

export const sendPartnerApplicationConfirmationEmail = async ({ to, name, referenceId, trackingUrl }) => {
  const subject = `Gloxad Academy - Partnership Application Received (${referenceId})`;
  const text = `Hello ${name || "Representative"},\n\nThank you for applying to partner with Gloxad Academy! We have received your application with Reference ID: ${referenceId}.\n\nOur team is reviewing your application and will respond within 48 hours.\nTrack your application status here: ${trackingUrl || "https://gloxadacademy.com/partners/status"}\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Gloxad Academy Partnership</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Representative"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Thank you for your interest in partnering with Gloxad Academy. We have successfully received your institutional application.</p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
        <span style="font-size: 13px; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">Application Reference ID</span>
        <div style="font-size: 26px; font-weight: 700; color: #4F46E5; margin-top: 6px; letter-spacing: 2px;">
          ${referenceId}
        </div>
      </div>
      <p style="font-size: 14px; color: #475569;">Our admissions and partner committee typically reviews applications within <strong>48 hours</strong>.</p>
      ${trackingUrl ? `<div style="text-align: center; margin: 24px 0;"><a href="${trackingUrl}" style="background: #4F46E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Track Application Status</a></div>` : ''}
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendPartnerActivationEmail = async ({ to, name, institutionName, activationUrl, expiresAt }) => {
  const subject = `Welcome to Gloxad Academy! Activate ${institutionName || "Your Institution Workspace"}`;
  const expiryDateStr = expiresAt ? new Date(expiresAt).toLocaleDateString() : "7 days";
  const text = `Hello ${name || "Representative"},\n\nCongratulations! Your partnership application for ${institutionName} has been approved.\n\nPlease activate your institutional workspace using the link below (valid for 7 days until ${expiryDateStr}):\n${activationUrl}\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Application Approved! 🎉</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Representative"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Congratulations! Your institutional partnership application for <strong>${institutionName}</strong> has been officially approved.</p>
      <p style="font-size: 14px; color: #475569;">To finalize your setup, set your administrative password, and launch your campus portal, click the button below:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${activationUrl}" style="background: #16A34A; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
          Activate Institutional Workspace
        </a>
      </div>
      <p style="font-size: 13px; color: #64748B;">This secure single-use activation link expires in <strong>7 days</strong> (${expiryDateStr}).</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendPartnerRejectionEmail = async ({ to, name, institutionName, reason }) => {
  const subject = `Gloxad Academy - Partnership Application Update (${institutionName})`;
  const text = `Hello ${name || "Representative"},\n\nThank you for your interest in partnering with Gloxad Academy for ${institutionName}.\n\nAfter thorough review, we regret to inform you that we are unable to approve your application at this time.\n\nReason: ${reason || "Requirements criteria not met"}\n\nYou are welcome to re-apply in the future once prerequisites are fulfilled.\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #475569; margin-top: 0;">Partnership Application Update</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Representative"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Thank you for your interest in Gloxad Academy and for taking the time to apply on behalf of <strong>${institutionName}</strong>.</p>
      <p style="font-size: 14px; color: #475569;">After careful evaluation by our admissions team, we regret to inform you that we are unable to advance your application at this stage.</p>
      ${reason ? `<div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #991B1B;"><strong>Feedback:</strong> ${reason}</div>` : ''}
      <p style="font-size: 13px; color: #64748B;">You may re-apply in the future if your institution's profile or requirements change.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendPartnerRequestInfoEmail = async ({ to, name, institutionName, message }) => {
  const subject = `Action Required: Additional Information for Gloxad Academy Partnership (${institutionName})`;
  const text = `Hello ${name || "Representative"},\n\nOur review team is currently evaluating the partnership application for ${institutionName} and requires additional information:\n\n${message}\n\nPlease reply directly to this email with the requested details.\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Additional Information Requested</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Representative"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Our reviewer team is currently assessing your partnership application for <strong>${institutionName}</strong>.</p>
      <p style="font-size: 14px; color: #475569;">To complete our review, please provide the following details:</p>
      <div style="background: #F0FDF4; border-left: 4px solid #16A34A; padding: 14px 18px; margin: 18px 0; font-size: 14px; color: #166534;">
        ${message}
      </div>
      <p style="font-size: 13px; color: #64748B;">You can reply directly to this email with the requested details or supporting documents.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendInstitutionMemberInviteEmail = async ({
  to,
  name,
  institutionName,
  role = "student",
  inviteUrl,
}) => {
  const roleLabel = role === "tutor" ? "Faculty Tutor" : "Student";
  const subject = `Invitation to join ${institutionName || "Institution Workspace"} on Gloxad Academy`;
  const text = `Hello ${name || "Member"},\n\nYou have been invited to join ${institutionName} as a ${roleLabel} on Gloxad Academy.\n\nAccept your invite here: ${inviteUrl}\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">Workspace Invitation 🎓</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Member"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">You have been invited to join the <strong>${institutionName || "Institution Workspace"}</strong> on Gloxad Academy as a <strong>${roleLabel}</strong>.</p>
      <p style="font-size: 14px; color: #475569;">Click the button below to accept your invitation and activate your account:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" style="background: #4F46E5; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="font-size: 13px; color: #64748B;">If you did not expect this invitation, you can safely ignore this email.</p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendSubscriptionReceiptEmail = async ({
  to,
  name,
  institutionName,
  plan,
  billing,
  amount,
  currency = "USD",
  reference,
  receiptUrl,
}) => {
  const subject = `Payment Receipt: ${institutionName} Subscription (${plan} Plan)`;
  const text = `Hello ${name || "Administrator"},\n\nThank you for your payment! Your subscription to Gloxad Academy (${plan} Plan - ${billing}) has been processed successfully.\n\nAmount: ${currency} ${amount}\nReference: ${reference}\n\nBest regards,\nThe Gloxad Academy Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #16A34A; margin-top: 0;">Payment Confirmed! 💳</h2>
      <p style="font-size: 15px; color: #1E293B;">Hello <strong>${name || "Administrator"}</strong>,</p>
      <p style="font-size: 15px; color: #1E293B;">Your payment for <strong>${institutionName}</strong> has been successfully processed.</p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Plan:</strong> ${plan} (${billing})</p>
        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Amount Paid:</strong> ${currency} ${amount}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Transaction Ref:</strong> ${reference}</p>
      </div>
      ${receiptUrl ? `<div style="text-align: center; margin: 24px 0;"><a href="${receiptUrl}" style="background: #4F46E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Download Official Receipt</a></div>` : ''}
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        The Gloxad Academy Team
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export const sendNotificationEmail = async ({ to, name, title, message, url }) => {
  const subject = title;
  const text = `Hello ${name || "there"},\n\n${message}${url ? `\n\nOpen it: ${url}` : ""}\n\nYou can turn these emails off on your notifications page.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px;">
      <p style="font-size: 13px; color: #64748B; margin: 0 0 12px;">Gloxad Academy</p>
      <h2 style="color: #12142B; margin: 0 0 12px; font-size: 20px;">${title}</h2>
      <p style="font-size: 15px; color: #1E293B; line-height: 1.6;">${message}</p>
      ${url ? `<p style="margin: 24px 0;"><a href="${url}" style="background:#12142B;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-size:14px;">Open on Gloxad</a></p>` : ""}
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
        You get this email because email alerts are on. You can turn them off on your notifications page.
      </div>
    </div>
  `;
  return await sendMail({ to, subject, text, html });
};

export default {
  sendNotificationEmail,
  sendEmailVerificationOtp,
  sendPasswordResetOtp,
  sendWelcomeEmail,
  sendPartnerApplicationConfirmationEmail,
  sendPartnerActivationEmail,
  sendPartnerRejectionEmail,
  sendPartnerRequestInfoEmail,
  sendInstitutionMemberInviteEmail,
  sendSubscriptionReceiptEmail,
};
