import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface CertificateParams {
  internName: string;
  domain: string;
  startDate: Date;
  endDate: Date;
  issueDate?: Date;
  finalScore?: number;
}

export interface GeneratedCertificate {
  pdfBuffer: Buffer;
  fileName: string;
  publicUrl: string;
  localPath: string;
}

/**
 * Generates an elegant PDF Certificate of Completion using pdf-lib.
 * Saves a copy in public/certificates/ for download and returns the raw Buffer.
 */
export async function generateCompletionCertificate(
  params: CertificateParams
): Promise<GeneratedCertificate> {
  const issueDate = params.issueDate || new Date();

  // Create PDF Document (A4 Landscape: 842 x 595 points)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]);
  const { width, height } = page.getSize();

  // Embed standard fonts
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontTimesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // Background base
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.97, 0.98, 1.0), // very soft pearl indigo tint
  });

  // Outer border
  page.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderColor: rgb(0.12, 0.16, 0.28), // slate-900
    borderWidth: 3,
  });

  // Inner decorative border
  page.drawRectangle({
    x: 35,
    y: 35,
    width: width - 70,
    height: height - 70,
    borderColor: rgb(0.85, 0.65, 0.15), // warm gold accent
    borderWidth: 1.5,
  });

  // Top Title: INTERNFLOW BADGE
  const badgeText = 'INTERNFLOW AUTOMATED MENTORSHIP PROGRAM';
  const badgeWidth = fontHelveticaBold.widthOfTextAtSize(badgeText, 11);
  page.drawText(badgeText, {
    x: (width - badgeWidth) / 2,
    y: height - 80,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(0.4, 0.45, 0.6),
  });

  // Main Header: CERTIFICATE OF COMPLETION
  const certTitle = 'CERTIFICATE OF COMPLETION';
  const titleWidth = fontTimesBold.widthOfTextAtSize(certTitle, 28);
  page.drawText(certTitle, {
    x: (width - titleWidth) / 2,
    y: height - 125,
    size: 28,
    font: fontTimesBold,
    color: rgb(0.08, 0.1, 0.18),
  });

  // Subtitle
  const subText = 'This is proudly presented to';
  const subWidth = fontTimesItalic.widthOfTextAtSize(subText, 14);
  page.drawText(subText, {
    x: (width - subWidth) / 2,
    y: height - 175,
    size: 14,
    font: fontTimesItalic,
    color: rgb(0.35, 0.4, 0.5),
  });

  // Recipient Name
  const recipientName = params.internName.toUpperCase();
  const nameWidth = fontHelveticaBold.widthOfTextAtSize(recipientName, 32);
  page.drawText(recipientName, {
    x: (width - nameWidth) / 2,
    y: height - 225,
    size: 32,
    font: fontHelveticaBold,
    color: rgb(0.18, 0.15, 0.55), // bold royal indigo
  });

  // Underline beneath name
  page.drawLine({
    start: { x: (width - nameWidth) / 2 - 20, y: height - 235 },
    end: { x: (width + nameWidth) / 2 + 20, y: height - 235 },
    thickness: 2,
    color: rgb(0.85, 0.65, 0.15), // gold
  });

  // Achievement description
  const achieveText = 'for successfully fulfilling all capstone deliverables, evaluations, and milestone reviews in';
  const achieveWidth = fontHelvetica.widthOfTextAtSize(achieveText, 13);
  page.drawText(achieveText, {
    x: (width - achieveWidth) / 2,
    y: height - 275,
    size: 13,
    font: fontHelvetica,
    color: rgb(0.2, 0.25, 0.35),
  });

  // Domain Track
  const domainText = `${params.domain} Engineering Track`;
  const domainWidth = fontHelveticaBold.widthOfTextAtSize(domainText, 20);
  page.drawText(domainText, {
    x: (width - domainWidth) / 2,
    y: height - 315,
    size: 20,
    font: fontHelveticaBold,
    color: rgb(0.25, 0.28, 0.75),
  });

  // Tenure & Dates
  const startDateStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(params.startDate);
  const endDateStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(params.endDate);
  const issueDateStr = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(issueDate);

  const tenureText = `Tenure: ${startDateStr} to ${endDateStr}   •   Issue Date: ${issueDateStr}`;
  const tenureWidth = fontHelvetica.widthOfTextAtSize(tenureText, 11);
  page.drawText(tenureText, {
    x: (width - tenureWidth) / 2,
    y: height - 360,
    size: 11,
    font: fontHelvetica,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Final score mention if available
  if (params.finalScore !== undefined) {
    const scoreText = `Final Cumulative Evaluation Score: ${Math.round(params.finalScore)}/100`;
    const scoreWidth = fontHelveticaBold.widthOfTextAtSize(scoreText, 12);
    page.drawText(scoreText, {
      x: (width - scoreWidth) / 2,
      y: height - 390,
      size: 12,
      font: fontHelveticaBold,
      color: rgb(0.05, 0.6, 0.35), // emerald
    });
  }

  // Bottom Signatures & Seal
  const leftSigY = 90;

  // Left: AI Verification Seal
  page.drawText('InternFlow AI Core', {
    x: 100,
    y: leftSigY + 25,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(0.15, 0.2, 0.3),
  });
  page.drawLine({
    start: { x: 100, y: leftSigY + 15 },
    end: { x: 280, y: leftSigY + 15 },
    thickness: 1,
    color: rgb(0.6, 0.65, 0.75),
  });
  page.drawText('Autonomous System Verification', {
    x: 100,
    y: leftSigY,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Right: Academic Director Signature
  page.drawText('Dr. Maya Patel, Curriculum Director', {
    x: width - 300,
    y: leftSigY + 25,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(0.15, 0.2, 0.3),
  });
  page.drawLine({
    start: { x: width - 300, y: leftSigY + 15 },
    end: { x: width - 100, y: leftSigY + 15 },
    thickness: 1,
    color: rgb(0.6, 0.65, 0.75),
  });
  page.drawText('InternFlow Global Mentorship Council', {
    x: width - 300,
    y: leftSigY,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.4, 0.45, 0.55),
  });

  // Unique verification ID at footer
  const certId = `CERT-IF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const certIdText = `Certificate Verification ID: ${certId}`;
  const certIdWidth = fontHelvetica.widthOfTextAtSize(certIdText, 8);
  page.drawText(certIdText, {
    x: (width - certIdWidth) / 2,
    y: 45,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.55, 0.6, 0.7),
  });

  // Serialize to Buffer
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // File naming
  const cleanName = params.internName.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanDomain = params.domain.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${cleanName}_${cleanDomain}_Certificate.pdf`;

  // Save to public/certificates and root /certificates
  const publicCertDir = path.join(process.cwd(), 'public', 'certificates');
  if (!fs.existsSync(publicCertDir)) {
    fs.mkdirSync(publicCertDir, { recursive: true });
  }

  const rootCertDir = path.join(process.cwd(), 'certificates');
  if (!fs.existsSync(rootCertDir)) {
    fs.mkdirSync(rootCertDir, { recursive: true });
  }

  const publicFilePath = path.join(publicCertDir, fileName);
  fs.writeFileSync(publicFilePath, pdfBuffer);

  const rootFilePath = path.join(rootCertDir, fileName);
  fs.writeFileSync(rootFilePath, pdfBuffer);

  console.log(`📜 [Certificate Created] Saved to: ${publicFilePath} and ${rootFilePath}`);

  return {
    pdfBuffer,
    fileName,
    publicUrl: `/certificates/${fileName}`,
    localPath: publicFilePath,
  };
}
