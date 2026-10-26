import { NextResponse } from 'next/server';
import { sendTestEmail } from '@/lib/email';

export async function POST() {
  try {
    const result = await sendTestEmail();

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          error: result.error || 'Failed to send test email.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'sent',
      message: 'sent',
      messageId: result.messageId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
