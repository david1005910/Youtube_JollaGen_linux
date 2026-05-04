'use client';

import React, { useState, useMemo } from 'react';
import type { ScriptScene } from '../types';

interface Props {
  scenes: ScriptScene[];
  onClose: () => void;
}

// 탭 정의
type Tab = 'narration' | 'prompt' | 'full';

const TABS: { key: Tab; label: string; icon: string; desc: string }[] = [
  { key: 'narration', label: '나레이션',     icon: '📝', desc: '자막 텍스트만' },
  { key: 'prompt',    label: '이미지 프롬프트', icon: '🎨', desc: '이미지 생성 프롬프트만' },
  { key: 'full',      label: '전체',          icon: '📋', desc: '나레이션 + 프롬프트' },
];

export default function ScriptViewer({ scenes, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('narration');
  const [fontSize, setFontSize] = useState(15);
  const [copiedNar, setCopiedNar] = useState(false);
  const [copiedPrm, setCopiedPrm] = useState(false);
  const [editingIdx, setEditingIdx]   = useState<number | null>(null);
  const [localScenes, setLocalScenes] = useState<ScriptScene[]>(scenes);

  const totalNarChars = useMemo(() => localScenes.reduce((s, sc) => s + sc.narration.length, 0), [localScenes]);
  const totalPrmChars = useMemo(() => localScenes.reduce((s, sc) => s + (sc.visualPrompt?.length ?? 0), 0), [localScenes]);
  const readingSec    = useMemo(() => Math.round(totalNarChars / 5.5), [totalNarChars]);

  const copyNarration = () => {
    const text = localScenes.map(s => `[씬 ${s.sceneNumber}] ${s.narration}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => { setCopiedNar(true); setTimeout(() => setCopiedNar(false), 2000); });
  };

  const copyPrompts = () => {
    const text = localScenes.map(s => `[씬 ${s.sceneNumber}] ${s.visualPrompt}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => { setCopiedPrm(true); setTimeout(() => setCopiedPrm(false), 2000); });
  };

  const exportTxt = () => {
    const text =
      tab === 'narration' ? localScenes.map(s => `[씬 ${s.sceneNumber}]\n${s.narration}`).join('\n\n')
      : tab === 'prompt'  ? localScenes.map(s => `[씬 ${s.sceneNumber}]\n${s.visualPrompt}`).join('\n\n')
      : localScenes.map(s => `[씬 ${s.sceneNumber}]\n자막: ${s.narration}\n이미지: ${s.visualPrompt}`).join('\n\n');
    dl(text, 'script.txt', 'text/plain;charset=utf-8');
  };

  const exportSrt = () => {
    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600).toString().padStart(2, '0');
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
      const s = (sec % 60).toFixed(3).replace('.', ',').padStart(6, '0');
      return `${h}:${m}:${s}`;
    };
    const srt = localScenes.map((s, i) =>
      `${s.sceneNumber}\n${fmt(i * 5)} --> ${fmt((i + 1) * 5)}\n${s.narration}`
    ).join('\n\n');
    dl(srt, 'script.srt', 'text/plain;charset=utf-8');
  };

  const dl = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const updateNarration  = (idx: number, val: string) =>
    setLocalScenes(prev => prev.map((s, i) => i === idx ? { ...s, narration: val } : s));
  const updateVisualPmt  = (idx: number, val: string) =>
    setLocalScenes(prev => prev.map((s, i) => i === idx ? { ...s, visualPrompt: val } : s));

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9400,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 820, height: '90vh',
        background: '#1e1c19',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 18,
        boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', flexShrink: 0,
          background: '#252220', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#e0d5ca' }}>📋 스크립트 뷰어</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>
              {localScenes.length}씬
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)', display: 'flex', gap: 10 }}>
              <span>나레이션 {totalNarChars.toLocaleString()}자</span>
              <span>·</span>
              <span>약 {Math.floor(readingSec / 60)}분 {readingSec % 60}초</span>
              {tab !== 'narration' && <>
                <span>·</span>
                <span>프롬프트 {totalPrmChars.toLocaleString()}자</span>
              </>}
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.45)', fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>

        {/* ── 탭 + 툴바 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px',
          background: '#221f1c', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexWrap: 'wrap', flexShrink: 0,
        }}>
          {/* 탭 */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3, gap: 2 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} title={t.desc} style={{
                padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                background: tab === t.key
                  ? (t.key === 'prompt' ? 'rgba(66,133,244,0.22)' : 'rgba(201,100,66,0.22)')
                  : 'transparent',
                color: tab === t.key
                  ? (t.key === 'prompt' ? '#80a8f0' : '#e09070')
                  : 'rgba(255,255,255,0.38)',
                transition: 'all 0.15s',
              }}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* 폰트 크기 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>가</span>
            <input type="range" min={12} max={22} step={1} value={fontSize}
              onChange={e => setFontSize(+e.target.value)}
              style={{ width: 64, accentColor: '#c96442', cursor: 'pointer' }} />
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.30)' }}>가</span>
          </div>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {(tab === 'narration' || tab === 'full') && (
              <button onClick={copyNarration} style={tb}>
                {copiedNar ? '✓ 복사됨' : '📋 나레이션 복사'}
              </button>
            )}
            {(tab === 'prompt' || tab === 'full') && (
              <button onClick={copyPrompts} style={{ ...tb, borderColor: 'rgba(66,133,244,0.28)', color: '#80a8f0' }}>
                {copiedPrm ? '✓ 복사됨' : '🎨 프롬프트 복사'}
              </button>
            )}
            <button onClick={exportTxt} style={tb}>⬇ TXT</button>
            {(tab === 'narration' || tab === 'full') && (
              <button onClick={exportSrt} style={{ ...tb, background: 'rgba(201,100,66,0.14)', borderColor: 'rgba(201,100,66,0.28)', color: '#e09070' }}>
                🎞 SRT
              </button>
            )}
          </div>
        </div>

        {/* ── 본문 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {localScenes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.22)', fontSize: 14 }}>
              채팅에서 스크립트를 먼저 생성하세요.
            </div>
          ) : (
            localScenes.map((scene, i) => (
              <div key={scene.sceneNumber} style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr',
                gap: 10,
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                alignItems: 'start',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
              >
                {/* 씬 번호 */}
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: 'rgba(201,100,66,0.14)', border: '1px solid rgba(201,100,66,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#d97559',
                }}>{scene.sceneNumber}</div>

                <div style={{ minWidth: 0 }}>

                  {/* ── 나레이션 ── */}
                  {(tab === 'narration' || tab === 'full') && (
                    <div style={{ marginBottom: tab === 'full' ? 10 : 0 }}>
                      {tab === 'full' && <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(201,100,66,0.60)', marginBottom: 4, letterSpacing: '0.04em' }}>📝 나레이션</div>}
                      {editingIdx === i ? (
                        <textarea
                          autoFocus
                          value={localScenes[i].narration}
                          onChange={e => updateNarration(i, e.target.value)}
                          onBlur={() => setEditingIdx(null)}
                          rows={3}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 7, background: '#2a2724', border: '1px solid rgba(201,100,66,0.35)', color: '#e0d5ca', fontSize, lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div onClick={() => setEditingIdx(i)} title="클릭하여 편집" style={{ fontSize, color: '#e0d5ca', lineHeight: 1.75, cursor: 'text', borderRadius: 5, padding: '2px 4px', marginLeft: -4 }}>
                          {localScenes[i].narration || <span style={{ color: 'rgba(255,255,255,0.18)' }}>(없음)</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 이미지 프롬프트 ── */}
                  {(tab === 'prompt' || tab === 'full') && scene.visualPrompt && (
                    <div>
                      {tab === 'full' && <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(66,133,244,0.60)', marginBottom: 4, letterSpacing: '0.04em' }}>🎨 이미지 프롬프트</div>}
                      {editingIdx === i && tab === 'prompt' ? (
                        <textarea
                          autoFocus
                          value={localScenes[i].visualPrompt ?? ''}
                          onChange={e => updateVisualPmt(i, e.target.value)}
                          onBlur={() => setEditingIdx(null)}
                          rows={3}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 7, background: '#1a2030', border: '1px solid rgba(66,133,244,0.35)', color: '#93c5fd', fontSize, lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', fontStyle: 'italic' }}
                        />
                      ) : (
                        <div
                          onClick={() => tab === 'prompt' && setEditingIdx(i)}
                          style={{
                            fontSize: tab === 'prompt' ? fontSize : fontSize - 1.5,
                            color: tab === 'prompt' ? '#93c5fd' : 'rgba(147,197,253,0.55)',
                            fontStyle: 'italic', lineHeight: 1.65, cursor: tab === 'prompt' ? 'text' : 'default',
                            background: tab === 'full' ? 'rgba(66,133,244,0.04)' : 'transparent',
                            borderLeft: tab === 'full' ? '2px solid rgba(66,133,244,0.20)' : 'none',
                            padding: tab === 'full' ? '5px 9px' : '2px 4px',
                            borderRadius: tab === 'full' ? 6 : 5,
                            marginLeft: tab === 'prompt' ? -4 : 0,
                          }}
                        >
                          {localScenes[i].visualPrompt || <span style={{ color: 'rgba(255,255,255,0.18)' }}>(없음)</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 자 수 */}
                  <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.18)', display: 'flex', gap: 8 }}>
                    {(tab === 'narration' || tab === 'full') && <span>나레이션 {localScenes[i].narration.length}자</span>}
                    {(tab === 'prompt' || tab === 'full') && <span>프롬프트 {(localScenes[i].visualPrompt ?? '').length}자</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 하단 바 ── */}
        <div style={{
          flexShrink: 0, padding: '10px 20px',
          background: '#221f1c', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
            텍스트를 클릭하면 바로 편집할 수 있습니다.
          </div>
          <button onClick={onClose} style={{
            padding: '6px 16px', borderRadius: 7, fontSize: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.40)', cursor: 'pointer',
          }}>닫기</button>
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
      `}</style>
    </div>
  );
}

const tb: React.CSSProperties = {
  padding: '4px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)',
  color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
};
