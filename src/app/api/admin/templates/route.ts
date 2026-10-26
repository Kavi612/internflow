import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateTaskTemplateForDomain } from '@/lib/gemini';

// GET all templates
export async function GET() {
  try {
    const templates = await prisma.taskTemplate.findMany({
      orderBy: { domain: 'asc' },
    });
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}

// POST: Upsert or generate template
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, title, description, deliverables, orientationNotes, action } = body;

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required.' }, { status: 400 });
    }

    if (action === 'generate') {
      const generated = await generateTaskTemplateForDomain(domain);
      return NextResponse.json({ success: true, template: generated });
    }

    const template = await prisma.taskTemplate.upsert({
      where: { domain },
      update: {
        title: title || `${domain} Internship Project`,
        description: description || '',
        deliverables: deliverables || '',
        orientationNotes: orientationNotes || '',
      },
      create: {
        domain,
        title: title || `${domain} Internship Project`,
        description: description || '',
        deliverables: deliverables || '',
        orientationNotes: orientationNotes || '',
      },
    });

    return NextResponse.json({ success: true, template });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
