import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Locate xlsx from either local node_modules or nearby projects
let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  try {
    XLSX = require('../../Invita/node_modules/xlsx');
  } catch (err) {
    console.error('Could not find xlsx module:', err);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Sample Intern Data with columns: Student Name, Email, Domain, Start Date, End Date
const sampleData = [
  {
    'Student Name': 'Alex Rivera',
    'Email': 'alex.rivera@example.com',
    'Domain': 'Web Development',
    'Start Date': '2026-11-01',
    'End Date': '2026-12-15',
  },
  {
    'Student Name': 'Priya Patel',
    'Email': 'priya.patel@example.com',
    'Domain': 'Machine Learning',
    'Start Date': '2026-11-01',
    'End Date': '2026-12-15',
  },
  {
    'Student Name': 'Marcus Chen',
    'Email': 'marcus.chen@example.com',
    'Domain': 'UI/UX Design',
    'Start Date': '2026-11-05',
    'End Date': '2026-12-20',
  },
  {
    'Student Name': 'Sophia Rodriguez',
    'Email': 'sophia.r@example.com',
    'Domain': 'Cloud DevOps',
    'Start Date': '2026-11-05',
    'End Date': '2026-12-20',
  },
  {
    'Student Name': 'Devon Vance',
    'Email': 'devon.vance@example.com',
    'Domain': 'Data Science',
    'Start Date': '2026-11-10',
    'End Date': '2026-12-25',
  },
];

const worksheet = XLSX.utils.json_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Interns');

// Generate buffers
const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

// Write to root interns.xlsx
const rootFilePath = path.join(projectRoot, 'interns.xlsx');
fs.writeFileSync(rootFilePath, buffer);
console.log(`✅ Generated sample Excel at: ${rootFilePath}`);

// Write to public/sample-interns.xlsx for browser download
const publicFilePath = path.join(publicDir, 'sample-interns.xlsx');
fs.writeFileSync(publicFilePath, buffer);
console.log(`✅ Generated downloadable sample Excel at: ${publicFilePath}`);
