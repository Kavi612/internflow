import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { sendReviewInviteEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, transcript } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { token },
      include: {
        intern: true,
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
    }

    // 1. Save transcript and mark orientation COMPLETED
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: 'COMPLETED',
        transcript: transcript || meeting.transcript || 'Orientation completed.',
      },
    });

    // 2. Update intern lifecycle status
    await prisma.intern.update({
      where: { id: meeting.intern.id },
      data: {
        status: 'REVIEW_SCHEDULED',
      },
    });

    // 3. Create the first REVIEW meeting if one doesn't exist yet
    const existingReview = await prisma.meeting.findFirst({
      where: {
        internId: meeting.intern.id,
        type: 'REVIEW',
        reviewNumber: 1,
      },
    });

    let nextMeeting = existingReview;

    if (!existingReview) {
      const isDemo = process.env.DEMO_MODE === 'true';
      const now = new Date();

      let reviewDate: Date;
      if (isDemo) {
        reviewDate = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes in demo mode
      } else {
        const start = new Date(meeting.intern.startDate);
        reviewDate = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        reviewDate.setHours(10, 0, 0, 0);

        // Keep within intern.endDate
        if (reviewDate.getTime() > new Date(meeting.intern.endDate).getTime()) {
          reviewDate = new Date(meeting.intern.endDate);
          reviewDate.setHours(10, 0, 0, 0);
        }
      }

      const newReviewToken = crypto.randomUUID();
      const newReviewOtp = Math.floor(100000 + Math.random() * 900000).toString();

      nextMeeting = await prisma.meeting.create({
        data: {
          internId: meeting.intern.id,
          type: 'REVIEW',
          reviewNumber: 1,
          token: newReviewToken,
          otp: newReviewOtp,
          scheduledAt: reviewDate,
          status: 'SCHEDULED',
        },
      });

      const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const reviewLink = `${appBaseUrl}/meet/${newReviewToken}`;

      // 4. Send review-schedule email with date, time, link and OTP
      await sendReviewInviteEmail({
        internId: meeting.intern.id,
        to: meeting.intern.email,
        name: meeting.intern.name,
        domain: meeting.intern.domain,
        reviewNumber: 1,
        reviewDate,
        meetingLink: reviewLink,
        otp: newReviewOtp,
      });
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    return NextResponse.json({
      success: true,
      message: 'Orientation saved as completed. First review scheduled and email sent.',
      nextMeeting: nextMeeting
        ? {
            id: nextMeeting.id,
            token: nextMeeting.token,
            otp: nextMeeting.otp,
            scheduledAt: nextMeeting.scheduledAt.toISOString(),
            link: `${appBaseUrl}/meet/${nextMeeting.token}`,
          }
        : null,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error('[Meet Complete Error]', err);
    return NextResponse.json({ error: `Failed to complete meeting: ${err}` }, { status: 500 });
  }
}
