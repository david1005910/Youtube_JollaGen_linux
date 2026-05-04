'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  onClose: () => void;
}

const WELCOME: Message = {
  role: 'assistant',
  content: `**📊 브루(Vrew) CSV 생성 AI**가 준비됐습니다.

아래 **4가지**를 한번에 올려주세요:

1. **이미지 프롬프트 목록** — 씬별로 만든 프롬프트 전체
2. **브루 클립 수** — 브루 화면에서 마지막 클립 번호 확인
3. **대본** — 전체 대본 텍스트
4. **영상 수** — 원하는 영상 개수 (0개도 가능)

**참고:**
- 이미지 수는 프롬프트 수와 동일하게 자동 확정됩니다
- 영상 수를 모르겠으면 추천해드립니다
- 생성된 CSV는 바로 다운로드할 수 있습니다`,
};

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(```(?:csv)?\n?[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lang = part.match(/^```(\w+)/)?.[1] ?? '';
      const code = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
      return (
        <pre key={i} style={{
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, padding: '10px 12px', margin: '8px 0',
          fontSize: 12, color: '#94a3b8', overflowX: 'auto',
          whiteSpace: 'pre', fontFamily: 'monospace',
        }}>
          {lang === 'csv' && (
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>CSV</div>
          )}
          <code>{code}</code>
        </pre>
      );
    }
    // Simple inline markdown
    const lines = part.split('\n');
    return (
      <span key={i}>
        {lines.map((line, j) => {
          // Bold
          const rendered = line.replace(/\*\*(.*?)\*\*/g, '__BOLD__$1__BOLD__').split('__BOLD__');
          return (
            <React.Fragment key={j}>
              {rendered.map((chunk, k) =>
                k % 2 === 1
                  ? <strong key={k} style={{ color: '#f0e8de', fontWeight: 600 }}>{chunk}</strong>
                  : <span key={k}>{chunk}</span>
              )}
              {j < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

function extractCsv(text: string): string | null {
  const match = text.match(/```(?:csv)?\n?([\s\S]*?)```/);
  if (!match) return null;
  const content = match[1].trim();
  // Must have the CSV header
  if (!content.includes('scene_number') && !content.includes('start_srt')) return null;
  return content;
}

function downloadCsv(csvText: string) {
  // UTF-8 BOM for Excel compatibility
  const bom = '﻿';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vrew_csv_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvGenChat({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setStreamText('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/claude/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '서버 오류' }));
        setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${err.error}` }]);
        return;
      }

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let full     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break;
          try {
            const { text: t, error } = JSON.parse(raw);
            if (error) { full += `\n오류: ${error}`; }
            else if (t)  { full += t; setStreamText(full); }
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: full }]);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `네트워크 오류: ${e.message}` }]);
      }
    } finally {
      setIsLoading(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [input, isLoading, messages]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([WELCOME]);
    setInput('');
    setStreamText('');
    setIsLoading(false);
  };

  // Collect all CSV blocks from assistant messages for download
  const allCsvBlocks = messages
    .filter(m => m.role === 'assistant')
    .map(m => extractCsv(m.content))
    .filter(Boolean) as string[];
  const latestCsv = allCsvBlocks[allCsvBlocks.length - 1] ?? null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 780, height: '90vh',
        background: '#1c1917', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#e0d5ca' }}>브루(Vrew) CSV 생성</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                Claude Sonnet 4.6 · Vrew 자동매칭 앱용 CSV
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {latestCsv && (
              <button
                onClick={() => downloadCsv(latestCsv)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                  color: '#4ade80', cursor: 'pointer',
                }}
              >
                ⬇ CSV 다운로드
              </button>
            )}
            <button
              onClick={clearChat}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
              }}
            >
              새 대화
            </button>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 7, fontSize: 16,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                color: 'rgba(255,255,255,0.50)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap: 10, alignItems: 'flex-start',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: '#2d6a4f',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13,
                }}>📊</div>
              )}
              <div style={{
                maxWidth: '82%',
                background: msg.role === 'user' ? '#c96442' : 'rgba(255,255,255,0.05)',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '10px 14px',
                fontSize: 13, lineHeight: 1.65, color: '#e0d5ca',
              }}>
                {renderMarkdown(msg.content)}
                {/* CSV download button inside message */}
                {msg.role === 'assistant' && (() => {
                  const csv = extractCsv(msg.content);
                  return csv ? (
                    <button
                      onClick={() => downloadCsv(csv)}
                      style={{
                        marginTop: 10,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                        color: '#4ade80', cursor: 'pointer',
                      }}
                    >
                      ⬇ CSV 다운로드 (UTF-8 BOM)
                    </button>
                  ) : null;
                })()}
              </div>
            </div>
          ))}

          {/* Streaming */}
          {isLoading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#2d6a4f',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>📊</div>
              <div style={{
                maxWidth: '82%',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '14px 14px 14px 4px',
                padding: '10px 14px',
                fontSize: 13, lineHeight: 1.65, color: '#e0d5ca',
              }}>
                {streamText ? renderMarkdown(streamText) : (
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>생성 중…</span>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          flexShrink: 0,
          padding: '12px 18px 16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: 10, alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={3}
            placeholder="이미지 프롬프트, 브루 클립 수, 대본, 영상 수를 붙여넣으세요… (Shift+Enter 줄바꿈)"
            style={{
              flex: 1, resize: 'none', borderRadius: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#e0d5ca', padding: '10px 14px',
              fontSize: 13, lineHeight: 1.5,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={isLoading ? () => abortRef.current?.abort() : send}
            disabled={!isLoading && !input.trim()}
            style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: isLoading ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
              border: `1px solid ${isLoading ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
              color: isLoading ? '#f87171' : '#4ade80',
              cursor: (!isLoading && !input.trim()) ? 'not-allowed' : 'pointer',
              opacity: (!isLoading && !input.trim()) ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {isLoading ? '중단' : '전송'}
          </button>
        </div>
      </div>
    </div>
  );
}
