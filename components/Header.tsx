'use client';

import React from 'react';

const Header: React.FC = () => {
  return (
    <header style={{
      background:           'rgba(255,255,255,0.12)',
      backdropFilter:       'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom:         '1px solid rgba(255,255,255,0.22)',
      boxShadow:            '0px 4px 24px rgba(0,0,0,0.18)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon — glass + gradient */}
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.70) 0%, rgba(236,72,153,0.70) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.40)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0px 0px 12px rgba(255,255,255,0.20), 0px 4px 16px rgba(0,0,0,0.20)',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#fff">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Wordmark */}
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1 }}>
            <span style={{
              color: 'rgba(255,255,255,0.92)',
              textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
            }}>
              TubeGen{' '}
            </span>
            <span style={{
              background: 'linear-gradient(135deg, #c084fc, #f472b6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              AI
            </span>
          </span>
        </div>

        {/* Right — engine badge (glass) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.30)',
            boxShadow: 'inset 0px 0px 12px rgba(255,255,255,0.08), 0px 4px 24px rgba(0,0,0,0.15)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)',
            textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#34d399',
              boxShadow: '0 0 8px rgba(52,211,153,0.9)',
              display: 'inline-block',
              animation: 'glPulse 2s ease-in-out infinite',
            }} />
            시각 엔진: Gemini 3 Pro
          </div>
        </div>
      </div>

      <style>{`
        @keyframes glPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(52,211,153,0.9); }
          50%       { opacity: 0.5; box-shadow: 0 0 4px rgba(52,211,153,0.4); }
        }
      `}</style>
    </header>
  );
};

export default Header;
