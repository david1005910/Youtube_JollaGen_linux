'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  onClose: () => void;
  onSelectTopic?: (topic: string) => void; // 소재 선택 시 메인 채팅으로 전달
}

const CATEGORIES = [
  { id: '경제·금융', emoji: '💰', color: '#f59e0b' },
  { id: '부동산', emoji: '🏠', color: '#10b981' },
  { id: '주식·투자', emoji: '📈', color: '#ef4444' },
  { id: 'AI·기술', emoji: '🤖', color: '#6366f1' },
  { id: '자기계발', emoji: '🚀', color: '#8b5cf6' },
  { id: '건강·의료', emoji: '💊', color: '#06b6d4' },
  { id: '사회·시사', emoji: '📰', color: '#64748b' },
  { id: '라이프스타일', emoji: '✨', color: '#ec4899' },
  { id: '글로벌·해외', emoji: '🌍', color: '#0ea5e9' },
  { id: '직장·커리어', emoji: '💼', color: '#84cc16' },
];

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // H2
    if (line.startsWith('## ')) {
      return (
        <div key={i} style={{
          fontSize: 15, fontWeight: 700, color: '#f0e8de',
          margin: '20px 0 10px', paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {line.replace('## ', '')}
        </div>
      );
    }
    // Bold label
    if (line.startsWith('**') && line.includes('**:')) {
      const parts = line.split('**');
      return (
        <div key={i} style={{ margin: '6px 0', fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: '#c8b8a2' }}>{parts[1]}</strong>
          <span style={{ color: '#d8cfc5' }}>{parts[2] ?? ''}</span>
        </div>
      );
    }
    // List item
    if (line.match(/^\s+\d+\./)) {
      return (
        <div key={i} style={{
          margin: '3px 0 3px 16px', fontSize: 13, color: '#d8cfc5', lineHeight: 1.6,
        }}>
          {line.trim()}
        </div>
      );
    }
    // HR
    if (line.trim() === '---') {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '14px 0' }} />;
    }
    if (!line.trim()) return <br key={i} />;
    return (
      <div key={i} style={{ fontSize: 13, color: '#d8cfc5', lineHeight: 1.6, margin: '2px 0' }}>
        {line}
      </div>
    );
  });
}

export default function MaterialFinder({ onClose, onSelectTopic }: Props) {
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [keyword, setKeyword]         = useState('');
  const [result, setResult]           = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [model, setModel]             = useState<'claude' | 'gemini'>('claude');
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  const search = useCallback(async (cat?: string) => {
    const category = cat ?? selectedCat;
    if (!category || isLoading) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/claude/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, keyword, preferredModel: model }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: '오류' }));
        setResult(`오류: ${e.error}`);
        return;
      }
      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let full     = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break;
          try {
            const { text, error } = JSON.parse(raw);
            if (error) { full += `\n오류: ${error}`; }
            else if (text) { full += text; setResult(full); }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setResult(`네트워크 오류: ${e.message}`);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [selectedCat, keyword, isLoading, model]);

  // 제목 추출 (## 🔥 소재 N: [제목])
  const extractTopics = (text: string): string[] => {
    const matches = [...text.matchAll(/##\s*[^\s]+\s*소재\s*\d+:\s*(.+)/g)];
    return matches.map(m => m[1].trim()).filter(Boolean);
  };

  const topics = extractTopics(result);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 820, height: '90vh',
        background: '#1c1917', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔍</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e0d5ca' }}>소재 찾기</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                카테고리 선택 → 지금 뜨는 유튜브 소재 5개 발굴
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* 모델 선택 */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
              {(['claude', 'gemini'] as const).map(m => (
                <button key={m} onClick={() => setModel(m)} style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  background: model === m ? 'rgba(255,255,255,0.10)' : 'transparent',
                  border: 'none', color: model === m ? '#e0d5ca' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                }}>
                  {m === 'claude' ? 'Claude' : 'Gemini'}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, fontSize: 16,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.50)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>

        {/* Category Grid */}
        <div style={{
          flexShrink: 0, padding: '14px 18px 0',
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCat(cat.id);
                search(cat.id);
              }}
              style={{
                padding: '8px 4px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                background: selectedCat === cat.id
                  ? `rgba(${hexToRgb(cat.color)}, 0.22)`
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${selectedCat === cat.id
                  ? cat.color
                  : 'rgba(255,255,255,0.09)'}`,
                color: selectedCat === cat.id ? cat.color : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
              }}
            >
              <span style={{ fontSize: 18 }}>{cat.emoji}</span>
              <span>{cat.id}</span>
            </button>
          ))}
        </div>

        {/* Keyword input */}
        <div style={{
          flexShrink: 0, padding: '12px 18px',
          display: 'flex', gap: 8,
        }}>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="추가 키워드 입력 (선택사항) — 예: 30대, 월급, ETF"
            style={{
              flex: 1, padding: '9px 14px', borderRadius: 9, fontSize: 13,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#e0d5ca', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => isLoading ? abortRef.current?.abort() : search()}
            disabled={!isLoading && !selectedCat}
            style={{
              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: isLoading ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
              border: `1px solid ${isLoading ? 'rgba(239,68,68,0.35)' : 'rgba(251,191,36,0.35)'}`,
              color: isLoading ? '#f87171' : '#fbbf24',
              cursor: (!isLoading && !selectedCat) ? 'not-allowed' : 'pointer',
              opacity: (!isLoading && !selectedCat) ? 0.5 : 1, flexShrink: 0,
            }}
          >
            {isLoading ? '중단' : '🔍 찾기'}
          </button>
        </div>

        {/* Result */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
          {!result && !isLoading && (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              color: 'rgba(255,255,255,0.25)', fontSize: 13,
            }}>
              위에서 카테고리를 선택하면 지금 뜨는 소재 5개를 바로 발굴합니다
            </div>
          )}
          {(result || isLoading) && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 12,
              padding: '16px', border: '1px solid rgba(255,255,255,0.07)',
            }}>
              {renderMarkdown(result)}
              {isLoading && (
                <span style={{
                  display: 'inline-block', width: 2, height: 14,
                  background: '#f59e0b', marginLeft: 2,
                  animation: 'cur 0.75s steps(1) infinite',
                  verticalAlign: 'text-bottom',
                }} />
              )}
            </div>
          )}

          {/* 소재 선택 버튼 */}
          {topics.length > 0 && onSelectTopic && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                소재를 선택하면 메인 채팅에서 바로 대본을 만들 수 있습니다
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topics.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => { onSelectTopic(topic); onClose(); }}
                    style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.30)',
                      color: '#fbbf24', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    ✍️ {topic}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
