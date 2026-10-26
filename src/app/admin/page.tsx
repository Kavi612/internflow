'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface ParsedInternRow {
  rowNumber: number;
  name: string;
  email: string;
  domain: string;
  startDate: string;
  endDate: string;
  startDateFormatted: string;
  endDateFormatted: string;
  isValid: boolean;
  errors: string[];
}

interface DomainStatus {
  domain: string;
  exists: boolean;
  template?: {
    id: string;
    domain: string;
    title: string;
    description: string;
    deliverables: string;
    orientationNotes: string;
  };
  previewTemplate?: {
    domain: string;
    title: string;
    description: string;
    deliverables: string;
    orientationNotes: string;
  };
}

interface AutomationResult {
  internId: string;
  name: string;
  email: string;
  domain: string;
  meetingId: string;
  token: string;
  otp: string;
  scheduledAt: string;
  meetingLink: string;
  emailStatus: string;
  hasSentEmail?: boolean;
}

interface DbIntern {
  id: string;
  name: string;
  email: string;
  domain: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  meetings: Array<{
    id: string;
    type: string;
    token: string;
    otp: string;
    scheduledAt: string;
    status: string;
    transcript?: string;
    reviewNumber?: number;
    isFinalReview: boolean;
    submissions: Array<{
      id: string;
      link?: string;
      fileName?: string;
      rawContent?: string;
      createdAt: string;
    }>;
    evaluations: Array<{
      id: string;
      score: number;
      completed: string;
      missing: string;
      suggestions: string;
      spokenFeedback: string;
      emailFeedback: string;
      createdAt: string;
    }>;
  }>;
  emailLogs: Array<{
    id: string;
    to: string;
    subject: string;
    emailType: string;
    status: string;
    sentAt: string;
  }>;
}

