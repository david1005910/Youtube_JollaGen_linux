'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptScene } from '../types';

/* ── 글래스 토큰 ── */
const G = {
  overlay: 'rgba(10,5,30,0.82)',
  bg:      'rgba(255,255,255,0.07)',
  border:  '1px solid rgba(255,255,255,0.18)',
  blur:    'blur(22px)',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface GeminiChatModalProps {
  onClose: () => void;
  onUseScenes: (topic: string, scenes: ScriptScene[]) => void;
}

/* JSON 블록에서 씬 배열 추출 */
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

/* 메시지 텍스트 렌더 (마크다운 간이 처리) */
function renderContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lang = part.match(/```(\w*)/)?.[1] || '';
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
        {part.split('\n').map((line, j) => {
          const bold = line.replace(/\*\*(.*?)\*\*/g, '__BOLD__$1__BOLD__');
          const chunks = bold.split('__BOLD__');
          return (
            <React.Fragment key={j}>
              {chunks.map((chunk, k) =>
                k % 2 === 1
                  ? <strong key={k} style={{ color: '#e0e7ff' }}>{chunk}</strong>
                  : <span key={k}>{chunk}</span>
              )}
              {j < part.split('\n').length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

export default function GeminiChatModal({ onClose, onUseScenes }: GeminiChatModalProps) {
  const WELCOME = '안녕하세요! YouTube 자막/이미지 프롬프트 생성 전문 AI입니다.\n\n원하는 주제나 키워드를 입력하시면 씬별 자막과 이미지 프롬프트를 생성해 드립니다.\n\n예시:\n• "미국과 이란의 갈등에 대한 유튜브 영상 스크립트 만들어줘"\n• "비트코인 전망 10씬으로 만들어줘"\n• "인공지능이 바꾸는 미래 — 나레이션 8개 씬"';

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedScenes, setExtractedScenes] = useState<ScriptScene[] | null>(null);
  const [topic, setTopic] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (!topic) setTopic(text.slice(0, 50));

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setExtractedScenes(null);

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
            if (parsed.text) {
              fullText += parsed.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch {}
        }
      }

      const scenes = extractScenes(fullText);
      if (scenes) setExtractedScenes(scenes);

    } catch (e: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `❌ 오류: ${e.message}` };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, topic]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleUseScenes = () => {
    if (!extractedScenes) return;
    onUseScenes(topic || '대화 스크립트', extractedScenes);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: G.overlay,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 800, height: '88vh',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(15,7,40,0.92)',
        backdropFilter: G.blur, WebkitBackdropFilter: G.blur,
        border: G.border, borderRadius: 24,
        boxShadow: '0 24px 80px rgba(0,0,0,0.60), inset 0 0 40px rgba(139,92,246,0.06)',
        overflow: 'hidden',
      }}>

        {/* 헤더 */}
        <div style={{
          padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(139,92,246,0.10)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>✨</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Gemini 스크립트 생성 채팅</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
              대화로 자막+이미지 프롬프트 생성 → 바로 이미지/음성 생성
            </div>
          </div>
          {extractedScenes && (
            <button
              onClick={handleUseScenes}
              style={{
                marginLeft: 'auto', padding: '9px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg,#8B5CF6,#EC4899)',
                color: '#fff', fontWeight: 700, fontSize: 14, border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 4px 16px rgba(139,92,246,0.45)',
              }}
            >
              🚀 이 스크립트로 생성 시작 ({extractedScenes.length}씬)
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              marginLeft: extractedScenes ? 8 : 'auto',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.70)', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* 메시지 목록 */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 22px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, marginRight: 10, marginTop: 2,
                }}>✨</div>
              )}
              <div style={{
                maxWidth: '78%',
                padding: '12px 16px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg,rgba(139,92,246,0.70),rgba(59,130,246,0.60))'
                  : 'rgba(255,255,255,0.07)',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.10)',
                color: '#fff', fontSize: 14, lineHeight: 1.65,
              }}>
                {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                {msg.role === 'assistant' && i === messages.length - 1 && isStreaming && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 14,
                    background: 'rgba(139,92,246,0.8)',
                    marginLeft: 2, verticalAlign: 'text-bottom',
                    animation: 'gemCursor 0.8s steps(1) infinite',
                  }} />
                )}
              </div>
            </div>
          ))}

          {/* 씬 추출 알림 */}
          {extractedScenes && !isStreaming && (
            <div style={{
              padding: '14px 18px', borderRadius: 14,
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#c4b5fd' }}>
                  ✅ 스크립트 {extractedScenes.length}개 씬 감지됨
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', marginTop: 3 }}>
                  씬 미리보기: {extractedScenes[0]?.narration?.slice(0, 30)}...
                </div>
              </div>
              <button
                onClick={handleUseScenes}
                style={{
                  padding: '9px 20px', borderRadius: 10,
                  background: 'linear-gradient(135deg,#8B5CF6,#EC4899)',
                  color: '#fff', fontWeight: 700, fontSize: 13, border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(139,92,246,0.45)',
                }}
              >
                🚀 이미지+음성 생성 시작
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 입력창 */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.20)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="주제를 입력하세요. Enter로 전송, Shift+Enter로 줄바꿈"
              rows={2}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 14, fontSize: 14,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', outline: 'none', resize: 'none',
                lineHeight: 1.55,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isStreaming || !input.trim()}
              style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: isStreaming || !input.trim()
                  ? 'rgba(255,255,255,0.08)'
                  : 'linear-gradient(135deg,#8B5CF6,#06B6D4)',
                border: 'none', cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
                color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isStreaming || !input.trim() ? 'none' : '0 4px 16px rgba(139,92,246,0.45)',
                transition: 'all 0.2s',
              }}
            >
              {isStreaming ? '⏳' : '➤'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.30)', textAlign: 'center' }}>
            Powered by Gemini 2.5 Flash · JSON 스크립트 블록이 감지되면 자동으로 생성 버튼이 활성화됩니다
          </p>
        </div>
      </div>

      <style>{`
        @keyframes gemCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
