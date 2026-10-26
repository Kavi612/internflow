import { NextRequest, NextResponse } from 'next/server';
import { parseInternsExcelBuffer } from '@/lib/excel';
import prisma from '@/lib/prisma';
import { generateTaskTemplateForDomain } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded. Please select an Excel file.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseResult = parseInternsExcelBuffer(buffer, file.name);

    // Fetch existing domain templates for all detected domains
    const existingTemplates = await prisma.taskTemplate.findMany({
      where: {
        domain: {
          in: parseResult.detectedDomains,
        },
      },
    });

    const existingDomainMap = new Map(existingTemplates.map((t) => [t.domain.toLowerCase(), t]));

    // Identify domains that need templates
    const domainStatus = await Promise.all(
      parseResult.detectedDomains.map(async (domain) => {
        const found = existingDomainMap.get(domain.toLowerCase());
        if (found) {
          return {
            domain,
            exists: true,
            template: found,
          };
        }

        // Preview generated template
        const generated = await generateTaskTemplateForDomain(domain);
        return {
          domain,
          exists: false,
          previewTemplate: generated,
        };
      })
    );

    return NextResponse.json({
      success: true,
      parseResult,
      domainStatus,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('[Upload API Error]', errMessage);
    return NextResponse.json({ error: `Failed to process Excel file: ${errMessage}` }, { status: 500 });
  }
}
