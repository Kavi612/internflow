import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { generateTaskTemplateForDomain } from '@/lib/gemini';
import { sendCongratulationsEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { internId } = body;

    if (!internId) {
      return NextResponse.json({ success: false, error: 'internId is required.' }, { status: 400 });
    }

    const intern = await prisma.intern.findUnique({
      where: { id: internId },
      include: {
        meetings: true,
        emailLogs: true,
      },
    });

    if (!intern) {
      return NextResponse.json({ success: false, error: `Intern not found with ID: ${internId}` }, { status: 404 });
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const isDemo = process.env.DEMO_MODE === 'true';

    // 1. Prevent double sends: check if congratulations email was already sent (only real 'SENT', not 'MOCKED')
    const alreadySent = await prisma.emailLog.findFirst({
      where: {
        internId: intern.id,
        emailType: 'CONGRATULATIONS',
        status: 'SENT',
      },
    });

    // Find or create orientation meeting
    let orientation = intern.meetings.find((m) => m.type === 'ORIENTATION');
    if (!orientation) {
      const now = new Date();
      const orientationTime = isDemo
        ? new Date(now.getTime() + 3 * 60 * 1000)
        : new Date(now.getTime() + 60 * 60 * 1000);
      const token = crypto.randomUUID();
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      orientation = await prisma.meeting.create({
        data: {
          internId: intern.id,
          type: 'ORIENTATION',
          token,
          otp,
          scheduledAt: orientationTime,
          status: 'SCHEDULED',
        },
      });
    }

    const meetingLink = `${appBaseUrl}/meet/${orientation.token}`;

    if (alreadySent) {
      return NextResponse.json({
        success: true,
        alreadySent: true,
        message: 'Congratulations email was already sent.',
        token: orientation.token,
        meetingLink,
      });
    }

    // 2. Fetch or generate task template for domain
    let template = await prisma.taskTemplate.findFirst({
      where: {
        domain: {
          equals: intern.domain,
        },
      },
    });

    if (!template) {
      const generated = await generateTaskTemplateForDomain(intern.domain);
      template = await prisma.taskTemplate.create({
        data: {
          domain: intern.domain,
          title: generated.title,
          description: generated.description,
          deliverables: generated.deliverables,
          orientationNotes: generated.orientationNotes,
        },
      });
    }

    // 3. Dispatch Congratulations Email with Task Summary, Orientation Date, Link, and OTP
    // forceRealSend ensures the real Nodemailer send function is called even if MOCK_EMAIL was true
    const taskSummary =
      template.description.substring(0, 220) + (template.description.length > 220 ? '...' : '');

    const emailResult = await sendCongratulationsEmail({
      internId: intern.id,
      to: intern.email,
      name: intern.name,
      domain: intern.domain,
      taskTitle: template.title,
      taskSummary,
      orientationDate: orientation.scheduledAt,
      meetingLink,
      otp: orientation.otp,
      forceRealSend: true,
    });

    // 4. Do not swallow errors: return failure status & exact error message to caller
    if (!emailResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: emailResult.error || 'Failed to dispatch email.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      internId: intern.id,
      token: orientation.token,
      otp: orientation.otp,
      meetingLink,
      emailStatus: emailResult.mocked ? 'MOCKED' : 'SENT',
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Start Intern Error]', errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
