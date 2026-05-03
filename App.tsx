'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptScene } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
  scenes?: ScriptScene[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function extractScenes(text: string): ScriptScene[] | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed) && parsed.length > 0 && 'narration' in parsed[0]) {
      return parsed.map((s: any, i: number) => ({
        sceneNumber: s.sceneNumber ?? i + 1,
        narration: s.narration ?? '',
        visualPrompt: s.visualPrompt ?? '',
      }));
    }
  } catch {}
  return null;
}

function renderContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const code = part.replace(/```\w*\n?/, '').replace(/```$/, '');
      return (
        <pre key={i} style={{
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '12px 14px', margin: '8px 0',
          fontSize: 12, color: '#a5f3fc', overflowX: 'auto', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <code>{code}</code>
        </pre>
      );
    }
    return (
      <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
        {part.split('\n').map((line, j, arr) => {
          const chunks = line.replace(/\*\*(.*?)\*\*/g, '__B__$1__B__').split('__B__');
          return (
            <React.Fragment key={j}>
              {chunks.map((chunk, k) =>
                k % 2 === 1
                  ? <strong key={k} style={{ color: '#e0e7ff' }}>{chunk}</strong>
                  : <span key={k}>{chunk}</span>
              )}
              {j < arr.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

// ─── Scene Table ─────────────────────────────────────────────────────────────
function SceneTable({ scenes }: { scenes: ScriptScene[] }) {
  const [showVisual, setShowVisual] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportSrt = () => {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600).toString().padStart(2, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      return `${h}:${m}:${sec},000`;
    };
    const srt = scenes.map((s, i) =>
      `${s.sceneNumber}\n${fmt(i * 5)} --> ${fmt((i + 1) * 5)}\n${s.narration}\n`
    ).join('\n');
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'script.srt'; a.click();
    URL.revokeObjectURL(url);
  };

  const copyScript = () => {
    const text = scenes.map(s => `[씬 ${s.sceneNumber}]\n${s.narration}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const exportTxt = () => {
    const text = scenes.map(s =>
      `[씬 ${s.sceneNumber}]\n자막: ${s.narration}\n이미지: ${s.visualPrompt}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'script.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      marginTop: 12, marginLeft: 40,
      background: 'rgba(139,92,246,0.06)',
      border: '1px solid rgba(139,92,246,0.22)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(139,92,246,0.14)', borderBottom: '1px solid rgba(139,92,246,0.18)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#c4b5fd' }}>
          📋 스크립트 {scenes.length}씬
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setShowVisual(v => !v)}
            style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.70)', cursor: 'pointer' }}
          >{showVisual ? '프롬프트 숨기기' : '프롬프트 보기'}</button>
          <button
            onClick={copyScript}
            style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
          >{copied ? '✓ 복사됨' : '복사'}</button>
          <button
            onClick={exportTxt}
            style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
          >TXT</button>
          <button
            onClick={exportSrt}
            style={{ padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'rgba(139,92,246,0.28)', border: '1px solid rgba(139,92,246,0.38)', color: '#c4b5fd', cursor: 'pointer' }}
          >SRT 저장</button>
        </div>
      </div>

      {/* 씬 목록 */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {scenes.map(scene => (
          <div key={scene.sceneNumber} style={{
            padding: '10px 16px', display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12,
            borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'start',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#a78bfa',
            }}>{scene.sceneNumber}</span>
            <div>
              <div style={{ fontSize: 14, color: '#f1f5f9', lineHeight: 1.65 }}>{scene.narration}</div>
              {showVisual && scene.visualPrompt && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4, fontStyle: 'italic' }}>
                  {scene.visualPrompt}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Welcome message ─────────────────────────────────────────────────────────
const WELCOME = `안녕하세요! YouTube 스크립트 & 자막 생성 AI입니다.

원하는 주제를 입력하면 씬별 자막과 이미지 프롬프트를 바로 생성해 드립니다.

**예시:**
• "코로나 사태가 경제에 미친 영향 10씬 스크립트"
• "비트코인 전망 유튜브 영상 대본 만들어줘"
• "AI가 바꾸는 미래 — 나레이션 8개 씬"
• "삼성전자 실적 발표 뉴스 영상 자막"`;

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch (e: any) {
            if (!e.message?.includes('JSON')) throw e;
          }
        }
      }

      const scenes = extractScenes(fullText);
      if (scenes) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], scenes };
          return updated;
        });
      }

    } catch (e: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `❌ 오류: ${e.message}` };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages]);

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: WELCOME }]);
    setInput('');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'linear-gradient(160deg, #0f0720 0%, #0a0f2e 55%, #0f0720 100%)',
      color: '#fff', fontFamily: "'Noto Sans KR', system-ui, sans-serif",
    }}>
      {/* ── 헤더 ── */}
      <div style={{
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.22)', flexShrink: 0,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11,
          background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.3px' }}>TubeGen AI</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>
            YouTube 스크립트 & 자막 생성
          </div>
        </div>
        <button
          onClick={clearChat}
          style={{
            padding: '7px 14px', borderRadius: 9, fontSize: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)',
            color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
          }}
        >새 대화</button>
      </div>

      {/* ── 채팅 영역 ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 16px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((msg, i) => (
            <div key={i}>
              {/* 말풍선 */}
              <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, marginRight: 10, marginTop: 3,
                  }}>✨</div>
                )}
                <div style={{
                  maxWidth: '82%',
                  padding: '13px 17px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg,rgba(139,92,246,0.78),rgba(59,130,246,0.68))'
                    : 'rgba(255,255,255,0.07)',
                  border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.10)',
                  color: '#fff', fontSize: 14, lineHeight: 1.70,
                }}>
                  {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                  {msg.role === 'assistant' && i === messages.length - 1 && isStreaming && (
                    <span style={{
                      display: 'inline-block', width: 7, height: 14,
                      background: 'rgba(139,92,246,0.85)',
                      marginLeft: 2, verticalAlign: 'text-bottom',
                      animation: 'cur 0.75s steps(1) infinite',
                    }} />
                  )}
                </div>
              </div>

              {/* 씬 테이블 (JSON 파싱된 경우) */}
              {msg.scenes && msg.scenes.length > 0 && (
                <SceneTable scenes={msg.scenes} />
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── 입력 영역 ── */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.28)', padding: '16px',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isStreaming}
              placeholder="주제를 입력하세요. (예: 코로나 사태, 비트코인 전망, AI 미래)  Enter로 전송 / Shift+Enter 줄바꿈"
              rows={2}
              style={{
                flex: 1, padding: '13px 16px', borderRadius: 14, fontSize: 14,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', outline: 'none', resize: 'none',
                lineHeight: 1.55,
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isStreaming || !input.trim()}
              style={{
                padding: '0 22px', height: 52, borderRadius: 14, flexShrink: 0,
                background: isStreaming || !input.trim()
                  ? 'rgba(255,255,255,0.07)'
                  : 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
                border: 'none',
                cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
                color: isStreaming || !input.trim() ? 'rgba(255,255,255,0.35)' : '#fff',
                fontWeight: 700, fontSize: 15,
                boxShadow: isStreaming || !input.trim() ? 'none' : '0 4px 18px rgba(139,92,246,0.45)',
                transition: 'all 0.2s',
              }}
            >
              {isStreaming ? '생성 중...' : '시작'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>
            Powered by Claude Sonnet · Gemini Flash — 스크립트 JSON 감지 시 씬 테이블 자동 표시
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cur { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.35); border-radius: 10px; }
        textarea::placeholder { color: rgba(255,255,255,0.28); }
      `}</style>
    </div>
  );
}
