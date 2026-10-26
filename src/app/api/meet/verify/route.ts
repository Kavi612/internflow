import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, otp, action } = body;

    if (!token) {
      return NextResponse.json({ error: 'Meeting token is required.' }, { status: 400 });
    }

    // Find meeting with intern details
    const meeting = await prisma.meeting.findUnique({
      where: { token },
      include: {
        intern: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        { error: 'Invalid or expired meeting token. Please verify your link.' },
        { status: 404 }
      );
    }

    const isDemo = process.env.DEMO_MODE === 'true';
    const now = new Date();
    const scheduledTime = new Date(meeting.scheduledAt);

    // 1. Check countdown / waiting state if action === 'check'
    if (action === 'check') {
      const isBeforeScheduled = !isDemo && scheduledTime.getTime() > now.getTime();
      const secondsUntilScheduled = Math.max(0, Math.floor((scheduledTime.getTime() - now.getTime()) / 1000));

      return NextResponse.json({
        success: true,
        type: meeting.type,
        status: meeting.status,
        isWaiting: isBeforeScheduled,
        secondsUntilScheduled,
        scheduledAt: meeting.scheduledAt.toISOString(),
        isDemo,
        demoOtp: isDemo || process.env.MOCK_EMAIL === 'true' ? meeting.otp : undefined,
        intern: {
          name: meeting.intern.name,
          domain: meeting.intern.domain,
        },
      });
    }

    // 2. Action === 'verify' (Verify OTP)
    if (!otp) {
      return NextResponse.json({ error: 'Please enter your 6-digit OTP.' }, { status: 400 });
    }

    const enteredOtp = String(otp).trim();
    if (enteredOtp !== meeting.otp.trim()) {
      return NextResponse.json(
        { error: 'Invalid OTP code. Please check the 6-digit code in your confirmation email.' },
        { status: 400 }
      );
    }

    // If meeting is not already completed, update status to IN_PROGRESS
    if (meeting.status !== 'COMPLETED') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    // Fetch TaskTemplate for intern's domain
    const template = await prisma.taskTemplate.findFirst({
      where: {
        domain: {
          equals: meeting.intern.domain,
        },
      },
    });

    // Calculate approximate first review date
    let reviewDatePreview: Date;
    if (isDemo) {
      reviewDatePreview = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins from now
    } else {
      reviewDatePreview = new Date(meeting.intern.startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return NextResponse.json({
      success: true,
      verified: true,
      meeting: {
        id: meeting.id,
        token: meeting.token,
        type: meeting.type,
        status: 'IN_PROGRESS',
        scheduledAt: meeting.scheduledAt.toISOString(),
      },
      intern: {
        id: meeting.intern.id,
        name: meeting.intern.name,
        email: meeting.intern.email,
        domain: meeting.intern.domain,
        startDate: meeting.intern.startDate.toISOString(),
        endDate: meeting.intern.endDate.toISOString(),
      },
      taskTemplate: template || {
        title: `${meeting.intern.domain} Internship Capstone`,
        description: `Hands-on project in ${meeting.intern.domain}.`,
        deliverables: `- Technical implementation\n- Documentation & tests`,
        orientationNotes: `Welcome to your ${meeting.intern.domain} internship! You'll be working on practical industry tasks.`,
      },
      firstReviewDatePreview: reviewDatePreview.toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Verify API Error]', msg);
    return NextResponse.json({ error: `Verification failed: ${msg}` }, { status: 500 });
  }
}
