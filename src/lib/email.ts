import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import prisma from './prisma';

export function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Reads an environment variable either from disk (.env) directly
 * or from process.env, ensuring immediate sync without requiring dev server restart.
 */
export function getEnv(key: string): string {
  try {
    const envFile = path.join(process.cwd(), '.env');
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          if (k === key) {
            return cleanEnv(trimmed.slice(eqIdx + 1));
          }
        }
      }
    }
  } catch {}
  return cleanEnv(process.env[key]);
}

export function isMockMode(): boolean {
  return getEnv('MOCK_EMAIL') === 'true';
}

/**
 * Logs whether MOCK_EMAIL resolved to true or false,
 * and whether GMAIL_USER and GMAIL_APP_PASSWORD are set (yes or no only, never the values).
 */
export function logEmailConfig(): void {
  const isMock = isMockMode();
  const userSet = !!getEnv('GMAIL_USER');
  const passSet = !!getEnv('GMAIL_APP_PASSWORD');
  console.log(`[Email Config] MOCK_EMAIL resolved to: ${isMock}`);
  console.log(`[Email Config] GMAIL_USER set: ${userSet ? 'yes' : 'no'} | GMAIL_APP_PASSWORD set: ${passSet ? 'yes' : 'no'}`);
}

/**
 * Creates a Nodemailer transporter configured with Gmail SMTP.
 * Host: smtp.gmail.com, Port: 465, Secure: true
 */