export default function AdminPage() {
  const [activeMainTab, setActiveMainTab] = useState<'upload' | 'interns'>('upload');

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parseResult, setParseResult] = useState<{
    fileName: string;
    totalCount: number;
    validCount: number;
    invalidCount: number;
    rows: ParsedInternRow[];
    detectedDomains: string[];
  } | null>(null);
  const [domainStatus, setDomainStatus] = useState<DomainStatus[]>([]);
  const [activeValidationTab, setActiveValidationTab] = useState<'all' | 'valid' | 'invalid'>('all');

  // Automation state
  const [isStartingAutomation, setIsStartingAutomation] = useState(false);
  const [automationComplete, setAutomationComplete] = useState(false);
  const [automationResults, setAutomationResults] = useState<AutomationResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Editing Template State
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    deliverables: '',
    orientationNotes: '',
  });

  // Interns Timeline State
  const [dbInterns, setDbInterns] = useState<DbIntern[]>([]);
  const [isLoadingInterns, setIsLoadingInterns] = useState(false);
  const [expandedInternId, setExpandedInternId] = useState<string | null>(null);
  const [viewingTranscript, setViewingTranscript] = useState<{ title: string; content: string } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Cron state
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [cronOutput, setCronOutput] = useState<string | null>(null);

  // Per-intern start button & email states
  const [startingInternIds, setStartingInternIds] = useState<Record<string, boolean>>({});
  const [startErrors, setStartErrors] = useState<Record<string, string>>({});
  const [sentInternIds, setSentInternIds] = useState<Record<string, boolean>>({});
  const [isStartingAll, setIsStartingAll] = useState(false);
  const [startAllProgress, setStartAllProgress] = useState<{ total: number; current: number } | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{
    status: 'idle' | 'testing' | 'sent' | 'error';
    message?: string;
    error?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch interns timeline
  const fetchInterns = async () => {
    setIsLoadingInterns(true);
    try {
      const res = await fetch('/api/admin/interns');
      const data = await res.json();
      if (data.success) {
        setDbInterns(data.interns || []);
        if (data.interns && data.interns.length > 0 && !expandedInternId) {
          setExpandedInternId(data.interns[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingInterns(false);
    }
  };

  // Sync on mount and tab switch
  useEffect(() => {
    fetchInterns();
  }, []);

  useEffect(() => {
    if (activeMainTab === 'interns') {
      fetchInterns();
    }
  }, [activeMainTab]);

  // Determine if congratulations email has been sent from DB
  const isCongratulationsSent = (intern: DbIntern): boolean => {
    if (sentInternIds[intern.id]) return true;
    return (
      intern.emailLogs?.some(
        (log) => log.emailType === 'CONGRATULATIONS' && (log.status === 'SENT' || log.status === 'MOCKED')
      ) || false
    );
  };

  const isResultSent = (r: AutomationResult): boolean => {
    if (sentInternIds[r.internId]) return true;
    if (r.hasSentEmail) return true;
    const found = dbInterns.find((i) => i.id === r.internId);
    if (found) {
      return isCongratulationsSent(found);
    }
    return false;
  };

  // Start single intern (send congratulations email)
  const handleStartIntern = async (internId: string): Promise<boolean> => {
    setStartingInternIds((prev) => ({ ...prev, [internId]: true }));
    setStartErrors((prev) => {
      const updated = { ...prev };
      delete updated[internId];
      return updated;
    });

    try {
      const res = await fetch('/api/admin/start-intern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch congratulations email.');
      }

      setSentInternIds((prev) => ({ ...prev, [internId]: true }));
      setAutomationResults((prev) =>
        prev.map((r) =>
          r.internId === internId ? { ...r, hasSentEmail: true, emailStatus: data.emailStatus || 'SENT' } : r
        )
      );

      // Refresh DB state
      await fetchInterns();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStartErrors((prev) => ({ ...prev, [internId]: msg }));
      return false;
    } finally {
      setStartingInternIds((prev) => ({ ...prev, [internId]: false }));
    }
  };

  // Start all pending interns with 1-second gap
  const handleStartAll = async (pendingInterns: Array<{ internId: string }>) => {
    if (pendingInterns.length === 0 || isStartingAll) return;

    setIsStartingAll(true);
    setStartAllProgress({ total: pendingInterns.length, current: 0 });

    for (let i = 0; i < pendingInterns.length; i++) {
      const item = pendingInterns[i];
      setStartAllProgress({ total: pendingInterns.length, current: i });

      await handleStartIntern(item.internId);

      setStartAllProgress({ total: pendingInterns.length, current: i + 1 });

      if (i < pendingInterns.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setIsStartingAll(false);
    setStartAllProgress(null);
    await fetchInterns();
  };

  // Test SMTP Email configuration
  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    setTestEmailResult({ status: 'testing' });
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestEmailResult({
          status: 'error',
          error: data.error || 'Failed to send test email',
        });
      } else {
        setTestEmailResult({
          status: 'sent',
          message: data.message || 'sent',
        });
        setActionNotice('Test email was sent successfully to GMAIL_USER.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestEmailResult({
        status: 'error',
        error: msg,
      });
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Handle file selection
  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsUploading(true);
    setStatusMessage('Parsing Excel spreadsheet and validating columns...');
    setAutomationComplete(false);
    setAutomationResults([]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse Excel file');
      }

      setParseResult(data.parseResult);
      setDomainStatus(data.domainStatus || []);
      setStatusMessage(
        `Parsed ${data.parseResult.totalCount} rows (${data.parseResult.validCount} valid, ${data.parseResult.invalidCount} invalid).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error: ${msg}`);
      alert(`Upload Error: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Open Template Editor
  const openEditModal = (item: DomainStatus) => {
    const t = item.template || item.previewTemplate;
    if (t) {
      setEditingDomain(item.domain);
      setEditFormData({
        title: t.title,
        description: t.description,
        deliverables: t.deliverables,
        orientationNotes: t.orientationNotes,
      });
    }
  };

  // Save Template Changes
  const saveTemplateChanges = () => {
    if (!editingDomain) return;

    setDomainStatus((prev) =>
      prev.map((item) => {
        if (item.domain === editingDomain) {
          return {
            ...item,
            template: {
              id: item.template?.id || 'temp-id',
              domain: editingDomain,
              ...editFormData,
            },
            previewTemplate: {
              domain: editingDomain,
              ...editFormData,
            },
          };
        }
        return item;
      })
    );

    setEditingDomain(null);
  };

  // Start Automation
  const handleStartAutomation = async () => {
    if (!parseResult || parseResult.validCount === 0) {
      alert('No valid intern rows found to automate.');
      return;
    }

    const validInterns = parseResult.rows.filter((r) => r.isValid);
    setIsStartingAutomation(true);
    setStatusMessage('Saving intern records and scheduling orientation sessions in database...');

    try {
      const customTemplates: Record<string, typeof editFormData> = {};
      domainStatus.forEach((ds) => {
        const t = ds.template || ds.previewTemplate;
        if (t) {
          customTemplates[ds.domain] = {
            title: t.title,
            description: t.description,
            deliverables: t.deliverables,
            orientationNotes: t.orientationNotes,
          };
        }
      });

      const res = await fetch('/api/admin/start-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interns: validInterns,
          customTemplates,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Automation failed');
      }

      setAutomationResults(data.results || []);
      setAutomationComplete(true);
      fetchInterns();
      setStatusMessage(`Success! Prepared onboarding for ${data.count} intern(s). Ready to dispatch emails.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Automation Error: ${msg}`);
      alert(`Automation Error: ${msg}`);
    } finally {
      setIsStartingAutomation(false);
    }
  };

  // Trigger manual Cron sweep
  const handleTriggerCron = async () => {
    setIsCronRunning(true);
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      setCronOutput(JSON.stringify(data.sweep, null, 2));
    } catch (err) {
      setCronOutput(`Cron sweep failed: ${err}`);
    } finally {
      setIsCronRunning(false);
    }
  };

  // Action: Make next review the final one (DEMO_MODE helper)
  const handleMakeFinalReview = async (internId: string) => {
    try {
      const res = await fetch('/api/admin/set-final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice(data.message);
        fetchInterns();
      } else {
        alert(data.error || 'Failed to update review status.');
      }
    } catch (e) {
      alert('Request error: ' + e);
    }
  };

  // Action: Resend logged email
  const handleResendEmail = async (emailLogId: string) => {
    try {
      const res = await fetch('/api/admin/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailLogId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice(data.message);
        fetchInterns();
      } else {
        alert(data.error || 'Failed to resend email.');
      }
    } catch (e) {
      alert('Resend error: ' + e);
    }
  };

  const filteredRows = parseResult?.rows.filter((r) => {
    if (activeValidationTab === 'valid') return r.isValid;
    if (activeValidationTab === 'invalid') return !r.isValid;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Internship Automation Dashboard</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Phases 1-3 Active
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Upload student cohorts, auto-generate tasks, conduct voice meetings, evaluate submissions, and issue PDF certificates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTestEmail}
            disabled={isTestingEmail}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/50 text-purple-300 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            title="Send a plain test email to GMAIL_USER to verify SMTP credentials"
          >
            {isTestingEmail ? (
              <>
                <div className="w-2.5 h-2.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                <span>Sending test email...</span>
              </>
            ) : (
              <>
                <span>✉</span>
                <span>Send test email</span>
              </>
            )}
          </button>

          <button
            onClick={handleTriggerCron}
            disabled={isCronRunning}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors flex items-center space-x-2"
          >
            <span className={`w-2 h-2 rounded-full ${isCronRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
            <span>{isCronRunning ? 'Running...' : 'Run Cron Sweep'}</span>
          </button>

          <a
            href="/sample-interns.xlsx"
            download
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 transition-colors flex items-center space-x-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Sample Excel</span>
          </a>
        </div>
      </div>

      {/* Test Email Result Banner */}
      {testEmailResult && (
        <div
          className={`mt-4 p-4 rounded-xl border text-xs font-sans flex items-start justify-between ${
            testEmailResult.status === 'sent'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : testEmailResult.status === 'testing'
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="space-y-1">
            <div className="font-bold flex items-center space-x-2">
              <span>Nodemailer Test Email:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  testEmailResult.status === 'sent'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : testEmailResult.status === 'testing'
                    ? 'bg-indigo-500/20 text-indigo-400 animate-pulse'
                    : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {testEmailResult.status === 'sent'
                  ? 'sent'
                  : testEmailResult.status === 'testing'
                  ? 'sending...'
                  : 'failed'}
              </span>
            </div>
            {testEmailResult.status === 'sent' && (
              <p className="text-slate-200">
                &check; Plain test email was sent successfully to GMAIL_USER via smtp.gmail.com:465.
              </p>
            )}
            {testEmailResult.error && (
              <div>
                <p className="text-rose-300 font-mono break-words">{testEmailResult.error}</p>
                <p className="text-[11px] text-amber-300/90 mt-1">
                  Note: If credentials are missing or you just updated .env, restart the dev server (Ctrl+C then npm run dev) to load the new values.
                </p>
              </div>
            )}
          </div>

          <button onClick={() => setTestEmailResult(null)} className="text-slate-400 hover:text-white font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <span>&check; {actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-emerald-500 hover:text-white font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {cronOutput && (
        <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400 relative">
          <button onClick={() => setCronOutput(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
            &times;
          </button>
          <div className="font-bold text-slate-300 mb-1">Latest Cron Sweep Result:</div>
          <pre className="overflow-x-auto">{cronOutput}</pre>
        </div>
      )}

      {/* Primary Dashboard Navigation Tabs */}
      <div className="flex border-b border-slate-800 mt-6 space-x-6">
        <button
          onClick={() => setActiveMainTab('upload')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-2 ${
            activeMainTab === 'upload'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>1. Excel Upload & Task Generator</span>
        </button>

        <button
          onClick={() => setActiveMainTab('interns')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-2 ${
            activeMainTab === 'interns'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>2. Interns Timeline & Review Records</span>
          {dbInterns.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
              {dbInterns.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: EXCEL UPLOAD & AUTOMATION */}
      {activeMainTab === 'upload' && (
        <div className="mt-6 space-y-8">
          {/* Step 1: Upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span>Upload Student Roster (Excel)</span>
              </h2>
              <span className="text-xs text-slate-400">Columns: Student Name, Email, Domain, Start Date, End Date</span>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileChange(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-2xl p-7 text-center cursor-pointer bg-slate-900/40 hover:bg-slate-900/80 transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <p className="mt-3 text-sm font-semibold text-slate-200">
                {file ? file.name : 'Click to select or drag and drop your Excel roster file'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                SheetJS normalizes headers, serial numbers, and validates email formats automatically.
              </p>

              {isUploading && (
                <div className="mt-3 flex items-center justify-center space-x-2 text-indigo-400 text-xs">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>Parsing roster and analyzing dates...</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Validation Preview Table */}
          {parseResult && (
            <div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <span>Validation & Preview Table</span>
                  </h2>
                </div>

                <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800 text-xs">
                  <button
                    onClick={() => setActiveValidationTab('all')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      activeValidationTab === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({parseResult.totalCount})
                  </button>
                  <button
                    onClick={() => setActiveValidationTab('valid')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      activeValidationTab === 'valid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Valid ({parseResult.validCount})
                  </button>
                  {parseResult.invalidCount > 0 && (
                    <button
                      onClick={() => setActiveValidationTab('invalid')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors ${
                        activeValidationTab === 'invalid' ? 'bg-rose-600 text-white' : 'text-rose-400 hover:text-white'
                      }`}
                    >
                      Errors ({parseResult.invalidCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-4 py-2.5">Student Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Domain</th>
                      <th className="px-4 py-2.5">Start Date</th>
                      <th className="px-4 py-2.5">End Date</th>
                      <th className="px-4 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                    {filteredRows?.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 text-slate-500">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 font-sans font-medium text-slate-100">{row.name}</td>
                        <td className="px-4 py-2.5 text-slate-300">{row.email}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {row.domain}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{row.startDateFormatted}</td>
                        <td className="px-4 py-2.5 text-slate-400">{row.endDateFormatted}</td>
                        <td className="px-4 py-2.5 text-right font-sans">
                          {row.isValid ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              &check; Ready
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30" title={row.errors.join(' ')}>
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Domain Task Templates */}
          {domainStatus.length > 0 && (
            <div>
              <div className="mb-3">
                <h2 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                  <span>Domain Task Templates (Generated & Editable)</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {domainStatus.map((item) => {
                  const t = item.template || item.previewTemplate;
                  return (
                    <div key={item.domain} className="glass-panel p-4 rounded-xl border border-slate-800">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-1.5">
                            {item.domain}
                          </span>
                          <h4 className="text-sm font-bold text-slate-100">{t?.title}</h4>
                        </div>
                        <button
                          onClick={() => openEditModal(item)}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        >
                          Edit
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">{t?.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirm Automation Button */}
          {parseResult && parseResult.validCount > 0 && !automationComplete && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-white">Save Interns & Schedule Orientation</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Saves {parseResult.validCount} intern(s) and creates their ORIENTATION meetings. Emails are NOT sent until you click Start or Start All.
                </p>
              </div>

              <button
                onClick={handleStartAutomation}
                disabled={isStartingAutomation}
                className="w-full md:w-auto px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg text-sm shrink-0 disabled:opacity-50"
              >
                {isStartingAutomation ? 'Saving...' : 'Confirm & Start Automation'}
              </button>
            </div>
          )}

          {/* Results table if completed */}
          {automationComplete && (
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                    <span className="text-emerald-400">&check;</span>
                    <span>Interns Saved & Orientation Meetings Scheduled</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click Start to send an intern&apos;s congratulations email, or click Start All to dispatch with a 1-second interval.
                  </p>
                </div>

                {(() => {
                  const pending = automationResults.filter((r) => !isResultSent(r));
                  return (
                    <div className="flex items-center space-x-3 shrink-0">
                      {startAllProgress && (
                        <span className="text-xs text-amber-400 font-mono font-medium animate-pulse">
                          {startAllProgress.current} of {startAllProgress.total} sent
                        </span>
                      )}
                      <button
                        onClick={() => handleStartAll(pending)}
                        disabled={isStartingAll || pending.length === 0}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-md flex items-center space-x-2"
                      >
                        {isStartingAll ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>
                              {startAllProgress
                                ? `${startAllProgress.current} of ${startAllProgress.total} sent`
                                : 'Sending...'}
                            </span>
                          </>
                        ) : (
                          <span>Start All ({pending.length} pending)</span>
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300 font-mono">
                  <thead className="bg-slate-950 uppercase text-[10px] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Student</th>
                      <th className="px-3 py-2">Domain</th>
                      <th className="px-3 py-2">OTP</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {automationResults.map((r) => {
                      const isSent = isResultSent(r);
                      const isStarting = !!startingInternIds[r.internId];
                      const error = startErrors[r.internId];

                      return (
                        <tr key={r.internId} className="hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-sans font-medium text-white">{r.name}</td>
                          <td className="px-3 py-2 text-indigo-400">{r.domain}</td>
                          <td className="px-3 py-2 text-emerald-400 font-bold">{r.otp}</td>
                          <td className="px-3 py-2 font-sans">
                            {isSent ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                SENT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                NOT SENT
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-sans">
                            <div className="flex flex-col items-end">
                              {isSent ? (
                                <Link
                                  href={`/meet/${r.token}`}
                                  className="inline-block px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition-colors"
                                >
                                  Join Room &rarr;
                                </Link>
                              ) : (
                                <button
                                  onClick={() => handleStartIntern(r.internId)}
                                  disabled={isStarting || isStartingAll}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors flex items-center space-x-1.5"
                                >
                                  {isStarting && (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  )}
                                  <span>{isStarting ? 'Sending...' : 'Start'}</span>
                                </button>
                              )}
                              {error && (
                                <p className="text-[11px] text-rose-400 mt-1 max-w-[220px] text-right font-sans">
                                  {error}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERNS TIMELINE & REVIEW RECORDS */}
      {activeMainTab === 'interns' && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-200">Enrolled Interns Lifecycle & Evaluation Timeline</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Track each intern&apos;s meetings, submission evaluations, and email dispatches.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {(() => {
                const pending = dbInterns
                  .filter((i) => !isCongratulationsSent(i))
                  .map((i) => ({ internId: i.id }));
                if (pending.length === 0) return null;
                return (
                  <button
                    onClick={() => handleStartAll(pending)}
                    disabled={isStartingAll}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm flex items-center space-x-1.5"
                  >
                    {isStartingAll ? (
                      <>
                        <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>
                          {startAllProgress
                            ? `${startAllProgress.current} of ${startAllProgress.total} sent`
                            : 'Sending...'}
                        </span>
                      </>
                    ) : (
                      <span>Start All ({pending.length} pending)</span>
                    )}
                  </button>
                );
              })()}

              <button
                onClick={fetchInterns}
                disabled={isLoadingInterns}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
              >
                {isLoadingInterns ? 'Refreshing...' : 'Refresh Timeline'}
              </button>
            </div>
          </div>

          {dbInterns.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl text-center border-slate-800 text-slate-400 text-sm">
              No interns found yet. Switch to Tab 1 to upload an Excel file and start automation.
            </div>
          ) : (
            <div className="space-y-4">
              {dbInterns.map((intern) => {
                const isExpanded = expandedInternId === intern.id;
                const completedMeetingCount = intern.meetings.filter((m) => m.status === 'COMPLETED').length;
                const latestEvaluation = intern.meetings
                  .flatMap((m) => m.evaluations)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                return (
                  <div key={intern.id} className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
                    {/* Intern Header Row */}
                    <div
                      onClick={() => setExpandedInternId(isExpanded ? null : intern.id)}
                      className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-sm">
                          {intern.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-white text-sm">{intern.name}</h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {intern.domain}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                intern.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {intern.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{intern.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 text-xs font-mono">
                        {latestEvaluation && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                            Score: {Math.round(latestEvaluation.score)}/100
                          </span>
                        )}

                        <span className="text-slate-400">
                          {completedMeetingCount}/{intern.meetings.length} Meetings Done
                        </span>

                        <span className="text-slate-500 font-sans text-xs">
                          {isExpanded ? 'Collapse ▲' : 'Expand Timeline ▼'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Timeline Content */}
                    {isExpanded && (
                      <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-6">
                        {/* DEMO_MODE Fast Action: Make Next Review Final */}
                        <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-indigo-300">DEMO MODE Fast-Track:</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Configure this intern&apos;s next review meeting as the Final Review with automated PDF Certificate generation.
                            </p>
                          </div>
                          <button
                            onClick={() => handleMakeFinalReview(intern.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shrink-0 shadow-md transition-colors"
                          >
                            ⚡ Make Next Review the Final One
                          </button>
                        </div>

                        {/* Meetings Timeline */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                            Meetings Progression Timeline
                          </h4>

                          <div className="space-y-3 font-sans text-xs">
                            {intern.meetings.map((m, idx) => (
                              <div
                                key={m.id}
                                className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-white text-xs">
                                      {m.type === 'ORIENTATION' ? '1. Orientation Session' : `2.${idx} Review #${m.reviewNumber || 1}`}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                        m.status === 'COMPLETED'
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      }`}
                                    >
                                      {m.status}
                                    </span>
                                    {m.isFinalReview && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        FINAL
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    Scheduled: {new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    {' • '}OTP: <span className="text-emerald-400 font-bold">{m.otp}</span>
                                  </div>

                                  {/* Submissions in this meeting */}
                                  {m.submissions.length > 0 && (
                                    <div className="text-[11px] text-slate-300 pt-1">
                                      <span className="font-semibold text-slate-400">Submission: </span>
                                      {m.submissions[0].link ? (
                                        <a href={m.submissions[0].link} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                                          {m.submissions[0].link}
                                        </a>
                                      ) : (
                                        <span>{m.submissions[0].fileName || 'Pasted text code'}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Evaluation in this meeting */}
                                  {m.evaluations.length > 0 && (
                                    <div className="text-[11px] text-slate-300 pt-1">
                                      <span className="font-bold text-emerald-400 font-mono mr-2">
                                        Score: {Math.round(m.evaluations[0].score)}/100
                                      </span>
                                      <span className="text-slate-400 line-clamp-1">{m.evaluations[0].emailFeedback}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2 shrink-0">
                                  {m.transcript && (
                                    <button
                                      onClick={() =>
                                        setViewingTranscript({
                                          title: `${intern.name} - ${m.type} Transcript`,
                                          content: m.transcript || '',
                                        })
                                      }
                                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700"
                                    >
                                      Transcript
                                    </button>
                                  )}

                                  {m.status !== 'COMPLETED' ? (
                                    m.type === 'ORIENTATION' && !isCongratulationsSent(intern) ? (
                                      <div className="flex flex-col items-end">
                                        <button
                                          onClick={() => handleStartIntern(intern.id)}
                                          disabled={startingInternIds[intern.id] || isStartingAll}
                                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold shadow-sm flex items-center space-x-1.5 transition-colors"
                                        >
                                          {startingInternIds[intern.id] && (
                                            <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          )}
                                          <span>{startingInternIds[intern.id] ? 'Sending...' : 'Start'}</span>
                                        </button>
                                        {startErrors[intern.id] && (
                                          <p className="text-[10px] text-rose-400 mt-1 max-w-[200px] text-right font-sans">
                                            {startErrors[intern.id]}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <Link
                                        href={`/meet/${m.token}`}
                                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-sm transition-colors"
                                      >
                                        Join Room &rarr;
                                      </Link>
                                    )
                                  ) : (
                                    <span className="text-emerald-400 text-xs font-semibold px-2">Completed</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Certificate Check */}
                        {intern.status === 'COMPLETED' && (
                          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/40 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                                Official Certificate of Completion
                              </span>
                              <span className="text-xs text-slate-300">
                                Program completed with verified deliverables and evaluation records.
                              </span>
                            </div>
                            <a
                              href={`/certificates/${intern.name.replace(/[^a-zA-Z0-9]/g, '_')}_${intern.domain.replace(/[^a-zA-Z0-9]/g, '_')}_Certificate.pdf`}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-colors"
                            >
                              Download PDF
                            </a>
                          </div>
                        )}

                        {/* Email Logs & Resend Action */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                            Dispatched Email Logs & Resend
                          </h4>

                          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
                            <table className="w-full text-left text-xs font-mono text-slate-300">
                              <thead className="bg-slate-950 uppercase text-[10px] text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="px-3 py-2">Type</th>
                                  <th className="px-3 py-2">Subject</th>
                                  <th className="px-3 py-2">Sent Time</th>
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800">
                                {intern.emailLogs.map((log) => (
                                  <tr key={log.id} className="hover:bg-slate-800/40">
                                    <td className="px-3 py-2 font-sans font-semibold text-indigo-400">{log.emailType}</td>
                                    <td className="px-3 py-2 font-sans text-slate-200 truncate max-w-[240px]">{log.subject}</td>
                                    <td className="px-3 py-2 text-slate-400">
                                      {new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                        {log.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-sans">
                                      <button
                                        onClick={() => handleResendEmail(log.id)}
                                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700"
                                      >
                                        Resend Email
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Transcript Inspection Modal */}
      {viewingTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">{viewingTranscript.title}</h3>
              <button onClick={() => setViewingTranscript(null)} className="text-slate-400 hover:text-white font-bold text-lg">
                &times;
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
              {viewingTranscript.content}
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setViewingTranscript(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Editing Modal */}
      {editingDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                Edit Task Template for <span className="text-indigo-400">{editingDomain}</span>
              </h3>
              <button onClick={() => setEditingDomain(null)} className="text-slate-400 hover:text-white font-bold text-lg">
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-3 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Title</label>
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Deliverables</label>
                <textarea
                  rows={3}
                  value={editFormData.deliverables}
                  onChange={(e) => setEditFormData({ ...editFormData, deliverables: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Spoken Orientation Script</label>
                <textarea
                  rows={3}
                  value={editFormData.orientationNotes}
                  onChange={(e) => setEditFormData({ ...editFormData, orientationNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button onClick={() => setEditingDomain(null)} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300">
                Cancel
              </button>
              <button onClick={saveTemplateChanges} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
