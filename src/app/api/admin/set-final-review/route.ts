import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { internId, meetingId, token, email } = body;

    let targetMeeting;

    if (token) {
      targetMeeting = await prisma.meeting.findUnique({
        where: { token },
      });
    } else if (meetingId) {
      targetMeeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
      });
    } else if (email) {
      const intern = await prisma.intern.findUnique({ where: { email } });
      if (intern) {
        targetMeeting = await prisma.meeting.findFirst({
          where: { internId: intern.id, type: 'REVIEW', status: { in: ['SCHEDULED', 'IN_PROGRESS', 'VERIFIED'] } },
          orderBy: { scheduledAt: 'desc' },
        });
      }
    } else if (internId) {
      targetMeeting = await prisma.meeting.findFirst({
        where: {
          internId,
          type: 'REVIEW',
          status: { in: ['SCHEDULED', 'IN_PROGRESS', 'VERIFIED'] },
        },
        orderBy: { scheduledAt: 'desc' },
      });

      if (!targetMeeting) {
        targetMeeting = await prisma.meeting.findFirst({
          where: { internId, type: 'REVIEW' },
          orderBy: { createdAt: 'desc' },
        });
      }
    } else {
      // Pick any upcoming review meeting in the system
      targetMeeting = await prisma.meeting.findFirst({
        where: { type: 'REVIEW', status: { in: ['SCHEDULED', 'IN_PROGRESS', 'VERIFIED'] } },
        orderBy: { scheduledAt: 'desc' },
      });
    }

    if (!targetMeeting) {
      return NextResponse.json(
        { error: 'No active review meeting found to mark as final.' },
        { status: 404 }
      );
    }

    const updated = await prisma.meeting.update({
      where: { id: targetMeeting.id },
      data: { isFinalReview: true },
    });

    return NextResponse.json({
      success: true,
      message: `Meeting #${updated.reviewNumber || 1} (${updated.token.slice(0, 8)}...) is now configured as the Final Review with Certificate generation.`,
      meeting: updated,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
