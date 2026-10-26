import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const interns = await prisma.intern.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        meetings: {
          orderBy: { scheduledAt: 'asc' },
          include: {
            submissions: true,
            evaluations: true,
          },
        },
        emailLogs: {
          orderBy: { sentAt: 'desc' },
        },
      },
    });

    return NextResponse.json({ success: true, interns });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
