'use strict';

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/**
 * Email & Messaging Module for Onboarding (CommonJS)
 * Sends OTP emails and Welcome emails via Hostinger SMTP / nodemailer.
 */
const nodemailer = require('nodemailer');

// D1: WhatsApp template flag (disabled in this phase per decision D1)
const WHATSAPP_OTP_TEMPLATE = false;

// F5: Production guard — mock mode is completely inert in production
function isProductionEnv() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function isMockMode() {
  if (isProductionEnv()) return false;
  return process.env.MOCK_ONBOARDING_MODE === 'true';
}

// In-memory capture for test verification when MOCK_ONBOARDING_MODE === 'true'
const capturedEmails = [];

function getCapturedEmails() {
  if (isProductionEnv()) return [];
  return capturedEmails;
}

function clearCapturedEmails() {
  capturedEmails.length = 0;
}

function getLastOtpFor(email) {
  if (isProductionEnv()) return null;
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
    if (isMockMode()) {
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
async function sendOtpEmail({ email, otp, schoolName }) {
  if (isMockMode()) {
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
      <p style="font-size: 15px; color: #1e293b; line-height: 1.5;">Thank you for registering <strong>${escapeHTML(schoolName || 'your school')}</strong> on Paathshala ERP. Please use the following 6-digit verification code to complete your registration:</p>
      
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
async function sendWelcomeEmail({ email, schoolName, subdomain, adminUsername }) {
  const erpUrl = `https://${subdomain}.ctrlshifts.in`;

  if (isMockMode()) {
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
      <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">Congratulations! <strong>${escapeHTML(schoolName)}</strong> has been successfully onboarded with enterprise-grade features on Paathshala ERP.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 24px 0;">
        <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px;">Your ERP Access Details:</h4>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;">
          <strong>Your School ERP URL:</strong> <a href="${escapeHTML(erpUrl)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${escapeHTML(erpUrl)}</a>
        </p>
        <p style="margin: 6px 0; font-size: 14px; color: #334155;">
          <strong>Admin Username:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${escapeHTML(adminUsername)}</code>
        </p>
        <p style="margin: 6px 0; font-size: 13px; color: #64748b;">
          <em>(Your password is encrypted and securely stored. Use the password you created during registration.)</em>
        </p>
      </div>

      <div style="margin: 24px 0;">
        <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px;">Next Steps:</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569; line-height: 1.7;">
          <li>Log in to your dashboard at <a href="${escapeHTML(erpUrl)}" style="color: #2563eb;">${escapeHTML(erpUrl)}</a> using your admin username and password.</li>
          <li>Set up your class fees and fee structures in the <strong>Fee Ledger</strong>.</li>
          <li>Add your teachers and students (bulk Excel upload available).</li>
          <li>Send automatic WhatsApp fee receipts and marksheet cards.</li>
        </ol>
      </div>

      <div style="text-align: center; margin: 32px 0 16px;">
        <a href="${escapeHTML(erpUrl)}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
          Open School ERP Dashboard &rarr;
        </a>
      </div>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
        Need technical assistance? We are here to help.<br/>
        Email: <a href="mailto:connect@ctrlshifts.in" style="color: #3b82f6; text-decoration: none;">connect@ctrlshifts.in</a> &middot; WhatsApp: +91 91555 15505<br/>
        &copy; 2026 Ctrl Shift Solutions. All rights reserved.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Paathshala Team" <${senderEmail}>`,
    to: email,
    subject: `Your School ERP is Ready: ${schoolName} — Paathshala`,
    text: `Your school ${schoolName} ERP is live at ${erpUrl}. Admin username: ${adminUsername}.`,
    html: html
  });

  return { success: true };
}

module.exports = {
  WHATSAPP_OTP_TEMPLATE,
  getCapturedEmails,
  clearCapturedEmails,
  getLastOtpFor,
  sendOtpEmail,
  sendWelcomeEmail
};
