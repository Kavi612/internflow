import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { sendReviewFeedbackEmail, sendCertificateEmail } from '@/lib/email';
import { generateCompletionCertificate } from '@/lib/certificate';

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
        evaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
    }

    // 1. Mark current meeting as completed and save transcript
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: 'COMPLETED',
        transcript: transcript || meeting.transcript || 'Review session completed.',
      },
    });

    const isDemo = process.env.DEMO_MODE === 'true';
    const now = new Date();
    const currentNumber = meeting.reviewNumber || 1;

    // Calculate next review date
    let nextReviewDate: Date;
    if (isDemo) {
      nextReviewDate = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins in demo
    } else {
      nextReviewDate = new Date(meeting.scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      nextReviewDate.setHours(10, 0, 0, 0);
    }

    const endDate = new Date(meeting.intern.endDate);

    // Final Review condition: meeting is marked isFinalReview OR nextReviewDate > endDate
    const isFinalReview = meeting.isFinalReview || nextReviewDate.getTime() > endDate.getTime();

    const latestEvaluation = meeting.evaluations[0];
    const score = latestEvaluation?.score || 88;
    const emailFeedback = latestEvaluation?.emailFeedback || 'Great progress on completing your milestone deliverables!';

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    if (isFinalReview) {
      // --- FINAL REVIEW FLOW ---
      await prisma.intern.update({
        where: { id: meeting.intern.id },
        data: { status: 'COMPLETED' },
      });

      // Generate PDF certificate
      const cert = await generateCompletionCertificate({
        internName: meeting.intern.name,
        domain: meeting.intern.domain,
        startDate: meeting.intern.startDate,
        endDate: meeting.intern.endDate,
        finalScore: score,
      });

      // Send congratulations email with PDF certificate attached
      await sendCertificateEmail({
        internId: meeting.intern.id,
        to: meeting.intern.email,
        name: meeting.intern.name,
        domain: meeting.intern.domain,
        finalScore: score,
        pdfBuffer: cert.pdfBuffer,
        pdfFileName: cert.fileName,
        certificateUrl: `${appBaseUrl}${cert.publicUrl}`,
      });

      return NextResponse.json({
        success: true,
        isFinal: true,
        message: 'Final review completed! Certificate of Completion has been generated and dispatched.',
        certificateUrl: `${appBaseUrl}${cert.publicUrl}`,
        finalScore: score,
      });
    } else {
      // --- INTERMEDIATE REVIEW FLOW ---
      const nextReviewNumber = currentNumber + 1;

      // Check if next meeting already created to prevent duplicate
      let nextMeeting = await prisma.meeting.findFirst({
        where: {
          internId: meeting.intern.id,
          type: 'REVIEW',
          reviewNumber: nextReviewNumber,
        },
      });

      if (!nextMeeting) {
        const nextToken = crypto.randomUUID();
        const nextOtp = Math.floor(100000 + Math.random() * 900000).toString();

        nextMeeting = await prisma.meeting.create({
          data: {
            internId: meeting.intern.id,
            type: 'REVIEW',
            reviewNumber: nextReviewNumber,
            token: nextToken,
            otp: nextOtp,
            scheduledAt: nextReviewDate,
            status: 'SCHEDULED',
          },
        });

        const nextLink = `${appBaseUrl}/meet/${nextToken}`;

        // Send Review feedback email with next review schedule and OTP
        await sendReviewFeedbackEmail({
          internId: meeting.intern.id,
          to: meeting.intern.email,
          name: meeting.intern.name,
          domain: meeting.intern.domain,
          reviewNumber: currentNumber,
          score,
          emailFeedback,
          nextReviewDate,
          nextMeetingLink: nextLink,
          nextOtp,
        });
      }

      return NextResponse.json({
        success: true,
        isFinal: false,
        message: `Review #${currentNumber} completed. Next review scheduled for ${nextReviewDate.toLocaleDateString()}.`,
        score,
        nextMeeting: {
          id: nextMeeting.id,
          token: nextMeeting.token,
          otp: nextMeeting.otp,
          scheduledAt: nextMeeting.scheduledAt.toISOString(),
          link: `${appBaseUrl}/meet/${nextMeeting.token}`,
        },
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error('[Review Complete Error]', err);
    return NextResponse.json({ error: `Review completion failed: ${err}` }, { status: 500 });
  }
}
