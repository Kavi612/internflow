'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import VoiceOrb from '@/components/VoiceOrb';

interface TranscriptItem {
  id: string;
  role: 'mentor' | 'intern';
  text: string;
  timestamp: string;
}

interface InternProfile {
  id: string;
  name: string;
  email: string;
  domain: string;
}

interface TaskTemplateData {
  title: string;
  description: string;
  deliverables: string;
  orientationNotes: string;
}

interface EvaluationData {
  id?: string;
  score: number;
  completed: string[];
  missing: string[];
  suggestions: string[];
  spokenFeedback: string;
  emailFeedback: string;
}

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  // Screen stages: 'loading' | 'invalid_token' | 'waiting_countdown' | 'otp_entry' | 'in_call'
  const [stage, setStage] = useState<'loading' | 'invalid_token' | 'waiting_countdown' | 'otp_entry' | 'in_call'>('loading');

  // Verification & Countdown state
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [scheduledAtFormatted, setScheduledAtFormatted] = useState<string>('');

  // Meeting metadata
  const [meetingType, setMeetingType] = useState<'ORIENTATION' | 'REVIEW'>('ORIENTATION');
  const [reviewNumber, setReviewNumber] = useState<number>(1);
  const [isFinalReview, setIsFinalReview] = useState<boolean>(false);

  // Intern & Meeting context
  const [intern, setIntern] = useState<InternProfile | null>(null);
  const [taskTemplate, setTaskTemplate] = useState<TaskTemplateData | null>(null);
  const [reviewDatePreview, setReviewDatePreview] = useState<string>('');

  // Call runtime state
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isBotSpeaking, setIsBotSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Connecting with your AI Mentor...');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [textInput, setTextInput] = useState<string>('');
  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Review & Submission state
  const [activeSubmitTab, setActiveSubmitTab] = useState<'link' | 'file' | 'text'>('link');
  const [submitLink, setSubmitLink] = useState<string>('');
  const [submitText, setSubmitText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);

  // Completion state
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [nextReviewData, setNextReviewData] = useState<{
    token: string;
    otp: string;
    scheduledAt: string;
    link: string;
  } | null>(null);

  // Web Speech refs
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const isListeningRef = useRef<boolean>(false);
  const isBotSpeakingRef = useRef<boolean>(false);
  const callDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedCallRef = useRef<boolean>(false);

  // Sync refs with state
  isListeningRef.current = isListening;
  isBotSpeakingRef.current = isBotSpeaking;

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Step 1: Validate Token on Mount
  useEffect(() => {
    if (!token) return;

    async function checkToken() {
      try {
        const res = await fetch('/api/meet/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'check' }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMessage(data.error || 'Invalid or expired meeting token.');
          setStage('invalid_token');
          return;
        }

        setMeetingType(data.type || 'ORIENTATION');

        if (data.isWaiting && data.secondsUntilScheduled > 0) {
          setCountdownSeconds(data.secondsUntilScheduled);
          setScheduledAtFormatted(
            new Date(data.scheduledAt).toLocaleString([], {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          );
          setStage('waiting_countdown');
        } else {
          setStage('otp_entry');
        }
      } catch (err) {
        setErrorMessage('Failed to connect to the meeting verification service.');
        setStage('invalid_token');
      }
    }

    checkToken();
  }, [token]);

  // Countdown timer if waiting
  useEffect(() => {
    if (stage !== 'waiting_countdown' || countdownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStage('otp_entry');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage, countdownSeconds]);

  // Call duration counter
  useEffect(() => {
    if (stage === 'in_call' && !isCompleted) {
      callDurationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (callDurationTimerRef.current) clearInterval(callDurationTimerRef.current);
    };
  }, [stage, isCompleted]);

  // Step 2: Initialize Web Speech API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    synthRef.current = window.speechSynthesis;

    const loadVoices = () => {
      const voices = synthRef.current?.getVoices() || [];
      const naturalVoice =
        voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en')) ||
        voices.find((v) => v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Daniel')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      selectedVoiceRef.current = naturalVoice || null;
    };

    loadVoices();
    if (synthRef.current?.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not supported. Falling back to text mode.');
      setIsSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      // Interruption: Stop bot immediately if intern starts speaking
      recognition.onspeechstart = () => {
        if (synthRef.current?.speaking) {
          synthRef.current.cancel();
          setIsBotSpeaking(false);
          setStatusText('Listening to you...');
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText('Listening to you... Speak now');
      };

      recognition.onresult = (event: any) => {
        const spokenText = event.results[0][0].transcript;
        if (spokenText && spokenText.trim()) {
          handleInternMessage(spokenText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setIsSpeechSupported(false);
          setStatusText('Microphone access blocked. Please use text chat.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.error('Error creating SpeechRecognition:', e);
      setIsSpeechSupported(false);
    }

    return () => {
      if (synthRef.current?.speaking) synthRef.current.cancel();
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  // Voice Loop Helper: Start Listening
  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSpeechSupported || isMuted || isBotSpeakingRef.current) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
      setStatusText('Listening to you... Speak now');
    } catch {}
  }, [isSpeechSupported, isMuted]);

  // Voice Loop Helper: Stop Listening
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatusText('Microphone paused');
    } catch {}
  }, []);

  // Voice Loop Helper: Speak text
  const speakText = useCallback(
    (textToSpeak: string, onFinish?: () => void) => {
      if (!synthRef.current) return;

      synthRef.current.cancel();
      stopListening();

      const clean = textToSpeak
        .replace(/[*#_`~>]/g, '')
        .replace(/^[-•]\s*/gm, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(clean);
      if (selectedVoiceRef.current) {
        utterance.voice = selectedVoiceRef.current;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setIsBotSpeaking(true);
        setStatusText('AI Mentor is speaking...');
      };

      utterance.onend = () => {
        setIsBotSpeaking(false);
        setStatusText('AI Mentor finished speaking.');
        if (onFinish) {
          onFinish();
        } else {
          setTimeout(() => {
            startListening();
          }, 350);
        }
      };

      utterance.onerror = () => {
        setIsBotSpeaking(false);
        if (onFinish) onFinish();
      };

      synthRef.current.speak(utterance);
    },
    [startListening, stopListening]
  );

  // Step 3: Handle Intern Message (Speech or Text)
  const handleInternMessage = async (messageText: string) => {
    if (!messageText.trim() || isThinking) return;

    const userMsgId = 'intern-' + Date.now();
    const newInternMsg: TranscriptItem = {
      id: userMsgId,
      role: 'intern',
      text: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedTranscript = [...transcript, newInternMsg];
    setTranscript(updatedTranscript);
    setTextInput('');
    setIsThinking(true);
    setStatusText('AI Mentor is thinking...');

    try {
      const history = updatedTranscript.map((t) => ({
        role: t.role,
        text: t.text,
      }));

      const res = await fetch('/api/meet/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          message: messageText,
          history,
          evaluationContext: evaluation,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Chat request failed');

      const mentorReply = data.reply;
      const completeSignal = data.isComplete;
      setIsFinalReview(!!data.isFinalReview);

      const mentorMsg: TranscriptItem = {
        id: 'mentor-' + Date.now(),
        role: 'mentor',
        text: mentorReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTranscript((prev) => [...prev, mentorMsg]);
      setIsThinking(false);

      if (completeSignal) {
        speakText(mentorReply, async () => {
          setIsCompleted(true);
          setStatusText(data.isFinalReview ? 'Internship Completed!' : 'Review Completed!');
          if (meetingType === 'REVIEW') {
            await completeReviewMeeting([...updatedTranscript, mentorMsg]);
          } else {
            await completeOrientationMeeting([...updatedTranscript, mentorMsg]);
          }
        });
      } else {
        speakText(mentorReply);
      }
    } catch (err) {
      console.error('[Chat Error]', err);
      setIsThinking(false);
      setStatusText('Mentor encountered an error. Please try again.');
    }
  };

  // Submit Work in Review Meeting
  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitLink.trim() && !submitText.trim() && !selectedFile) {
      alert('Please provide a GitHub link, upload a document (PDF/DOCX/TXT), or paste your work.');
      return;
    }

    setIsEvaluating(true);
    setIsThinking(true);
    setStatusText('AI Mentor is reading and evaluating your submitted work...');

    try {
      const formData = new FormData();
      formData.append('token', token);
      if (submitLink.trim()) formData.append('link', submitLink.trim());
      if (submitText.trim()) formData.append('textContent', submitText.trim());
      if (selectedFile) formData.append('file', selectedFile);

      const res = await fetch('/api/meet/evaluate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Evaluation failed.');
      }

      setEvaluation(data.evaluation);
      setHasSubmitted(true);
      setIsEvaluating(false);

      // Add submission notice to transcript
      const subSummary = submitLink
        ? `Submitted GitHub repository: ${submitLink}`
        : selectedFile
        ? `Uploaded document: ${selectedFile.name}`
        : `Submitted project code notes.`;

      const subMsg: TranscriptItem = {
        id: 'sub-' + Date.now(),
        role: 'intern',
        text: subSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Add Mentor Spoken Feedback to transcript
      const feedbackMsg: TranscriptItem = {
        id: 'mentor-feedback-' + Date.now(),
        role: 'mentor',
        text: `${data.evaluation.spokenFeedback} Do you have any questions about this feedback?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTranscript((prev) => [...prev, subMsg, feedbackMsg]);
      setIsThinking(false);

      // Speak feedback aloud!
      speakText(`${data.evaluation.spokenFeedback} Do you have any questions about this feedback?`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsEvaluating(false);
      setIsThinking(false);
      setStatusText('Evaluation failed: ' + msg);
      alert('Evaluation error: ' + msg);
    }
  };

  // Complete Orientation Meeting
  const completeOrientationMeeting = async (finalTranscript: TranscriptItem[]) => {
    const formattedTranscript = finalTranscript
      .map((t) => `[${t.timestamp}] ${t.role === 'mentor' ? 'AI Mentor' : intern?.name || 'Intern'}: ${t.text}`)
      .join('\n');

    try {
      const res = await fetch('/api/meet/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, transcript: formattedTranscript }),
      });
      const data = await res.json();
      if (data.success && data.nextMeeting) {
        setNextReviewData(data.nextMeeting);
      }
    } catch (err) {
      console.error('[Complete Orientation Error]', err);
    }
  };

  // Complete Review Meeting
  const completeReviewMeeting = async (finalTranscript: TranscriptItem[]) => {
    const formattedTranscript = finalTranscript
      .map((t) => `[${t.timestamp}] ${t.role === 'mentor' ? 'AI Mentor' : intern?.name || 'Intern'}: ${t.text}`)
      .join('\n');

    try {
      const res = await fetch('/api/meet/review-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, transcript: formattedTranscript }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.isFinal) {
          setIsFinalReview(true);
          setCertificateUrl(data.certificateUrl);
          setFinalScore(data.finalScore);
        } else if (data.nextMeeting) {
          setNextReviewData(data.nextMeeting);
        }
      }
    } catch (err) {
      console.error('[Complete Review Error]', err);
    }
  };

  // Trigger initial greeting when call starts
  const startCallSession = async () => {
    if (hasInitializedCallRef.current) return;
    hasInitializedCallRef.current = true;

    setIsThinking(true);
    setStatusText('AI Mentor is joining the call...');

    try {
      const res = await fetch('/api/meet/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          message: '',
          history: [],
        }),
      });

      const data = await res.json();
      const initialGreeting = data.reply;
      setIsFinalReview(!!data.isFinalReview);

      const mentorMsg: TranscriptItem = {
        id: 'mentor-' + Date.now(),
        role: 'mentor',
        text: initialGreeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setTranscript([mentorMsg]);
      setIsThinking(false);

      speakText(initialGreeting);
    } catch (err) {
      console.error('[Initial Greeting Error]', err);
      setIsThinking(false);
      setStatusText('Welcome! Please submit your work or ask your questions.');
    }
  };

  // Handle OTP Submission
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setErrorMessage('Please enter a valid 6-digit OTP code.');
      return;
    }

    setIsVerifyingOtp(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/meet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, otp: otp.trim(), action: 'verify' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Incorrect OTP code. Please check your email.');
        setIsVerifyingOtp(false);
        return;
      }

      setIntern(data.intern);
      setTaskTemplate(data.taskTemplate);
      setReviewDatePreview(data.firstReviewDatePreview);
      setMeetingType(data.meeting.type || 'ORIENTATION');
      setStage('in_call');

      setTimeout(() => {
        startCallSession();
      }, 500);
    } catch (err) {
      setErrorMessage('Verification failed. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Leave meeting
  const handleLeaveMeeting = async () => {
    if (synthRef.current?.speaking) synthRef.current.cancel();
    stopListening();

    if (window.confirm('Are you sure you want to leave the room? Your transcript and progress will be saved.')) {
      if (!isCompleted && transcript.length > 0) {
        if (meetingType === 'REVIEW') {
          await completeReviewMeeting(transcript);
        } else {
          await completeOrientationMeeting(transcript);
        }
      }
      router.push('/admin');
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${days > 0 ? `${days}d ` : ''}${hours.toString().padStart(2, '0')}h : ${minutes
      .toString()
      .padStart(2, '0')}m : ${seconds.toString().padStart(2, '0')}s`;
  };

  // Render: Loading Screen
  if (stage === 'loading') {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium">Connecting to secure meeting room...</p>
      </div>
    );
  }

  // Render: Invalid Token Screen
  if (stage === 'invalid_token') {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full p-8 rounded-2xl text-center border-rose-500/30">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            &times;
          </div>
          <h2 className="text-xl font-bold text-white">Invalid Meeting Link</h2>
          <p className="mt-2 text-sm text-slate-400">{errorMessage}</p>
          <div className="mt-6">
            <Link href="/" className="inline-block px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200">
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render: Waiting Countdown Screen
  if (stage === 'waiting_countdown') {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="glass-panel max-w-lg w-full p-8 rounded-2xl text-center border-indigo-500/40">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
            {meetingType} Room Scheduled
          </span>
          <h2 className="text-2xl font-black text-white">Meeting Waiting Room</h2>
          <p className="mt-2 text-sm text-slate-400">
            This meeting is scheduled for <strong className="text-slate-200">{scheduledAtFormatted}</strong>. The room will automatically unlock when the countdown reaches zero.
          </p>

          <div className="mt-8 p-6 rounded-xl bg-slate-900 border border-indigo-500/30">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Time Remaining</p>
            <p className="text-3xl font-mono font-black text-white tracking-wider">{formatCountdown(countdownSeconds)}</p>
          </div>
        </div>
      </div>
    );
  }

  // Render: OTP Entry Screen
  if (stage === 'otp_entry') {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full p-8 rounded-2xl border-slate-700 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            🔒
          </div>
          <h2 className="text-2xl font-bold text-white text-center">
            {meetingType === 'REVIEW' ? 'Enter Review Room' : 'Verify Identity'}
          </h2>
          <p className="mt-1 text-sm text-slate-400 text-center">
            Enter the 6-digit OTP code sent in your {meetingType.toLowerCase()} invite email.
          </p>

          {errorMessage && (
            <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium text-center">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 text-center tracking-wider">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                className="w-full text-center tracking-[12px] font-mono text-2xl font-extrabold py-3.5 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifyingOtp || otp.length !== 6}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.01] flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
            >
              {isVerifyingOtp ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <span>Enter {meetingType === 'REVIEW' ? 'Review Room' : 'Orientation Call'} &rarr;</span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render: Call-Style Meeting Room UI
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 h-[calc(100vh-4.5rem)] flex flex-col">
      {/* Top Meeting Header */}
      <div className="glass-panel px-6 py-3 rounded-2xl flex items-center justify-between border-slate-800 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white">
                {meetingType === 'REVIEW' ? `Review #${reviewNumber}` : 'Orientation Session'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase">
                {intern?.domain || 'Internship'}
              </span>
              {isFinalReview && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  FINAL REVIEW
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Intern: {intern?.name}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            {formatDuration(callDuration)}
          </div>

          <button
            onClick={handleLeaveMeeting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center space-x-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Main Body Grid */}
      <div className="mt-3 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* Left / Center Room View */}
        <div className="lg:col-span-7 xl:col-span-8 glass-panel rounded-2xl p-5 flex flex-col justify-between items-center relative overflow-y-auto border-slate-800">
          {/* Top Status */}
          <div className="w-full text-center pt-1">
            <span className="text-xs font-semibold text-indigo-400 tracking-wide uppercase">
              AI Senior Mentor &bull; {meetingType === 'REVIEW' ? 'Progress Review & Feedback' : 'Voice Orientation'}
            </span>
            <h3 className="text-base font-bold text-white mt-0.5 truncate px-4">
              {taskTemplate?.title || 'Internship Capstone'}
            </h3>
          </div>

          {/* Voice Orb Area */}
          <div className="py-2 flex flex-col items-center">
            <VoiceOrb
              isSpeaking={isBotSpeaking}
              isListening={isListening}
              isThinking={isThinking || isEvaluating}
            />

            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-slate-200 transition-all flex items-center justify-center space-x-2">
                {isBotSpeaking && (
                  <span className="flex space-x-1">
                    <span className="w-1 h-3 bg-indigo-400 animate-pulse rounded-full" />
                    <span className="w-1 h-4 bg-indigo-400 animate-pulse delay-100 rounded-full" />
                    <span className="w-1 h-2 bg-indigo-400 animate-pulse delay-200 rounded-full" />
                  </span>
                )}
                <span>{statusText}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBotSpeaking
                  ? 'Speak at any moment to interrupt'
                  : isListening
                  ? 'Listening for questions or doubts...'
                  : isEvaluating
                  ? 'Comparing deliverables with Gemini...'
                  : 'Voice loop active'}
              </p>
            </div>
          </div>

          {/* If REVIEW Meeting: Show Work Submission Panel */}
          {meetingType === 'REVIEW' && (
            <div className="w-full max-w-2xl my-2 p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span>Work Submission for AI Evaluation</span>
                </span>
                {hasSubmitted && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    &check; Evaluated ({evaluation?.score}/100)
                  </span>
                )}
              </div>

              {/* Submission Mode Tabs */}
              <div className="flex rounded-lg bg-slate-950 p-1 mb-3 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveSubmitTab('link')}
                  className={`flex-1 py-1 rounded-md font-medium transition-colors ${
                    activeSubmitTab === 'link' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  GitHub / URL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubmitTab('file')}
                  className={`flex-1 py-1 rounded-md font-medium transition-colors ${
                    activeSubmitTab === 'file' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  File (PDF / DOCX / TXT)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubmitTab('text')}
                  className={`flex-1 py-1 rounded-md font-medium transition-colors ${
                    activeSubmitTab === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Paste Code / Notes
                </button>
              </div>

              {/* Inputs */}
              <form onSubmit={handleSubmitWork} className="space-y-3">
                {activeSubmitTab === 'link' && (
                  <div>
                    <input
                      type="url"
                      placeholder="https://github.com/your-username/your-repo"
                      value={submitLink}
                      onChange={(e) => setSubmitLink(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Our system automatically pulls your repository file tree and README.md via GitHub public API.
                    </p>
                  </div>
                )}

                {activeSubmitTab === 'file' && (
                  <div>
                    <label className="block border border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-3 text-center cursor-pointer bg-slate-950">
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSelectedFile(e.target.files[0]);
                          }
                        }}
                      />
                      <span className="text-xs text-slate-300">
                        {selectedFile ? selectedFile.name : 'Click to upload PDF, Word DOCX, or TXT file'}
                      </span>
                    </label>
                  </div>
                )}

                {activeSubmitTab === 'text' && (
                  <textarea
                    rows={2}
                    placeholder="Paste your source code, architecture summary, or implementation notes..."
                    value={submitText}
                    onChange={(e) => setSubmitText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {hasSubmitted ? 'Resubmit to re-evaluate' : 'Evaluates completeness, code quality & milestones'}
                  </span>
                  <button
                    type="submit"
                    disabled={isEvaluating}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-colors disabled:opacity-50"
                  >
                    {isEvaluating ? 'Evaluating with Gemini...' : hasSubmitted ? 'Re-Evaluate Submission' : 'Submit for Evaluation'}
                  </button>
                </div>
              </form>

              {/* Evaluation Score Card if available */}
              {evaluation && (
                <div className="mt-3 pt-3 border-t border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">Evaluation Score:</span>
                    <span className="font-extrabold text-sm text-emerald-400 font-mono">
                      {evaluation.score}/100
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="font-semibold text-emerald-400 mb-1">Mentor Feedback Summary:</div>
                    <p className="line-clamp-2 text-slate-400">{evaluation.emailFeedback}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Voice / Text Controls Bar */}
          <div className="w-full flex flex-col items-center space-y-3 pt-2">
            <div className="flex items-center space-x-4">
              {isSpeechSupported ? (
                <button
                  onClick={() => {
                    if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    isListening
                      ? 'bg-emerald-500 text-white shadow-emerald-500/40 scale-105 ring-4 ring-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                  title={isListening ? 'Click to pause mic' : 'Click to speak'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              ) : (
                <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
                  SpeechRecognition unavailable. Text mode active.
                </div>
              )}

              <button
                onClick={() => {
                  const lastMentor = [...transcript].reverse().find((t) => t.role === 'mentor');
                  if (lastMentor) speakText(lastMentor.text);
                }}
                disabled={isBotSpeaking || isThinking}
                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center transition-colors disabled:opacity-40"
                title="Replay last mentor audio"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
            </div>

            {/* Text Input Fallback */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInternMessage(textInput);
              }}
              className="w-full max-w-xl flex items-center space-x-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask questions about the feedback or task..."
                disabled={isThinking}
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || isThinking}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Live Transcript Panel */}
        <div className="lg:col-span-5 xl:col-span-4 glass-panel rounded-2xl flex flex-col border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Live Meeting Transcript</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">{transcript.length} turns</span>
          </div>

          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans text-xs">
            {transcript.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'mentor' ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center space-x-1 mb-1 px-1">
                  <span className={`font-bold text-[10px] uppercase ${msg.role === 'mentor' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                    {msg.role === 'mentor' ? 'AI Mentor' : intern?.name || 'You'}
                  </span>
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                </div>
                <div
                  className={`p-2.5 rounded-2xl max-w-[92%] leading-relaxed ${
                    msg.role === 'mentor'
                      ? 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-sm'
                      : 'bg-indigo-600 text-white rounded-tr-sm shadow-md'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={transcriptBottomRef} />
          </div>

          {/* Footer Milestones Reminder */}
          <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400">
            <div className="font-semibold text-slate-300 mb-0.5">Deliverables Checklist:</div>
            <p className="line-clamp-2 text-slate-400">{taskTemplate?.deliverables}</p>
          </div>
        </div>
      </div>

      {/* Completion Modal */}
      {isCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-7 border border-emerald-500/40 bg-slate-900 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 font-bold text-3xl">
              {isFinalReview ? '🎓' : '🎉'}
            </div>
            <h3 className="text-2xl font-black text-white">
              {isFinalReview ? 'Internship Completed!' : 'Review Completed!'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isFinalReview
                ? 'You have successfully completed your final milestone. Your verified Certificate of Completion is ready!'
                : 'Your milestone review has been recorded and your next review session is scheduled.'}
            </p>

            {/* Certificate Download Card if Final Review */}
            {isFinalReview && certificateUrl && (
              <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/40 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Official Certificate of Completion
                  </span>
                  {finalScore && (
                    <span className="text-xs font-extrabold text-emerald-400 font-mono">
                      Final Score: {Math.round(finalScore)}/100
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mb-3">
                  Generated with pdf-lib. Includes tenure verification, domain competencies, and academic seal.
                </p>
                <a
                  href={certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download Certificate PDF</span>
                </a>
              </div>
            )}

            {/* Next Review Details Card if intermediate */}
            {!isFinalReview && nextReviewData && (
              <div className="mt-5 p-4 rounded-xl bg-slate-950 border border-emerald-500/30 text-left text-xs space-y-1">
                <p className="font-bold text-emerald-400 uppercase tracking-wider mb-2">Next Review Scheduled</p>
                <div>
                  <span className="text-slate-400 font-medium">Date & Time:</span>{' '}
                  <span className="text-white font-semibold">
                    {new Date(nextReviewData.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Verification OTP:</span>{' '}
                  <span className="font-mono text-emerald-400 font-bold tracking-widest">{nextReviewData.otp}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Room Link:</span>{' '}
                  <span className="text-indigo-400 break-all">{nextReviewData.link}</span>
                </div>
              </div>
            )}

            <div className="mt-6">
              <Link
                href="/admin"
                className="inline-block px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg text-xs"
              >
                Back to Admin Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
