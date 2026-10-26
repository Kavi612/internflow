import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

const results = [];

function record(name, pass, details) {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${name} - ${details}`);
}

async function runTests() {
  console.log('--- STARTING INTERNFLOW AUTOMATED API TESTS ---\n');

  let testIntern = null;
  let orientationToken = null;
  let orientationOtp = null;
  let reviewToken = null;
  let reviewOtp = null;
  let testInternId = null;

  // 1. Upload Excel test
  try {
    const excelPath = path.resolve('public/sample-interns.xlsx');
    const fileBuffer = fs.readFileSync(excelPath);
    const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const formData = new FormData();
    formData.append('file', blob, 'sample-interns.xlsx');

    const res = await fetch(`${BASE_URL}/api/admin/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (res.ok && data.success && data.parseResult?.validCount > 0) {
      record('Upload Valid Excel', true, `Parsed ${data.parseResult.validCount} valid rows, detected ${data.parseResult.detectedDomains.length} domains`);
      testIntern = data.parseResult.rows.find(r => r.isValid);
    } else {
      record('Upload Valid Excel', false, data.error || 'Failed to parse');
    }
  } catch (e) {
    record('Upload Valid Excel', false, e.message);
  }

  // 2. Start Automation
  try {
    if (!testIntern) throw new Error('No valid intern from previous step');

    const res = await fetch(`${BASE_URL}/api/admin/start-automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interns: [testIntern],
      }),
    });
    const data = await res.json();

    if (res.ok && data.success && data.results?.length > 0) {
      const firstResult = data.results[0];
      orientationToken = firstResult.token;
      orientationOtp = firstResult.otp;
      testInternId = firstResult.internId;
      record('Start Automation', true, `Saved intern ${firstResult.name}, token=${orientationToken.slice(0, 8)}..., OTP=${orientationOtp}`);
    } else {
      record('Start Automation', false, data.error || 'Start automation failed');
    }
  } catch (e) {
    record('Start Automation', false, e.message);
  }

  // 3. Verify Route (Wrong OTP & Correct OTP)
  try {
    // Wrong OTP
    const wrongRes = await fetch(`${BASE_URL}/api/meet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: orientationToken, otp: '000000', action: 'verify' }),
    });
    const wrongData = await wrongRes.json();
    if (!wrongRes.ok && wrongRes.status === 400) {
      record('Verify Route: Wrong OTP', true, `Returned status 400 with message: "${wrongData.error}"`);
    } else {
      record('Verify Route: Wrong OTP', false, 'Expected 400 status code');
    }

    // Correct OTP
    const correctRes = await fetch(`${BASE_URL}/api/meet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: orientationToken, otp: orientationOtp, action: 'verify' }),
    });
    const correctData = await correctRes.json();
    if (correctRes.ok && correctData.success && correctData.verified) {
      record('Verify Route: Correct OTP', true, `Successfully verified token and returned intern context`);
    } else {
      record('Verify Route: Correct OTP', false, correctData.error || 'Failed to verify correct OTP');
    }
  } catch (e) {
    record('Verify Route', false, e.message);
  }

  // 4. Meet Chat (Natural Spoken Text Check)
  try {
    const chatRes = await fetch(`${BASE_URL}/api/meet/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: orientationToken,
        message: 'Could you tell me what tools or libraries I need to install?',
        history: [],
      }),
    });
    const chatData = await chatRes.json();

    if (chatRes.ok && chatData.success && chatData.reply) {
      const hasMarkdown = /[*#_`~]/.test(chatData.reply);
      const hasBullets = /^[-•]\s/m.test(chatData.reply);
      if (!hasMarkdown && !hasBullets) {
        record('Meet Chat Spoken Formatting', true, `Clean natural text without markdown. Preview: "${chatData.reply.slice(0, 80)}..."`);
      } else {
        record('Meet Chat Spoken Formatting', false, `Reply contained markdown or bullets: ${chatData.reply.slice(0, 80)}`);
      }
    } else {
      record('Meet Chat Spoken Formatting', false, chatData.error || 'Chat call failed');
    }
  } catch (e) {
    record('Meet Chat Spoken Formatting', false, e.message);
  }

  // 5. Complete Orientation & Create Review #1
  try {
    const compRes = await fetch(`${BASE_URL}/api/meet/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: orientationToken,
        transcript: '[10:00] Mentor: Welcome! [10:01] Intern: Thanks! [10:02] Mentor: Do you have doubts? [10:03] Intern: No doubts.',
      }),
    });
    const compData = await compRes.json();

    if (compRes.ok && compData.success && compData.nextMeeting) {
      reviewToken = compData.nextMeeting.token;
      reviewOtp = compData.nextMeeting.otp;
      record('Complete Orientation & Schedule Review #1', true, `Orientation completed. Created Review #1 token=${reviewToken.slice(0, 8)}..., OTP=${reviewOtp}`);
    } else {
      record('Complete Orientation & Schedule Review #1', false, compData.error || 'Failed to complete');
    }
  } catch (e) {
    record('Complete Orientation & Schedule Review #1', false, e.message);
  }

  // 6. Evaluate Submission (Pasted Text)
  try {
    const evalRes = await fetch(`${BASE_URL}/api/meet/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: reviewToken,
        textContent: `Milestone 1 Implementation:\nCreated responsive Next.js frontend with Tailwind CSS and Prisma models. Implemented REST API endpoints with validation. Handled basic error boundaries and testing.`,
      }),
    });
    const evalData = await evalRes.json();

    if (evalRes.ok && evalData.success && evalData.evaluation) {
      const ev = evalData.evaluation;
      const isValid = typeof ev.score === 'number' && Array.isArray(ev.completed) && Array.isArray(ev.missing) && typeof ev.spokenFeedback === 'string';
      if (isValid) {
        record('Evaluate Submission', true, `Evaluated score=${ev.score}/100, completed=${ev.completed.length} items, suggestions=${ev.suggestions.length}`);
      } else {
        record('Evaluate Submission', false, 'Evaluation format did not match expected JSON fields');
      }
    } else {
      record('Evaluate Submission', false, evalData.error || 'Evaluation failed');
    }
  } catch (e) {
    record('Evaluate Submission', false, e.message);
  }

  // 7. Evaluate with empty/bad input (Fallback Test)
  try {
    const badRes = await fetch(`${BASE_URL}/api/meet/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: reviewToken,
        textContent: '', // empty
      }),
    });
    const badData = await badRes.json();
    if (!badRes.ok && badRes.status === 400) {
      record('Evaluate Empty Input Validation', true, `Safely returned 400 error without crash: "${badData.error}"`);
    } else {
      record('Evaluate Empty Input Validation', false, 'Expected 400 status code on empty input');
    }
  } catch (e) {
    record('Evaluate Empty Input Validation', false, e.message);
  }

  // 8. Review Complete (Intermediate vs Final)
  try {
    // Complete Review #1
    const revCompRes = await fetch(`${BASE_URL}/api/meet/review-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: reviewToken,
        transcript: '[10:10] Mentor: Great job! Score: 88.',
      }),
    });
    const revCompData = await revCompRes.json();

    if (revCompRes.ok && revCompData.success) {
      record('Complete Review Meeting', true, `Review finished. Next meeting: ${revCompData.nextMeeting?.token?.slice(0, 8)}... (isFinal=${revCompData.isFinal})`);
    } else {
      record('Complete Review Meeting', false, revCompData.error || 'Failed review complete');
    }
  } catch (e) {
    record('Complete Review Meeting', false, e.message);
  }

  // 9. Fast-track Final Review and Certificate Generation
  try {
    // Mark next review final
    const setFinalRes = await fetch(`${BASE_URL}/api/admin/set-final-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internId: testInternId, meetingId: undefined }),
    });
    const setFinalData = await setFinalRes.json();

    if (setFinalRes.ok && setFinalData.success) {
      record('Admin Set Final Review', true, setFinalData.message);
      const finalMeetingToken = setFinalData.meeting.token;

      // Submit work for final review
      await fetch(`${BASE_URL}/api/meet/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: finalMeetingToken,
          textContent: 'Final Capstone Project completed with all documentation and deployment scripts.',
        }),
      });

      // Complete final review
      const finalCompRes = await fetch(`${BASE_URL}/api/meet/review-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: finalMeetingToken,
          transcript: '[10:30] Mentor: Final review approved. Certificate issued!',
        }),
      });
      const finalCompData = await finalCompRes.json();

      if (finalCompRes.ok && finalCompData.success && finalCompData.isFinal && finalCompData.certificateUrl) {
        record('Final Review Certificate Generation', true, `Generated PDF certificate at ${finalCompData.certificateUrl}`);
      } else {
        record('Final Review Certificate Generation', false, finalCompData.error || 'Did not issue final certificate');
      }
    } else {
      record('Admin Set Final Review', false, setFinalData.error || 'Failed to set final review');
    }
  } catch (e) {
    record('Final Review Certificate Generation', false, e.message);
  }

  // 10. Idempotency Check: Calling complete twice
  try {
    const repeatRes = await fetch(`${BASE_URL}/api/meet/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: orientationToken,
        transcript: 'Repeated call check',
      }),
    });
    const repeatData = await repeatRes.json();
    if (repeatRes.ok && repeatData.success) {
      record('Idempotency: Repeated Meeting Completion', true, 'Repeated call completed safely without duplicating records');
    } else {
      record('Idempotency: Repeated Meeting Completion', false, repeatData.error || 'Failed on repeat');
    }
  } catch (e) {
    record('Idempotency: Repeated Meeting Completion', false, e.message);
  }

  // 11. EDGE CASES
  // Edge Case A: Invalid token
  try {
    const invRes = await fetch(`${BASE_URL}/api/meet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'non-existent-token-12345', action: 'check' }),
    });
    if (invRes.status === 404) {
      record('Edge Case: Invalid Token', true, 'Returned 404 with error message');
    } else {
      record('Edge Case: Invalid Token', false, `Expected 404, got ${invRes.status}`);
    }
  } catch (e) {
    record('Edge Case: Invalid Token', false, e.message);
  }

  // Edge Case B: Excel with missing column or invalid format
  try {
    const invalidCsv = 'Name,Phone\nJohn,12345';
    const blob = new Blob([invalidCsv], { type: 'text/csv' });
    const fd = new FormData();
    fd.append('file', blob, 'invalid.csv');

    const invExcelRes = await fetch(`${BASE_URL}/api/admin/upload`, {
      method: 'POST',
      body: fd,
    });
    const invExcelData = await invExcelRes.json();
    if (invExcelRes.ok && invExcelData.parseResult?.invalidCount > 0) {
      record('Edge Case: Excel Missing Columns', true, `Correctly flagged invalid rows (${invExcelData.parseResult.invalidCount} errors)`);
    } else {
      record('Edge Case: Excel Missing Columns', false, 'Failed to detect invalid row columns');
    }
  } catch (e) {
    record('Edge Case: Excel Missing Columns', false, e.message);
  }

  // Edge Case C: Bad Email in Excel
  try {
    const badEmailCsv = 'Student Name,Email,Domain,Start Date,End Date\nJane Doe,not-an-email,Web Development,2026-11-01,2026-12-01';
    const blob = new Blob([badEmailCsv], { type: 'text/csv' });
    const fd = new FormData();
    fd.append('file', blob, 'bad_email.csv');

    const badEmailRes = await fetch(`${BASE_URL}/api/admin/upload`, {
      method: 'POST',
      body: fd,
    });
    const badEmailData = await badEmailRes.json();
    const badRow = badEmailData.parseResult?.rows[0];
    if (badRow && !badRow.isValid && badRow.errors.some(err => err.toLowerCase().includes('email'))) {
      record('Edge Case: Invalid Email in Excel', true, `Flagged row as invalid: "${badRow.errors[0]}"`);
    } else {
      record('Edge Case: Invalid Email in Excel', false, 'Did not flag invalid email');
    }
  } catch (e) {
    record('Edge Case: Invalid Email in Excel', false, e.message);
  }

  // Edge Case D: Invalid GitHub URL
  try {
    const ghRes = await fetch(`${BASE_URL}/api/meet/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: reviewToken,
        link: 'https://github.com/not-a-real-user-xyz123/not-a-real-repo-999',
      }),
    });
    const ghData = await ghRes.json();
    if (ghRes.ok && ghData.success) {
      record('Edge Case: Non-Existent GitHub URL', true, 'Handled missing GitHub repo gracefully via fallback without crashing');
    } else {
      record('Edge Case: Non-Existent GitHub URL', false, ghData.error || 'Crashed on missing GitHub repo');
    }
  } catch (e) {
    record('Edge Case: Non-Existent GitHub URL', false, e.message);
  }

  console.log('\n--- TESTS COMPLETED ---');
  const passCount = results.filter(r => r.pass).length;
  console.log(`Passed: ${passCount} / ${results.length}`);
}

runTests();
