'use client';

import React from 'react';

interface VoiceOrbProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
}

export function VoiceOrb({ isSpeaking, isListening, isThinking }: VoiceOrbProps) {
  return (
    <div className="relative flex items-center justify-center w-64 h-64 mx-auto select-none">
      {/* Outer Glow Waves */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
          isSpeaking
            ? 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 opacity-60 scale-125 animate-pulse'
            : isListening
            ? 'bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-500 opacity-50 scale-110 animate-pulse'
            : isThinking
            ? 'bg-gradient-to-tr from-amber-400 via-indigo-500 to-purple-600 opacity-40 scale-105 animate-pulse-slow'
            : 'bg-indigo-600/20 opacity-30 scale-95'
        }`}
      />

      {/* Ripple Rings when speaking */}
      {isSpeaking && (
        <>
          <div className="absolute inset-0 rounded-full border border-indigo-400/30 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="absolute -inset-4 rounded-full border border-purple-400/20 animate-ping" style={{ animationDuration: '3s' }} />
        </>
      )}

      {/* Ripple Rings when listening */}
      {isListening && (
        <div className="absolute -inset-3 rounded-full border-2 border-emerald-400/40 animate-ping" style={{ animationDuration: '1.8s' }} />
      )}

      {/* Main Orb Body */}
      <div
        className={`relative z-10 w-44 h-44 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 transform ${
          isSpeaking
            ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 scale-105 shadow-indigo-500/50'
            : isListening
            ? 'bg-gradient-to-tr from-teal-600 via-emerald-500 to-cyan-600 scale-100 shadow-emerald-500/40'
            : isThinking
            ? 'bg-gradient-to-tr from-indigo-700 via-purple-700 to-amber-600 scale-98 shadow-purple-500/30'
            : 'bg-gradient-to-tr from-slate-800 via-slate-900 to-indigo-950 scale-95 shadow-black/60 border border-slate-700'
        }`}
      >
        {/* Core highlight reflection */}
        <div className="absolute top-3 left-6 w-16 h-8 rounded-full bg-white/20 blur-[3px] transform -rotate-12" />

        {/* Dynamic Inner Wave Graphic */}
        <div className="flex items-center space-x-1.5 z-20">
          <span
            className={`w-1.5 rounded-full bg-white/90 transition-all duration-200 ${
              isSpeaking
                ? 'h-10 animate-bounce'
                : isListening
                ? 'h-6 animate-pulse'
                : 'h-2 opacity-50'
            }`}
            style={{ animationDelay: '0ms' }}
          />
          <span
            className={`w-1.5 rounded-full bg-white/90 transition-all duration-200 ${
              isSpeaking
                ? 'h-16 animate-bounce'
                : isListening
                ? 'h-10 animate-pulse'
                : 'h-2 opacity-50'
            }`}
            style={{ animationDelay: '150ms' }}
          />
          <span
            className={`w-1.5 rounded-full bg-white/90 transition-all duration-200 ${
              isSpeaking
                ? 'h-20 animate-bounce'
                : isListening
                ? 'h-12 animate-pulse'
                : 'h-3 opacity-70'
            }`}
            style={{ animationDelay: '300ms' }}
          />
          <span
            className={`w-1.5 rounded-full bg-white/90 transition-all duration-200 ${
              isSpeaking
                ? 'h-14 animate-bounce'
                : isListening
                ? 'h-8 animate-pulse'
                : 'h-2 opacity-50'
            }`}
            style={{ animationDelay: '450ms' }}
          />
          <span
            className={`w-1.5 rounded-full bg-white/90 transition-all duration-200 ${
              isSpeaking
                ? 'h-8 animate-bounce'
                : isListening
                ? 'h-5 animate-pulse'
                : 'h-2 opacity-50'
            }`}
            style={{ animationDelay: '600ms' }}
          />
        </div>
      </div>
    </div>
  );
}

export default VoiceOrb;