export function getTransporter() {
  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Calls transporter.verify() before sending and reports the result.
 */
export async function verifyTransporter(transporter: nodemailer.Transporter): Promise<{ valid: boolean; error?: string }> {
  console.log('[Email Transport] Calling transporter.verify()...');
  try {
    await transporter.verify();
    console.log('[Email Transport] transporter.verify() succeeded (SMTP connection & auth OK).');
    return { valid: true };
  } catch (verifyErr: any) {
    console.error('[Email Transport Verify Failed] Full error:', verifyErr);
    const verifyErrMsg = verifyErr?.message || String(verifyErr);
    return { valid: false, error: verifyErrMsg };
  }
}

export interface CongratulationsEmailParams {
  internId?: string;
  to: string;
  name: string;
  domain: string;
  taskTitle: string;
  taskSummary: string;
  orientationDate: Date;
  meetingLink: string;
  otp: string;
  forceRealSend?: boolean;
}

export interface ReviewInviteEmailParams {
  internId?: string;
  to: string;
  name: string;
  domain: string;
  reviewNumber: number;
  reviewDate: Date;
  meetingLink: string;
  otp: string;
}

export interface ReviewFeedbackEmailParams {
  internId?: string;
  to: string;
  name: string;
  domain: string;
  reviewNumber: number;
  score: number;
  emailFeedback: string;
  nextReviewDate: Date;
  nextMeetingLink: string;
  nextOtp: string;
}

export interface CertificateEmailParams {
  internId?: string;
  to: string;
  name: string;
  domain: string;
  finalScore: number;
  pdfBuffer: Buffer;
  pdfFileName: string;
  certificateUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  mocked: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Test route helper that sends a plain test email to GMAIL_USER
 * and returns status 'sent' or the exact error message from Nodemailer.
 */
export async function sendTestEmail(): Promise<SendEmailResult> {
  logEmailConfig();

  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    const error = 'Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env. Note: If you just updated .env, restart the dev server to load the new values.';
    console.error('[Email Test Failed]', error);
    return {
      success: false,
      mocked: false,
      error,
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const error = 'Could not initialize Gmail SMTP transporter (host: smtp.gmail.com, port: 465, secure: true).';
    console.error('[Email Test Failed]', error);
    return {
      success: false,
      mocked: false,
      error,
    };
  }

  // Call transporter.verify() before sending and report result
  const verifyResult = await verifyTransporter(transporter);
  if (!verifyResult.valid) {
    const errorMsg = verifyResult.error || 'Nodemailer transporter.verify() failed';
    await prisma.emailLog.create({
      data: {
        to: user,
        subject: 'InternFlow SMTP Test Email',
        body: 'Plain test email',
        emailType: 'TEST_EMAIL',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return {
      success: false,
      mocked: false,
      error: errorMsg,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"InternFlow Test" <${user}>`,
      to: user,
      subject: 'InternFlow SMTP Test Email',
      text: 'This is a plain test email from InternFlow verifying that Gmail SMTP (smtp.gmail.com:465) is working properly.',
    });

    console.log('[Email Test Succeeded] Message sent with ID:', info.messageId);

    await prisma.emailLog.create({
      data: {
        to: user,
        subject: 'InternFlow SMTP Test Email',
        body: 'Plain test email',
        emailType: 'TEST_EMAIL',
        status: 'SENT',
      },
    });

    return { success: true, mocked: false, messageId: info.messageId };
  } catch (error: any) {
    console.error('[Email Send Error] Full error sending test email:', error);
    const errorMsg = error?.message || String(error);
    await prisma.emailLog.create({
      data: {
        to: user,
        subject: 'InternFlow SMTP Test Email',
        body: 'Plain test email',
        emailType: 'TEST_EMAIL',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }
}

/**
 * Sends the Congratulations & Orientation Invite email to an intern.
 */
export async function sendCongratulationsEmail(
  params: CongratulationsEmailParams
): Promise<SendEmailResult> {
  logEmailConfig();

  const isMock = isMockMode() && !params.forceRealSend;
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(params.orientationDate);

  const subject = `🎉 Congratulations! Selected as ${params.domain} Intern at InternFlow`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
    <tr>
      <td style="padding: 32px 32px 24px 32px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">InternFlow AI</h1>
        <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 14px; font-weight: 500;">Automated Internship & Mentorship Program</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 12px 0; color: #f1f5f9; font-size: 20px;">Welcome to the Team, ${params.name}! 👋</h2>
        <p style="margin: 0 0 20px 0; color: #94a3b8; font-size: 15px; line-height: 1.6;">
          We are thrilled to inform you that you have been selected for the <strong style="color: #60a5fa;">${params.domain}</strong> internship track!
        </p>

        <div style="background-color: #0f172a; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #334155;">
          <div style="display: inline-block; background-color: #312e81; color: #a5b4fc; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 8px;">
            ${params.domain} Project
          </div>
          <h3 style="margin: 6px 0 8px 0; color: #e2e8f0; font-size: 16px;">${params.taskTitle}</h3>
          <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5;">${params.taskSummary}</p>
        </div>

        <div style="background: linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%); border-radius: 12px; padding: 24px; margin-bottom: 28px; border: 1px solid #4338ca; text-align: center;">
          <p style="margin: 0 0 6px 0; color: #c7d2fe; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Scheduled Orientation Meeting</p>
          <p style="margin: 0 0 16px 0; color: #ffffff; font-size: 17px; font-weight: 700;">${formattedDate}</p>

          <div style="display: inline-block; background-color: #1e293b; border: 1px dashed #6366f1; border-radius: 8px; padding: 8px 16px; margin-bottom: 20px;">
            <span style="color: #94a3b8; font-size: 12px; display: block;">Verification 6-Digit OTP</span>
            <span style="color: #38bdf8; font-size: 20px; font-weight: 800; letter-spacing: 4px;">${params.otp}</span>
          </div>

          <div>
            <a href="${params.meetingLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
              Join Meeting Room &rarr;
            </a>
          </div>
          <p style="margin: 12px 0 0 0; color: #64748b; font-size: 12px;">Link: <a href="${params.meetingLink}" style="color: #818cf8; word-break: break-all;">${params.meetingLink}</a></p>
        </div>

        <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">
          Your AI Mentor will meet you directly in the web app to explain the roadmap, introduce your assignments, and answer any questions you have.
        </p>
        <p style="margin: 0; color: #64748b; font-size: 13px;">
          Best regards,<br>
          <strong style="color: #cbd5e1;">The InternFlow Automated Mentorship Team</strong>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (isMock) {
    console.log('\n======================================================');
    console.log('📧 [MOCK EMAIL DISPATCHED] Congratulations & Orientation');
    console.log(`To: ${params.to} (${params.name})`);
    console.log(`Subject: ${subject}`);
    console.log(`Meeting Link: ${params.meetingLink}`);
    console.log(`6-Digit OTP: ${params.otp}`);
    console.log('======================================================\n');

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'MOCKED',
      },
    });

    return { success: true, mocked: true, messageId: `mock-${Date.now()}` };
  }

  // Real Email Sending via Gmail SMTP (port 465)
  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    const errorMsg = 'Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env. Note: If you just updated .env, restart the dev server to load the new values.';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMsg = 'Could not initialize Gmail SMTP transporter (host: smtp.gmail.com, port: 465, secure: true).';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  // Call transporter.verify() before sending and report result
  const verifyResult = await verifyTransporter(transporter);
  if (!verifyResult.valid) {
    const errorMsg = verifyResult.error || 'Nodemailer transporter.verify() failed';
    console.error(`[Email Error] transporter.verify() failed for ${params.to}:`, errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  try {
    const info = await transporter.sendMail({
      from: `"InternFlow Automation" <${user}>`,
      to: params.to,
      subject,
      html: htmlBody,
    });

    console.log(`[Email Succeeded] Congratulations email sent to ${params.to}. MessageId: ${info.messageId}`);

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'SENT',
      },
    });

    return { success: true, mocked: false, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email Send Error] Full error sending to ${params.to}:`, error);
    const errorMsg = error?.message || String(error);

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CONGRATULATIONS',
        status: 'FAILED',
        error: errorMsg,
      },
    });

    return { success: false, mocked: false, error: errorMsg };
  }
}

/**
 * Sends the Review Meeting Invite email to an intern after orientation completion.
 */
export async function sendReviewInviteEmail(
  params: ReviewInviteEmailParams
): Promise<SendEmailResult> {
  const isMock = isMockMode();
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(params.reviewDate);

  const subject = `📅 InternFlow Review #${params.reviewNumber} Scheduled for ${params.name}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px 32px 24px 32px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800;">Review #${params.reviewNumber} Scheduled</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 12px 0; color: #f1f5f9; font-size: 20px;">Hi ${params.name}!</h2>
        <p style="margin: 0 0 20px 0; color: #94a3b8; font-size: 15px; line-height: 1.6;">
          Your upcoming progress review for the <strong style="color: #34d399;">${params.domain}</strong> track is confirmed.
        </p>

        <div style="background: linear-gradient(180deg, #064e3b 0%, #0f172a 100%); border-radius: 12px; padding: 24px; margin-bottom: 28px; border: 1px solid #059669; text-align: center;">
          <p style="margin: 0 0 6px 0; color: #a7f3d0; font-size: 13px; font-weight: 600; text-transform: uppercase;">Review Meeting Date & Time</p>
          <p style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px; font-weight: 700;">${formattedDate}</p>

          <div style="display: inline-block; background-color: #1e293b; border: 1px dashed #10b981; border-radius: 8px; padding: 8px 16px; margin-bottom: 20px;">
            <span style="color: #94a3b8; font-size: 12px; display: block;">Verification 6-Digit OTP</span>
            <span style="color: #34d399; font-size: 20px; font-weight: 800; letter-spacing: 4px;">${params.otp}</span>
          </div>

          <div>
            <a href="${params.meetingLink}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 10px;">
              Enter Review Room &rarr;
            </a>
          </div>
          <p style="margin: 12px 0 0 0; color: #64748b; font-size: 12px;">Link: <a href="${params.meetingLink}" style="color: #6ee7b7;">${params.meetingLink}</a></p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (isMock) {
    console.log('\n======================================================');
    console.log(`📧 [MOCK EMAIL DISPATCHED] Review #${params.reviewNumber} Schedule`);
    console.log(`To: ${params.to} (${params.name})`);
    console.log(`Review Time: ${formattedDate}`);
    console.log(`Review Link: ${params.meetingLink}`);
    console.log(`6-Digit OTP: ${params.otp}`);
    console.log('======================================================\n');

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'MOCKED',
      },
    });

    return { success: true, mocked: true, messageId: `mock-review-${Date.now()}` };
  }

  logEmailConfig();

  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    const errorMsg = 'Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env. Note: If you just updated .env, restart the dev server to load the new values.';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMsg = 'Could not initialize Gmail SMTP transporter (host: smtp.gmail.com, port: 465, secure: true).';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const verifyResult = await verifyTransporter(transporter);
  if (!verifyResult.valid) {
    const errorMsg = verifyResult.error || 'Nodemailer transporter.verify() failed';
    console.error(`[Email Error] transporter.verify() failed for ${params.to}:`, errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  try {
    const info = await transporter.sendMail({
      from: `"InternFlow Automation" <${user}>`,
      to: params.to,
      subject,
      html: htmlBody,
    });

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'SENT',
      },
    });

    return { success: true, mocked: false, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email Send Error] Full error sending to ${params.to}:`, error);
    const errorMsg = error?.message || String(error);

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_INVITE',
        status: 'FAILED',
        error: errorMsg,
      },
    });

    return { success: false, mocked: false, error: errorMsg };
  }
}

/**
 * Sends intermediate Review Feedback email with score, feedback, and next review schedule.
 */
export async function sendReviewFeedbackEmail(
  params: ReviewFeedbackEmailParams
): Promise<SendEmailResult> {
  const isMock = isMockMode();
  const formattedNextDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(params.nextReviewDate);

  const subject = `📊 Review #${params.reviewNumber} Evaluation: ${Math.round(params.score)}/100 for ${params.name}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 28px; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800;">Review #${params.reviewNumber} Feedback</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px;">
        <h2 style="margin: 0 0 10px 0; color: #f1f5f9; font-size: 18px;">Hi ${params.name}, here are your results!</h2>
        
        <div style="background-color: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #334155; text-align: center;">
          <span style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Milestone Score</span>
          <span style="color: #38bdf8; font-size: 36px; font-weight: 900; display: block;">${Math.round(params.score)}/100</span>
        </div>

        <div style="background-color: #1e1b4b; border-left: 4px solid #6366f1; padding: 16px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 6px 0; color: #e0e7ff; font-size: 14px;">Mentor Feedback:</h3>
          <p style="margin: 0; color: #cbd5e1; font-size: 13px; line-height: 1.6;">${params.emailFeedback}</p>
        </div>

        <div style="background-color: #0f172a; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #4338ca;">
          <p style="margin: 0 0 6px 0; color: #c7d2fe; font-size: 12px; font-weight: 600;">Next Review Scheduled</p>
          <p style="margin: 0 0 12px 0; color: #ffffff; font-size: 16px; font-weight: 700;">${formattedNextDate}</p>
          <p style="color: #38bdf8; font-weight: 800; font-size: 18px;">OTP: ${params.nextOtp}</p>
          <a href="${params.nextMeetingLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; margin-top: 10px;">
            Join Next Review &rarr;
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (isMock) {
    console.log('\n======================================================');
    console.log(`📧 [MOCK EMAIL DISPATCHED] Review #${params.reviewNumber} Evaluation`);
    console.log(`To: ${params.to} (${params.name})`);
    console.log(`Score: ${Math.round(params.score)}/100`);
    console.log('======================================================\n');

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'MOCKED',
      },
    });

    return { success: true, mocked: true, messageId: `mock-feedback-${Date.now()}` };
  }

  logEmailConfig();

  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    const errorMsg = 'Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env. Note: If you just updated .env, restart the dev server to load the new values.';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMsg = 'Could not initialize Gmail SMTP transporter (host: smtp.gmail.com, port: 465, secure: true).';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const verifyResult = await verifyTransporter(transporter);
  if (!verifyResult.valid) {
    const errorMsg = verifyResult.error || 'Nodemailer transporter.verify() failed';
    console.error(`[Email Error] transporter.verify() failed for ${params.to}:`, errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  try {
    const info = await transporter.sendMail({
      from: `"InternFlow Automation" <${user}>`,
      to: params.to,
      subject,
      html: htmlBody,
    });

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'SENT',
      },
    });

    return { success: true, mocked: false, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email Send Error] Full error sending feedback to ${params.to}:`, err);
    const errorMsg = err?.message || String(err);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'REVIEW_FEEDBACK',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }
}

/**
 * Sends closing congratulations email with attached PDF Certificate of Completion.
 */
export async function sendCertificateEmail(
  params: CertificateEmailParams
): Promise<SendEmailResult> {
  const isMock = isMockMode();
  const subject = `🏆 Congratulations! Your ${params.domain} Internship Certificate of Completion is Ready`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
    <tr>
      <td style="padding: 32px; background: linear-gradient(135deg, #d97706 0%, #b45309 100%); text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 900;">Internship Completed! 🎓</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 12px 0; color: #f1f5f9; font-size: 20px;">Congratulations, ${params.name}!</h2>
        <p style="margin: 0 0 20px 0; color: #94a3b8; font-size: 15px;">
          You have successfully concluded your final review for the <strong style="color: #fbbf24;">${params.domain}</strong> track with a final score of <strong>${Math.round(params.finalScore)}/100</strong>!
        </p>
        <p style="color: #94a3b8; font-size: 14px;">Your official Certificate of Completion is attached as a PDF.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (isMock) {
    console.log('\n======================================================');
    console.log(`🏆 [MOCK EMAIL DISPATCHED] Final Certificate for ${params.name}`);
    console.log(`To: ${params.to}`);
    console.log(`Attached PDF: ${params.pdfFileName}`);
    console.log('======================================================\n');

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'MOCKED',
      },
    });

    return { success: true, mocked: true, messageId: `mock-cert-${Date.now()}` };
  }

  logEmailConfig();

  const user = getEnv('GMAIL_USER');
  const pass = getEnv('GMAIL_APP_PASSWORD');

  if (!user || !pass) {
    const errorMsg = 'Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env. Note: If you just updated .env, restart the dev server to load the new values.';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const transporter = getTransporter();
  if (!transporter) {
    const errorMsg = 'Could not initialize Gmail SMTP transporter (host: smtp.gmail.com, port: 465, secure: true).';
    console.error('[Email Error]', errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  const verifyResult = await verifyTransporter(transporter);
  if (!verifyResult.valid) {
    const errorMsg = verifyResult.error || 'Nodemailer transporter.verify() failed';
    console.error(`[Email Error] transporter.verify() failed for certificate to ${params.to}:`, errorMsg);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }

  try {
    const info = await transporter.sendMail({
      from: `"InternFlow Automation" <${user}>`,
      to: params.to,
      subject,
      html: htmlBody,
      attachments: [
        {
          filename: params.pdfFileName,
          content: params.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'SENT',
      },
    });

    return { success: true, mocked: false, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email Send Error] Full error sending certificate to ${params.to}:`, err);
    const errorMsg = err?.message || String(err);
    await prisma.emailLog.create({
      data: {
        internId: params.internId,
        to: params.to,
        subject,
        body: htmlBody,
        emailType: 'CERTIFICATE',
        status: 'FAILED',
        error: errorMsg,
      },
    });
    return { success: false, mocked: false, error: errorMsg };
  }
}
