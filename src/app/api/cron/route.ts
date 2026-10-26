import { NextResponse } from 'next/server';
import { runCronSweep, initCron } from '@/lib/cron';

export async function GET() {
  initCron();
  const sweep = await runCronSweep();
  return NextResponse.json({
    success: true,
    message: 'Cron sweep executed successfully.',
    sweep,
  });
}

export async function POST() {
  initCron();
  const sweep = await runCronSweep();
  return NextResponse.json({
    success: true,
    message: 'Cron sweep executed successfully.',
    sweep,
  });
}
