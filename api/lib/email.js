/**
 * Email & Messaging Module for Onboarding
 * Sends OTP emails and Welcome emails via Hostinger SMTP / nodemailer.
 */
import nodemailer from 'nodemailer';

// D1: WhatsApp template flag (disabled in this phase per decision D1)
export const WHATSAPP_OTP_TEMPLATE = false;

// In-memory capture for test verification when MOCK_ONBOARDING_MODE === 'true'
export const capturedEmails = [];

export function getCapturedEmails() {
  return capturedEmails;
}

export function clearCapturedEmails() {
  capturedEmails.length = 0;
}

export function getLastOtpFor(email) {
  const norm = (email || '').toLowerCase().trim();
  const found = capturedEmails.slice().reverse().find(m => m.to.toLowerCase().trim() === norm && m.otp);
  return found ? found.otp : null;
}

/**
 * Creates SMTP transport using environment variables
 * C10: Must fail safely if env vars are missing.
 */
function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (process.env.MOCK_ONBOARDING_MODE === 'true') {
      return null; // Mock transport will handle it
    }
    const err = new Error('Registration temporarily unavailable. Please contact connect@ctrlshifts.in.');
    err.code = 'SMTP_CONFIG_MISSING';
    err.status = 503;
    throw err;
  }

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user: user,
      pass: pass
    }
  });
}

/**
 * Sends OTP Email (10-minute expiry)
 */
export async function sendOtpEmail({ email, otp, schoolName }) {
  const isMock = process.env.MOCK_ONBOARDING_MODE === 'true';

  if (isMock) {
    capturedEmails.push({
      to: email,
      type: 'otp',
      otp: otp,
      schoolName: schoolName,
      sentAt: new Date().toISOString()
    });
    console.log(`[MOCK EMAIL] Sent OTP to ${email}: ${otp} (School: ${schoolName})`);
    return { success: true, mock: true };
  }

  const transporter = getSmtpTransport();
  const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'connect@ctrlshifts.in';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0 0 6px 0;">Paathshala ERP</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">School Management Cloud Platform</p>
      </div>
      <p style="font-size: 15px; color: #1e293b; line-height: 1.5;">Dear School Leader,</p>
      <p style="font-size: 15px; color: #1e293b; line-height: 1.5;">Thank you for registering <strong>${schoolName || 'your school'}</strong> on Paathshala ERP. Please use the following 6-digit verification code to complete your registration:</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e40af; background: #eff6ff; padding: 14px 28px; border-radius: 10px; border: 2px dashed #93c5fd;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: 10px;">This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
      </div>

      <p style="font-size: 14px; color: #475569; line-height: 1.5;">If you did not request this registration, please ignore this email.</p>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        Powered by Ctrl Shift Solutions &middot; <a href="https://ctrlshifts.in" style="color: #3b82f6; text-decoration: none;">ctrlshifts.in</a><br/>
        Need help? Reply directly to this email or reach us at connect@ctrlshifts.in
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Paathshala Onboarding" <${senderEmail}>`,
    to: email,
    subject: `Your Verification Code: ${otp} — Paathshala ERP`,
    text: `Your verification code for ${schoolName || 'your school'} is: ${otp}. It expires in 10 minutes.`,
    html: html
  });

  return { success: true };
}

/**
 * D4: Sends Welcome Email containing ERP URL, username, and first-steps guide.
 * NEVER includes password.
 */
export async function sendWelcomeEmail({ email, schoolName, subdomain, adminUsername }) {
  const isMock = process.env.MOCK_ONBOARDING_MODE === 'true';
  const erpUrl = `https://${subdomain}.ctrlshifts.in`;

  if (isMock) {
    capturedEmails.push({
      to: email,
      type: 'welcome',
      schoolName: schoolName,
      subdomain: subdomain,
      erpUrl: erpUrl,
      adminUsername: adminUsername,
      sentAt: new Date().toISOString()
    });
    console.log(`[MOCK EMAIL] Sent Welcome Email to ${email} (URL: ${erpUrl}, User: ${adminUsername})`);
    return { success: true, mock: true };
  }

  const transporter = getSmtpTransport();
  const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'connect@ctrlshifts.in';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0 0 6px 0;">Welcome to Paathshala ERP!</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Your School ERP is live and ready</p>
      </div>

      <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">Dear Admin,</p>
      <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">Congratulations! <strong>${schoolName}</strong> has been successfully onboarded with enterprise-grade features on Paathshala ERP.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 24px 0;">
        <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px;">Your ERP Access Details:</h4>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;">
          <strong>Your School ERP URL:</strong> <a href="${erpUrl}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${erpUrl}</a>
        </p>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;">
          <strong>Admin Username:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${adminUsername}</code>
        </p>
        <p style="margin: 6px 0; font-size: 13px; color: #64748b;">
          <em>(Your password is encrypted and securely stored. Use the password you created during registration.)</em>
        </p>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${erpUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">
          Go to Your School ERP &rarr;
        </a>
      </div>

      <h4 style="color: #0f172a; margin: 24px 0 10px 0; font-size: 15px;">Quick First Steps:</h4>
      <ol style="font-size: 14px; color: #334155; line-height: 1.7; padding-left: 20px; margin: 0 0 24px 0;">
        <li>Log in at <strong><a href="${erpUrl}" style="color: #2563eb;">${erpUrl}</a></strong> using your admin username (<code>${adminUsername}</code>).</li>
        <li>Open <strong>Admin &gt; School Settings</strong> to upload your school logo and adjust class names if needed.</li>
        <li>Add your teachers and staff in the <strong>Teachers</strong> section.</li>
        <li>Enroll your students in <strong>Students</strong> to start marking attendance and issuing fee receipts immediately.</li>
      </ol>

      <p style="font-size: 14px; color: #475569; line-height: 1.6;">Our dedicated support team is here to assist you anytime. Simply reply to this email or reach us on WhatsApp at +91 91555 15505.</p>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        Paathshala School ERP &middot; Powered by Ctrl Shift Solutions &middot; <a href="https://ctrlshifts.in" style="color: #3b82f6; text-decoration: none;">ctrlshifts.in</a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Paathshala Onboarding" <${senderEmail}>`,
    to: email,
    subject: `Welcome to Paathshala ERP — Your School is Live! (${schoolName})`,
    text: `Welcome to Paathshala ERP!\n\nYour school ${schoolName} is ready.\nERP URL: ${erpUrl}\nAdmin Username: ${adminUsername}\nLog in with the password you set during registration.`,
    html: html
  });

  return { success: true };
}
