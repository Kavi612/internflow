import cron from 'node-cron';
import crypto from 'crypto';
import prisma from './prisma';
import { sendReviewInviteEmail, sendCertificateEmail, sendCongratulationsEmail } from './email';
import { generateCompletionCertificate } from './certificate';

export interface CronSweepResult {
  timestamp: string;
  checkedCount: number;
  dueMeetingsFound: number;
  actionsTaken: string[];
}

/**
 * Executes a single sweep of the automated intern review and meeting scheduler.
 * Runs every minute to send due emails and create upcoming meetings.
 */
export async function runCronSweep(): Promise<CronSweepResult> {
  const now = new Date();
  const isDemo = process.env.DEMO_MODE === 'true';
  const actions: string[] = [];
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  try {
    // 1. Find all SCHEDULED meetings that are due or upcoming in the next window
    const windowLimit = new Date(now.getTime() + (isDemo ? 5 * 60 * 1000 : 15 * 60 * 1000));

    const dueMeetings = await prisma.meeting.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          lte: windowLimit,
        },
      },
      include: {
        intern: true,
      },
    });

    for (const meeting of dueMeetings) {
      // Check if an email was already dispatched containing this meeting's token
      const existingEmail = await prisma.emailLog.findFirst({
        where: {
          internId: meeting.intern.id,
          body: {
            contains: meeting.token,
          },
        },
      });

      if (!existingEmail) {
        const meetingLink = `${appBaseUrl}/meet/${meeting.token}`;

        if (meeting.type === 'ORIENTATION') {
          const template = await prisma.taskTemplate.findFirst({
            where: { domain: meeting.intern.domain },
          });

          await sendCongratulationsEmail({
            internId: meeting.intern.id,
            to: meeting.intern.email,
            name: meeting.intern.name,
            domain: meeting.intern.domain,
            taskTitle: template?.title || `${meeting.intern.domain} Internship`,
            taskSummary: template?.description || 'Hands-on practical capstone project.',
            orientationDate: meeting.scheduledAt,
            meetingLink,
            otp: meeting.otp,
          });

          actions.push(`[Cron Email] Sent due Orientation email to ${meeting.intern.name} (${meeting.intern.email})`);
        } else {
          // Review meeting email
          await sendReviewInviteEmail({
            internId: meeting.intern.id,
            to: meeting.intern.email,
            name: meeting.intern.name,
            domain: meeting.intern.domain,
            reviewNumber: meeting.reviewNumber || 1,
            reviewDate: meeting.scheduledAt,
            meetingLink,
            otp: meeting.otp,
          });

          actions.push(`[Cron Email] Sent due Review #${meeting.reviewNumber} email to ${meeting.intern.name} (${meeting.intern.email})`);
        }
      }
    }

    // 2. Automated Meeting Creation for Interns needing next review
    // Interns who completed orientation or an earlier review, but have no pending review meeting scheduled
    const internsNeedingReview = await prisma.intern.findMany({
      where: {
        status: { in: ['ORIENTATION_COMPLETED', 'REVIEW_SCHEDULED'] },
      },
      include: {
        meetings: {
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    for (const intern of internsNeedingReview) {
      const hasActiveMeeting = intern.meetings.some(
        (m) => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS' || m.status === 'VERIFIED'
      );

      if (!hasActiveMeeting) {
        const lastMeeting = intern.meetings[0];
        const nextReviewNumber = lastMeeting && lastMeeting.reviewNumber ? lastMeeting.reviewNumber + 1 : 1;
        const endDate = new Date(intern.endDate);

        let nextReviewDate: Date;
        if (isDemo) {
          nextReviewDate = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes in demo
        } else {
          const lastDate = lastMeeting ? new Date(lastMeeting.scheduledAt) : new Date(intern.startDate);
          nextReviewDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          nextReviewDate.setHours(10, 0, 0, 0);
        }

        // If next date falls after intern.endDate, mark final completion and issue certificate!
        if (nextReviewDate.getTime() > endDate.getTime()) {
          const cert = await generateCompletionCertificate({
            internName: intern.name,
            domain: intern.domain,
            startDate: intern.startDate,
            endDate: intern.endDate,
            finalScore: 90,
          });

          await sendCertificateEmail({
            internId: intern.id,
            to: intern.email,
            name: intern.name,
            domain: intern.domain,
            finalScore: 90,
            pdfBuffer: cert.pdfBuffer,
            pdfFileName: cert.fileName,
            certificateUrl: `${appBaseUrl}${cert.publicUrl}`,
          });

          await prisma.intern.update({
            where: { id: intern.id },
            data: { status: 'COMPLETED' },
          });

          actions.push(`[Cron Final] Issued Certificate and marked ${intern.name} as COMPLETED.`);
        } else {
          // Create next review meeting
          const nextToken = crypto.randomUUID();
          const nextOtp = Math.floor(100000 + Math.random() * 900000).toString();

          const createdMeeting = await prisma.meeting.create({
            data: {
              internId: intern.id,
              type: 'REVIEW',
              reviewNumber: nextReviewNumber,
              token: nextToken,
              otp: nextOtp,
              scheduledAt: nextReviewDate,
              status: 'SCHEDULED',
            },
          });

          const reviewLink = `${appBaseUrl}/meet/${nextToken}`;

          await sendReviewInviteEmail({
            internId: intern.id,
            to: intern.email,
            name: intern.name,
            domain: intern.domain,
            reviewNumber: nextReviewNumber,
            reviewDate: nextReviewDate,
            meetingLink: reviewLink,
            otp: nextOtp,
          });

          actions.push(
            `[Cron Meeting] Created Review #${nextReviewNumber} for ${intern.name} scheduled at ${nextReviewDate.toISOString()}`
          );
        }
      }
    }

    return {
      timestamp: now.toISOString(),
      checkedCount: dueMeetings.length,
      dueMeetingsFound: dueMeetings.length,
      actionsTaken: actions,
    };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error('[Cron Sweep Error]', errMessage);
    return {
      timestamp: now.toISOString(),
      checkedCount: 0,
      dueMeetingsFound: 0,
      actionsTaken: [`Error: ${errMessage}`],
    };
  }
}

// Global singleton to prevent multiple cron jobs in development
const globalForCron = globalThis as unknown as {
  cronJobStarted: boolean | undefined;
};

/**
 * Initializes the node-cron scheduler to run every minute.
 */
export function initCron() {
  if (globalForCron.cronJobStarted) {
    return;
  }

  globalForCron.cronJobStarted = true;

  console.log('⏰ [Cron] InternFlow node-cron scheduler initialized (running every minute * * * * *)');

  cron.schedule('* * * * *', async () => {
    try {
      const result = await runCronSweep();
      if (result.actionsTaken.length > 0) {
        console.log(`⏰ [Cron Actions Executed] (${result.actionsTaken.length} actions):`, result.actionsTaken);
      }
    } catch (error) {
      console.error('[Cron Execution Error]', error);
    }
  });
}
