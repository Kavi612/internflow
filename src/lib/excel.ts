import * as XLSX from 'xlsx';

export interface ParsedInternRow {
  rowNumber: number;
  name: string;
  email: string;
  domain: string;
  startDate: string; // ISO string
  endDate: string;   // ISO string
  startDateFormatted: string;
  endDateFormatted: string;
  isValid: boolean;
  errors: string[];
}

export interface ExcelParseResult {
  fileName: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  rows: ParsedInternRow[];
  detectedDomains: string[];
}

/**
 * Parses raw Excel date representation (serial number, Date object, or date string).
 */
function parseExcelDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Handle Excel serial date numbers (days since Dec 30, 1899)
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const millis = value * 24 * 60 * 60 * 1000;
    const parsed = new Date(excelEpoch.getTime() + millis);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Handle date string
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Try standard Date.parse
    const timestamp = Date.parse(trimmed);
    if (!isNaN(timestamp)) {
      return new Date(timestamp);
    }

    // Try parsing DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

/**
 * Normalizes header keys to standard properties.
 */
function normalizeRowKeys(rawRow: Record<string, unknown>): {
  name?: string;
  email?: string;
  domain?: string;
  startDateRaw?: unknown;
  endDateRaw?: unknown;
} {
  const normalized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(rawRow)) {
    const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
    normalized[cleanKey] = val;
  }

  const nameVal =
    normalized['studentname'] ??
    normalized['name'] ??
    normalized['fullname'] ??
    normalized['student'];

  const emailVal =
    normalized['email'] ??
    normalized['emailaddress'] ??
    normalized['mail'];

  const domainVal =
    normalized['domain'] ??
    normalized['track'] ??
    normalized['internshipdomain'] ??
    normalized['role'];

  const startVal =
    normalized['startdate'] ??
    normalized['start'] ??
    normalized['joiningdate'];

  const endVal =
    normalized['enddate'] ??
    normalized['end'] ??
    normalized['completiondate'];

  return {
    name: nameVal !== undefined ? String(nameVal).trim() : undefined,
    email: emailVal !== undefined ? String(emailVal).trim() : undefined,
    domain: domainVal !== undefined ? String(domainVal).trim() : undefined,
    startDateRaw: startVal,
    endDateRaw: endVal,
  };
}

/**
 * Validates email format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Parses an Excel or CSV buffer and validates intern entries against required columns:
 * Student Name, Email, Domain, Start Date, End Date.
 */
export function parseInternsExcelBuffer(buffer: Buffer, fileName: string = 'interns.xlsx'): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      fileName,
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
      rows: [],
      detectedDomains: [],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const parsedRows: ParsedInternRow[] = [];
  const domainSet = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const { name, email, domain, startDateRaw, endDateRaw } = normalizeRowKeys(row);

    const errors: string[] = [];

    // Check Student Name
    if (!name || name.length < 2) {
      errors.push('Missing or invalid student name (must be at least 2 characters).');
    }

    // Check Email
    if (!email || !isValidEmail(email)) {
      errors.push('Missing or invalid email address.');
    }

    // Check Domain
    if (!domain || domain.length < 2) {
      errors.push('Missing or invalid internship domain.');
    } else {
      domainSet.add(domain);
    }

    // Check Dates
    const startDate = parseExcelDate(startDateRaw);
    const endDate = parseExcelDate(endDateRaw);

    if (!startDate) {
      errors.push('Missing or unparseable Start Date.');
    }

    if (!endDate) {
      errors.push('Missing or unparseable End Date.');
    }

    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      errors.push('Start Date must be before or equal to End Date.');
    }

    const isValid = errors.length === 0;

    const startDateIso = startDate ? startDate.toISOString() : '';
    const endDateIso = endDate ? endDate.toISOString() : '';

    const startDateFormatted = startDate
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(startDate)
      : 'Invalid';

    const endDateFormatted = endDate
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(endDate)
      : 'Invalid';

    parsedRows.push({
      rowNumber,
      name: name || '',
      email: email || '',
      domain: domain || '',
      startDate: startDateIso,
      endDate: endDateIso,
      startDateFormatted,
      endDateFormatted,
      isValid,
      errors,
    });
  });

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return {
    fileName,
    totalCount: parsedRows.length,
    validCount,
    invalidCount,
    rows: parsedRows,
    detectedDomains: Array.from(domainSet),
  };
}
