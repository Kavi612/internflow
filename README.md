# InternFlow ⚡

**InternFlow** is an autonomous AI internship review automation system that completely replaces manual human task assignment, progress reviews, and meeting assessments. Everything, including the voice meetings, work evaluations, and certificate issuance, runs directly inside this web application.

---

## 🚀 Complete 3-Phase Architecture

- **Phase 1: Foundation & Onboarding**:
  - SQLite database managed by Prisma 6 ORM.
  - Excel roster parsing and validation via SheetJS (`xlsx`).
  - Automated domain curriculum & task template generation via Google Gemini API (`GEMINI_MODEL`) with offline domain fallbacks.
  - Congratulations & Orientation email dispatch with meeting tokens & 6-digit OTPs (Nodemailer Gmail SMTP or Console Mock Logger).
  - Background minute-by-minute `node-cron` automation engine.

- **Phase 2: In-App Voice Orientation Meeting**:
  - Secure room verification at `/meet/[token]` with countdown waiting screen and 6-digit OTP validation.
  - Call-style meeting UI with dynamic audio-reactive **Voice Orb**, live transcript panel, mic button, and text input fallback.
  - Web Speech API integration (`SpeechRecognition` for intern listening with interruption cancellation, `speechSynthesis` for mentor voice).
  - Conversational orientation guidance and doubt answering.
  - Automatic review meeting creation and scheduling.

- **Phase 3: Work Submission, AI Evaluation & Certificate**:
  - Multimodal work submission panel: GitHub repository parsing (fetches README & file tree via GitHub public API), PDF parsing (`pdf-parse`), Word DOCX parsing (`mammoth`), and pasted code.
  - Strict JSON evaluation with Gemini: score (0-100), completed checklist, missing checklist, mentor suggestions, spoken feedback (6-10 natural sentences), and short email feedback.
  - Spoken mentor feedback with doubt Q&A loop.
  - Automated weekly review cycle scheduling and email dispatch.
  - Automated PDF Certificate generation with `pdf-lib` (landscape layout, tenure verification, score, and academic seal) delivered upon final review completion.
  - Admin timeline dashboard with full transcripts, submissions, evaluation scores, and an interactive **"Resend Email"** button.

---

## ⚙️ Environment Configuration

Ensure your `.env` contains:

```env
# Nodemailer (Gmail SMTP)
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="your-app-password"

# Gemini LLM
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-1.5-flash"

# Application Settings
APP_BASE_URL="http://localhost:3000"

# Testing / Mode toggles
DEMO_MODE="true"
MOCK_EMAIL="true"

# Database (Prisma + SQLite)
DATABASE_URL="file:./dev.db"
```

> **Note**: In `DEMO_MODE="true"` and `MOCK_EMAIL="true"`, scheduled meetings occur within a few minutes, emails are logged to the console, and certificates are saved to `public/certificates/` and `/certificates/`.

---

## 🏃 Quick Start

```bash
# Push database schema & generate Prisma client
npm run prisma:push

# Launch development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on **Google Chrome** for full Web Speech API voice support.

---

## 🧪 Full DEMO_MODE Walkthrough (Step-by-Step)

Follow this sequence to test the entire lifecycle from onboarding to final certificate issuance:

### 1. Upload Excel Roster & Launch Onboarding
1. Navigate to [http://localhost:3000/admin](http://localhost:3000/admin).
2. Click **Download Sample Excel** to get `interns.xlsx` (or use the one in the project root).
3. Drag and drop `interns.xlsx` into the upload dropzone.
4. Verify the preview table shows all valid rows.
5. Click **Confirm & Start Automation**:
   - Interns and orientation meetings are created in SQLite.
   - Congratulations emails (with meeting tokens and 6-digit OTPs) are dispatched/mock-logged.
   - Note the **6-Digit OTP** displayed in the results table for your intern (e.g. `Alex Rivera`).

### 2. Conduct the Orientation Meeting
1. In the results table, click **Join Room →** (or navigate to `/meet/[token]`).
2. Enter the 6-digit OTP from Step 1 and click **Join Orientation Call**.
3. Allow microphone permissions in Chrome.
4. The AI Mentor greets the intern by name, speaks the task guidelines aloud with the pulsing Voice Orb, and asks: *"Do you have any doubts?"*.
5. Speak or type a question (e.g., *"What deliverables are expected?"*).
6. The mentor answers in context of the assigned project.
7. Say or type: *"No doubts, all good"*.
8. The mentor wraps up warmly, announces the first review date, and marks the meeting completed.
9. A completion modal appears showing the **Review #1 Meeting Link** and a new **6-digit OTP**. Check the terminal console to see the `[MOCK EMAIL DISPATCHED] Review #1 Schedule` log.

### 3. Conduct the Review Meeting & AI Work Evaluation
1. Click the Review meeting link (or access it from the admin timeline).
2. Enter the new 6-digit OTP for the review meeting.
3. The AI Mentor welcomes the intern back, recalls their project, and prompts them to submit their work.
4. In the **Work Submission Panel**:
   - **Option A (GitHub)**: Enter a public GitHub repo URL (e.g., `https://github.com/facebook/react`).
   - **Option B (File Upload)**: Upload a sample `.pdf`, `.docx`, or `.txt` file.
   - **Option C (Pasted Text)**: Paste source code or milestone implementation notes.
5. Click **Submit for Evaluation**:
   - The Voice Orb enters thinking mode while Gemini analyzes the submission against the deliverables.
   - Gemini returns structured JSON: score, completed items, missing items, and mentor suggestions.
   - The AI Mentor **speaks the spoken feedback aloud** and asks: *"Do you have any questions about this feedback?"*.
6. Ask a question about the suggestions or say: *"No questions, thank you"*.
7. The mentor concludes the review and marks the meeting completed.

### 4. Test Final Review & Certificate Generation Flow
To quickly trigger the certificate flow in DEMO_MODE:
1. Go to [http://localhost:3000/admin](http://localhost:3000/admin) and click **Tab 2: Interns Timeline & Review Records**.
2. Expand your intern's timeline card.
3. In the DEMO MODE banner, click **⚡ Make Next Review the Final One**.
4. Click **Enter Room →** for the pending Review meeting.
5. Enter the OTP, submit work, and let the mentor deliver feedback.
6. When the mentor asks for questions, say *"No, all clear"*.
7. The mentor announces that this was the final review and that their **Certificate of Completion** is ready!
8. A modal appears with a **Download Certificate PDF** button.
9. The PDF certificate generated by `pdf-lib` is saved to `public/certificates/` and attached to the closing congratulations email.

### 5. Inspect Timeline & Resend Emails
1. In [http://localhost:3000/admin](http://localhost:3000/admin) under **Tab 2**:
   - Click **Transcript** on any meeting to inspect the full conversation transcript.
   - View submitted links, files, and score badges (`/100`).
   - Inspect the **Dispatched Email Logs** table and click **Resend Email** on any entry to test the resend functionality.
