import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '@/lib/prisma';

export interface ChatMessage {
  role: 'mentor' | 'intern';
  text: string;
}

function cleanSpokenText(text: string): string {
  return text
    .replace(/[*#_`~>]/g, '')     // remove markdown symbols
    .replace(/^[-•]\s*/gm, '')     // remove list bullets
    .replace(/\n{2,}/g, ' ')      // collapse multi newlines
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, message, history = [], evaluationContext } = body;

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

    const template = await prisma.taskTemplate.findFirst({
      where: {
        domain: {
          equals: meeting.intern.domain,
        },
      },
    });

    const isDemo = process.env.DEMO_MODE === 'true';
    const now = new Date();

    // Calculate formatted review date
    let reviewDate: Date;
    if (isDemo) {
      reviewDate = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins in demo
    } else {
      reviewDate = new Date(meeting.scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      reviewDate.setHours(10, 0, 0, 0);
    }

    const reviewDateFormatted = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(reviewDate);

    const isFinalReview =
      meeting.isFinalReview ||
      reviewDate.getTime() > new Date(meeting.intern.endDate).getTime();

    const taskTitle = template?.title || `${meeting.intern.domain} Capstone Project`;
    const taskDesc = template?.description || `Building a real-world solution in ${meeting.intern.domain}.`;
    const taskDeliverables = template?.deliverables || 'Deliverables: functional project, clean code, documentation.';
    const orientationNotes = template?.orientationNotes || `Welcome to your internship! You will be working on exciting practical projects.`;

    const isReview = meeting.type === 'REVIEW';
    const reviewNumber = meeting.reviewNumber || 1;

    // Detect if user is saying "no doubts / no questions"
    const internSaidNo =
      typeof message === 'string' &&
      /\b(no|nope|no doubts|nothing|all good|clear|all clear|i'm good|im good|i understand|ready|none|no questions|thanks|thank you)\b/i.test(
        message.trim()
      );

    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        let systemPrompt = '';

        if (isReview) {
          systemPrompt = `
You are a friendly, encouraging senior engineering mentor conducting Review Meeting #${reviewNumber} with an intern named "${meeting.intern.name}".
Domain: "${meeting.intern.domain}".
Project Title: "${taskTitle}".
Deliverables: "${taskDeliverables}".
Upcoming Date or Status: ${isFinalReview ? 'FINAL REVIEW - COMPLETION & CERTIFICATE' : `Next Review: ${reviewDateFormatted}`}.
${evaluationContext ? `Latest Evaluation Feedback Provided: ${JSON.stringify(evaluationContext)}` : ''}

CONVERSATION RULES (CRITICAL):
1. Speak in short natural sentences with contractions (e.g. "I'm", "you'll", "it's", "don't").
2. NEVER use bullet points, asterisks, numbered lists, hashtags, bolding, or markdown of any kind. This will be read aloud by speech synthesis.
3. If this is the start of the review (no prior messages):
   - Warmly greet ${meeting.intern.name} by name.
   - Briefly recall their assigned project (${taskTitle}).
   - Ask them to submit their work using the submission panel below (GitHub link, uploaded document, or text) so you can review it together.
4. If the intern has questions about their evaluation or suggestions:
   - Answer directly and conversationally in the context of their task and submitted work.
   - Conclude by asking: "Do you have any other questions about the feedback?"
5. If ${meeting.intern.name} says they have no more questions or doubts:
   - Wrap up warmly and enthusiastically.
   ${
     isFinalReview
       ? `- State that this was their final review, congratulate them, and announce that their official Certificate of Completion is being generated and emailed.
          - Append the exact marker [REVIEW_COMPLETE] at the very end.`
       : `- Mention that their next review meeting is scheduled for ${reviewDateFormatted}.
          - Append the exact marker [REVIEW_COMPLETE] at the very end.`
   }
`;
        } else {
          // ORIENTATION SYSTEM PROMPT
          systemPrompt = `
You are a friendly, warm, human-sounding mentor conducting a 1-on-1 voice orientation meeting with an intern named "${meeting.intern.name}".
Domain: "${meeting.intern.domain}".
Project Title: "${taskTitle}".
Description: "${taskDesc}".
Deliverables: "${taskDeliverables}".
Mentor Guidance: "${orientationNotes}".
First Review Date: "${reviewDateFormatted}".

CONVERSATION RULES (CRITICAL):
1. Speak in short natural sentences with contractions (e.g. "I'm", "you'll", "it's", "don't").
2. NEVER use bullet points, asterisks, numbered lists, hashtags, bolding, or markdown of any kind. This will be read aloud by speech synthesis.
3. If this is the start of the meeting (the intern hasn't spoken yet):
   - Greet ${meeting.intern.name} warmly by name.
   - Explain the task step by step in a conversational, human way without overwhelming them.
   - Conclude by asking: "Do you have any doubts?"
4. If ${meeting.intern.name} asks questions or has doubts:
   - Answer ONLY in the context of their assigned task: "${taskTitle}".
   - Keep answers encouraging, practical, and short (2-4 sentences).
   - Conclude by asking: "Do you have any other doubts?"
5. If ${meeting.intern.name} says they have no doubts (or says "no", "all good", "i'm clear", "no doubts"):
   - Wrap up warmly and enthusiastically.
   - Mention that their first progress review is scheduled for ${reviewDateFormatted}.
   - Append the exact marker [ORIENTATION_COMPLETE] at the very end of your response.
`;
        }

        const conversationText = history
          .map((m: ChatMessage) => `${m.role === 'mentor' ? 'Mentor' : meeting.intern.name}: ${m.text}`)
          .join('\n');

        const currentTurnPrompt = message
          ? `${conversationText}\n${meeting.intern.name}: ${message}\nMentor:`
          : `${conversationText}\n(Intern has just joined the call)\nMentor:`;

        const fullPrompt = `${systemPrompt}\n\nConversation so far:\n${currentTurnPrompt}`;

        const result = await model.generateContent(fullPrompt);
        let reply = result.response.text().trim();

        const isComplete =
          reply.includes('[ORIENTATION_COMPLETE]') ||
          reply.includes('[REVIEW_COMPLETE]') ||
          (history.length >= 2 && internSaidNo);

        reply = reply
          .replace(/\[ORIENTATION_COMPLETE\]/g, '')
          .replace(/\[REVIEW_COMPLETE\]/g, '')
          .trim();
        reply = cleanSpokenText(reply);

        return NextResponse.json({
          success: true,
          reply,
          isComplete,
          isFinalReview,
          reviewDateFormatted,
        });
      } catch (geminiError) {
        console.warn('[Gemini Chat Error] Falling back to mentor state machine:', geminiError);
      }
    }

    // Fallback Mentor State Machine (if Gemini API key is missing or fails)
    let reply = '';
    let isComplete = false;

    if (isReview) {
      if (!message || history.length === 0) {
        reply = `Hi ${meeting.intern.name}, welcome to your Review #${reviewNumber}! As a reminder, you've been working on ${taskTitle} in ${meeting.intern.domain}. Whenever you're ready, please submit your work using the submission panel below so we can evaluate your progress.`;
      } else if (internSaidNo) {
        if (isFinalReview) {
          reply = `Congratulations, ${meeting.intern.name}! That concludes your final review. Your verified Certificate of Completion has been generated and sent to your email. You did an outstanding job throughout this internship!`;
        } else {
          reply = `Awesome, ${meeting.intern.name}! You're making steady progress. Your next review is scheduled for ${reviewDateFormatted}. Keep up the great momentum and I'll see you then!`;
        }
        isComplete = true;
      } else {
        reply = `That's a great question regarding your submission for ${taskTitle}. The primary focus is keeping your code modular, tested, and aligned with the assigned deliverables. You're definitely heading in the right direction. Do you have any other questions about the feedback?`;
      }
    } else {
      // ORIENTATION FALLBACK
      if (!message || history.length === 0) {
        reply = `Hi ${meeting.intern.name}! It's great to meet you. Welcome to the ${meeting.intern.domain} internship. You'll be building ${taskTitle}. We want you to focus on writing clean, solid code and creating a great user experience. Take your time to review the architecture, and we'll be here to help you every step of the way. Do you have any doubts?`;
      } else if (internSaidNo) {
        reply = `Awesome, ${meeting.intern.name}! You're all set to get started. Your first progress review will be on ${reviewDateFormatted}. Keep up the great energy, and I'll see you then!`;
        isComplete = true;
      } else {
        reply = `That's a very fair question regarding your ${meeting.intern.domain} project. For ${taskTitle}, the main focus is making sure your core deliverables are tested and well documented. Don't worry about perfection early on; just build incrementally and commit your progress regularly. Do you have any other doubts or questions?`;
      }
    }

    return NextResponse.json({
      success: true,
      reply: cleanSpokenText(reply),
      isComplete,
      isFinalReview,
      reviewDateFormatted,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error('[Chat API Error]', err);
    return NextResponse.json({ error: `Chat processing failed: ${err}` }, { status: 500 });
  }
}
