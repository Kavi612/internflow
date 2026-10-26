import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { generateTaskTemplateForDomain } from '@/lib/gemini';
import { initCron } from '@/lib/cron';

export interface InternPayload {
  name: string;
  email: string;
  domain: string;
  startDate: string;
  endDate: string;
}

export async function POST(req: NextRequest) {
  try {
    // Initialize cron singleton if not already active
    initCron();

    const body = await req.json();
    const interns: InternPayload[] = body.interns;
    const customTemplates: Record<string, { title: string; description: string; deliverables: string; orientationNotes: string }> =
      body.customTemplates || {};

    if (!Array.isArray(interns) || interns.length === 0) {
      return NextResponse.json({ error: 'No interns provided for automation.' }, { status: 400 });
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const isDemo = process.env.DEMO_MODE === 'true';

    const processedResults = [];

    for (const internData of interns) {
      const cleanEmail = internData.email.trim().toLowerCase();
      const cleanName = internData.name.trim();
      const cleanDomain = internData.domain.trim();

      // 1. Ensure Task Template exists in DB for this domain
      let template = await prisma.taskTemplate.findFirst({
        where: {
          domain: {
            equals: cleanDomain,
          },
        },
      });

      if (!template) {
        const custom = customTemplates[cleanDomain] || customTemplates[cleanDomain.toLowerCase()];
        if (custom) {
          template = await prisma.taskTemplate.create({
            data: {
              domain: cleanDomain,
              title: custom.title,
              description: custom.description,
              deliverables: custom.deliverables,
              orientationNotes: custom.orientationNotes,
            },
          });
        } else {
          const generated = await generateTaskTemplateForDomain(cleanDomain);
          template = await prisma.taskTemplate.create({
            data: {
              domain: cleanDomain,
              title: generated.title,
              description: generated.description,
              deliverables: generated.deliverables,
              orientationNotes: generated.orientationNotes,
            },
          });
        }
      }

      // 2. Upsert Intern in DB
      const intern = await prisma.intern.upsert({
        where: { email: cleanEmail },
        update: {
          name: cleanName,
          domain: cleanDomain,
          startDate: new Date(internData.startDate),
          endDate: new Date(internData.endDate),
          status: 'ORIENTATION_SCHEDULED',
        },
        create: {
          name: cleanName,
          email: cleanEmail,
          domain: cleanDomain,
          startDate: new Date(internData.startDate),
          endDate: new Date(internData.endDate),
          status: 'ORIENTATION_SCHEDULED',
        },
      });

      // 3. Calculate Orientation Meeting Time
      const now = new Date();
      let orientationTime: Date;

      if (isDemo) {
        // DEMO_MODE: Schedule 3 minutes from now
        orientationTime = new Date(now.getTime() + 3 * 60 * 1000);
      } else {
        const start = new Date(internData.startDate);
        // If start date is in future, set to 10:00 AM on start date
        if (start.getTime() > now.getTime()) {
          orientationTime = new Date(start);
          orientationTime.setHours(10, 0, 0, 0);
        } else {
          // If start date is today or past, schedule for 1 hour from now
          orientationTime = new Date(now.getTime() + 60 * 60 * 1000);
        }
      }

      // 4. Generate unique meeting token and 6-digit OTP
      const token = crypto.randomUUID();
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // 5. Find or create ORIENTATION Meeting record (do not duplicate)
      let meeting = await prisma.meeting.findFirst({
        where: {
          internId: intern.id,
          type: 'ORIENTATION',
        },
      });

      if (!meeting) {
        meeting = await prisma.meeting.create({
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

      const meetingLink = `${appBaseUrl}/meet/${meeting.token}`;

      // Check if congratulations email was already sent
      const existingSentEmail = await prisma.emailLog.findFirst({
        where: {
          internId: intern.id,
          emailType: 'CONGRATULATIONS',
          status: { in: ['SENT', 'MOCKED'] },
        },
      });

      const hasSentEmail = !!existingSentEmail;

      processedResults.push({
        internId: intern.id,
        name: intern.name,
        email: intern.email,
        domain: intern.domain,
        meetingId: meeting.id,
        token: meeting.token,
        otp: meeting.otp,
        scheduledAt: meeting.scheduledAt.toISOString(),
        meetingLink,
        hasSentEmail,
        emailStatus: hasSentEmail ? 'SENT' : 'NOT_SENT',
      });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully automated onboarding for ${processedResults.length} intern(s).`,
      count: processedResults.length,
      results: processedResults,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('[Start Automation Error]', errMessage);
    return NextResponse.json({ error: `Automation failed: ${errMessage}` }, { status: 500 });
  }
}
