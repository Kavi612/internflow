import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { emailLogId } = body;

    if (!emailLogId) {
      return NextResponse.json({ error: 'emailLogId is required.' }, { status: 400 });
    }

    const log = await prisma.emailLog.findUnique({
      where: { id: emailLogId },
    });

    if (!log) {
      return NextResponse.json({ error: 'Email log record not found.' }, { status: 404 });
    }

    const isMock = process.env.MOCK_EMAIL === 'true' || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD;

    if (isMock) {
      console.log('\n======================================================');
      console.log(`📧 [MOCK EMAIL RE-SENT] Resend request for Log #${log.id}`);
      console.log(`To: ${log.to}`);
      console.log(`Subject: ${log.subject}`);
      console.log(`Type: ${log.emailType}`);
      console.log('======================================================\n');

      const updated = await prisma.emailLog.create({
        data: {
          internId: log.internId,
          to: log.to,
          subject: `[RESENT] ${log.subject}`,
          body: log.body,
          emailType: log.emailType,
          status: 'MOCKED',
        },
      });

      return NextResponse.json({
        success: true,
        mocked: true,
        message: `Email to ${log.to} re-logged successfully in Mock mode.`,
        log: updated,
      });
    }

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"InternFlow Automation" <${user}>`,
      to: log.to,
      subject: log.subject,
      html: log.body,
    });

    const newLog = await prisma.emailLog.create({
      data: {
        internId: log.internId,
        to: log.to,
        subject: `[RESENT] ${log.subject}`,
        body: log.body,
        emailType: log.emailType,
        status: 'SENT',
      },
    });

    return NextResponse.json({
      success: true,
      mocked: false,
      messageId: info.messageId,
      message: `Email resent successfully to ${log.to}.`,
      log: newLog,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Resend failed: ${err}` }, { status: 500 });
  }
}
