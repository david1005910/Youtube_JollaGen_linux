'use client';

import React from 'react';

/* ── Vaporwave palette ───────────────────────────────────────────────────── */
const VP = {
  pink:    '#FF4FBE',
  cyan:    '#00F0FF',
  purple:  '#9B5BFF',
  magenta: '#FF7AD9',
  navy:    '#0C0E23',
  navyMid: '#0e0b2c',
} as const;

const Header: React.FC = () => {
  return (
    <header style={{
      borderBottom: `1px solid rgba(0,240,255,0.15)`,
      background: VP.navyMid,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* Bottom neon accent line */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, rgba(0,240,255,0.3) 35%, rgba(155,91,255,0.3) 65%, transparent 100%)`,
      }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon — neon gradient square */}
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg, ${VP.pink} 0%, ${VP.purple} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 12px rgba(155,91,255,0.45)`,
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
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1 }}>
            <span style={{
              background: `linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.75) 100%)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              TubeGen{' '}
            </span>
            <span style={{
              background: `linear-gradient(135deg, ${VP.pink}, ${VP.purple})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              textShadow: 'none',
              filter: `drop-shadow(0 0 6px rgba(255,79,190,0.5))`,
            }}>
              AI
            </span>
          </span>
        </div>

        {/* Right — engine badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 8,
            background: `linear-gradient(135deg, rgba(0,240,255,0.08) 0%, rgba(155,91,255,0.08) 100%)`,
            border: `1px solid rgba(0,240,255,0.22)`,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: VP.cyan,
              boxShadow: `0 0 8px rgba(0,240,255,0.9)`,
              display: 'inline-block',
              animation: 'vpPulse 2s ease-in-out infinite',
            }} />
            시각 엔진: Gemini 3 Pro
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vpPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(0,240,255,0.9); }
          50%       { opacity: 0.5; box-shadow: 0 0 4px rgba(0,240,255,0.4); }
        }
      `}</style>
    </header>
  );
};

export default Header;
