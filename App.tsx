'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptScene } from './types';
import YouTubeSkillChat from './components/YouTubeSkillChat';
import YouTubeClipperChat from './components/YouTubeClipperChat';
import CsvGenChat from './components/CsvGenChat';
import { RemotionPreview, type UploadedMedia } from './components/RemotionPreview';
import dynamic from 'next/dynamic';
const VideoEditor = dynamic(() => import('./components/VideoEditor'), { ssr: false });
const GraphicModule = dynamic(() => import('./components/GraphicModule'), { ssr: false });
const ScriptViewer = dynamic(() => import('./components/ScriptViewer'), { ssr: false });
const VideoWorkflow = dynamic(() => import('./components/VideoWorkflow'), { ssr: false });

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
          background: '#1a1815', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10, padding: '12px 14px', margin: '10px 0',
          fontSize: 13, color: '#c8b8a2', overflowX: 'auto', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', fontFamily: 'monospace',
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
                  ? <strong key={k} style={{ color: '#f0e8de', fontWeight: 600 }}>{chunk}</strong>
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
      marginTop: 14,
      background: '#252220',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#2a2724', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#c8b8a2' }}>
          📋 스크립트 {scenes.length}씬
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowVisual(v => !v)} style={btnStyle}>{showVisual ? '프롬프트 숨기기' : '프롬프트 보기'}</button>
          <button onClick={copyScript} style={btnStyle}>{copied ? '✓ 복사됨' : '복사'}</button>
          <button onClick={exportTxt} style={btnStyle}>TXT</button>
          <button onClick={exportSrt} style={{ ...btnStyle, background: 'rgba(217,117,89,0.18)', border: '1px solid rgba(217,117,89,0.35)', color: '#e09070' }}>SRT 저장</button>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {scenes.map(scene => (
          <div key={scene.sceneNumber} style={{
            padding: '10px 16px', display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12,
            borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'start',
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              background: 'rgba(217,117,89,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#d97559',
            }}>{scene.sceneNumber}</span>
            <div>
              <div style={{ fontSize: 14, color: '#e0d5ca', lineHeight: 1.7 }}>{scene.narration}</div>
              {showVisual && scene.visualPrompt && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 5, fontStyle: 'italic', lineHeight: 1.5 }}>
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

const btnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 7, fontSize: 11,
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
};

// ─── Welcome ─────────────────────────────────────────────────────────────────
const WELCOME = `안녕하세요! **[AI돈나] 대본 + 이미지 프롬프트 생성 AI**입니다.

마스터 캐릭터 이미지와 대본을 입력하면 영상 전체에서 **일관된 화풍**을 유지하며 씬별 이미지 프롬프트를 생성합니다.

**사용 순서:**
1. **마스터 캐릭터 이미지** 또는 화풍 설명을 먼저 입력
2. **대본 전체**를 붙여넣기 (빈 줄로 문단 구분)
3. AI가 화풍 키워드를 추출 후 확인 → 10장면씩 순서대로 생성

**핵심 규칙:**
• 1문단 = 1장면 (분할 절대 금지)
• 원본 대본 텍스트 수정·번역 없이 그대로 사용
• 마스터 캐릭터와 조연 인물 명확히 구분
• 모든 프롬프트에 텍스트 렌더링 방지 구문 자동 포함
• 10장면 단위로 출력 → "다음" 입력 시 이어서 생성

생성된 JSON은 **📋 스크립트** 버튼에서 확인·편집 후 이미지 생성에 바로 사용할 수 있습니다.`;

// ─── Claude-style Avatar ─────────────────────────────────────────────────────
function ClaudeAvatar() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: '#c96442',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px',
      marginTop: 2,
    }}>C</div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiModel, setAiModel] = useState<'claude' | 'gemini' | 'openai'>('claude');
  const [showYoutubeSkills, setShowYoutubeSkills] = useState(false);
  const [showClipper, setShowClipper] = useState(false);
  const [showCsvGen, setShowCsvGen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showGraphicModule, setShowGraphicModule] = useState(false);
  const [showScriptViewer, setShowScriptViewer] = useState(false);
  const [showVideoWorkflow, setShowVideoWorkflow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia>({ images: [], video: null });
  const [secPerScene, setSecPerScene] = useState(5);
  const [showPlayer, setShowPlayer] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [settingsAnthropicKey, setSettingsAnthropicKey] = useState('');
  const [settingsGeminiKey, setSettingsGeminiKey] = useState('');
  const [settingsOpenaiKey, setSettingsOpenaiKey] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [keyStatus, setKeyStatus] = useState<{ anthropicKeyMasked?: string; geminiKeyMasked?: string; openaiKeyMasked?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openSettings = async () => {
    setSettingsAnthropicKey('');
    setSettingsGeminiKey('');
    setSettingsOpenaiKey('');
    setSettingsMsg('');
    setShowSettings(true);
    try {
      const res = await fetch('/api/settings/apikey');
      const data = await res.json();
      setKeyStatus(data);
    } catch {}
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const body: Record<string, string> = {};
      if (settingsAnthropicKey.trim()) body.anthropicKey = settingsAnthropicKey.trim();
      if (settingsGeminiKey.trim()) body.geminiKey = settingsGeminiKey.trim();
      if (settingsOpenaiKey.trim()) body.openaiKey = settingsOpenaiKey.trim();
      if (Object.keys(body).length === 0) { setSettingsMsg('변경할 키를 입력하세요.'); return; }
      const res = await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setSettingsMsg('✅ 저장 완료! 즉시 적용됩니다.');
        setSettingsAnthropicKey('');
        setSettingsGeminiKey('');
        setSettingsOpenaiKey('');
        const res2 = await fetch('/api/settings/apikey');
        setKeyStatus(await res2.json());
      } else {
        setSettingsMsg(`❌ ${data.error}`);
      }
    } catch (e: any) {
      setSettingsMsg(`❌ ${e.message}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('tubegen_ai_model') as 'claude' | 'gemini' | 'openai' | null;
    if (saved === 'claude' || saved === 'gemini' || saved === 'openai') setAiModel(saved);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const switchModel = (model: 'claude' | 'gemini' | 'openai') => {
    setAiModel(model);
    localStorage.setItem('tubegen_ai_model', model);
  };

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
        body: JSON.stringify({ messages: newMessages, preferredModel: aiModel }),
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise<{ src: string; name: string }>(resolve => {
      const reader = new FileReader();
      reader.onload = ev => resolve({ src: ev.target!.result as string, name: f.name });
      reader.readAsDataURL(f);
    }))).then(imgs => {
      setUploadedMedia(prev => ({ ...prev, images: [...prev.images, ...imgs] }));
    });
    e.target.value = '';
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setUploadedMedia(prev => ({ ...prev, video: { src: ev.target!.result as string, name: file.name } }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setUploadedMedia(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: WELCOME }]);
    setInput('');
  };

  const modelLabel = aiModel === 'claude' ? 'Claude Sonnet 4.6' : aiModel === 'gemini' ? 'Gemini 2.0 Flash' : 'GPT-4o';
  const modelDotColor = aiModel === 'claude' ? '#c96442' : aiModel === 'gemini' ? '#4285F4' : '#10A37F';

  // 채팅에서 가장 최근 생성된 씬 목록
  const latestScenes = [...messages].reverse().find(m => m.scenes && m.scenes.length > 0)?.scenes ?? [];
  const hasMedia = uploadedMedia.images.length > 0 || uploadedMedia.video !== null;
  const canPreview = hasMedia && latestScenes.length > 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#1c1917',
      color: '#e0d5ca',
      fontFamily: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>

      {/* ── 헤더 ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 52,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: '#1c1917',
      }}>
        {/* 왼쪽: 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#c96442',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>T</div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e0d5ca', letterSpacing: '-0.2px' }}>YoutubeGenAI</span>
        </div>

        {/* 가운데: 모델명 */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <button
            onClick={() => switchModel(aiModel === 'claude' ? 'gemini' : aiModel === 'gemini' ? 'openai' : 'claude')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              color: '#c8b8a2', cursor: 'pointer',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: modelDotColor,
              display: 'inline-block', flexShrink: 0,
            }} />
            {modelLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* 오른쪽: 툴 버튼들 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowScriptViewer(true)}
            disabled={latestScenes.length === 0}
            style={{
              ...headerBtnStyle('#86efac', 'rgba(134,239,172,0.10)'),
              padding: '5px 11px', width: 'auto', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: latestScenes.length === 0 ? 0.35 : 1,
            }}
            title={latestScenes.length === 0 ? '스크립트를 먼저 생성하세요' : `스크립트 ${latestScenes.length}씬 보기`}
          >
            📋 스크립트
            {latestScenes.length > 0 && (
              <span style={{
                fontSize: 10, background: 'rgba(134,239,172,0.20)',
                padding: '1px 5px', borderRadius: 4, color: '#86efac',
              }}>{latestScenes.length}</span>
            )}
          </button>
          <button onClick={() => setShowGraphicModule(true)} style={{
            ...headerBtnStyle('#f59e0b', 'rgba(245,158,11,0.10)'),
            padding: '5px 11px', width: 'auto', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            🎨 그래픽
          </button>
          <button onClick={() => setShowVideoWorkflow(true)} style={{
            ...headerBtnStyle('#22d3ee', 'rgba(34,211,238,0.10)'),
            padding: '5px 11px', width: 'auto', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            🎞 영상편집
          </button>
          <button onClick={() => setShowEditor(true)} style={{
            ...headerBtnStyle('#a78bfa', 'rgba(167,139,250,0.10)'),
            padding: '5px 11px', width: 'auto', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            ✂️ 편집기
          </button>
          <button onClick={() => { setShowMedia(true); setShowPlayer(false); }} style={{
            ...headerBtnStyle('#22c55e', 'rgba(34,197,94,0.10)'),
            position: 'relative',
          }}>
            🎬
            {hasMedia && (
              <span style={{
                position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                borderRadius: '50%', background: '#22c55e', border: '1.5px solid #1c1917',
              }} />
            )}
          </button>
          <button onClick={() => setShowYoutubeSkills(true)} style={headerBtnStyle('#ef4444', 'rgba(239,68,68,0.12)')}>
            📺
          </button>
          <button onClick={() => setShowClipper(true)} style={headerBtnStyle('#eab308', 'rgba(234,179,8,0.10)')}>
            ✂️
          </button>
          <button onClick={() => setShowCsvGen(true)} style={{
            ...headerBtnStyle('#22c55e', 'rgba(34,197,94,0.10)'),
            padding: '5px 11px', width: 'auto', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            📊 CSV
          </button>
          {/* 외부 사이트 바로가기 */}
          <a
            href="https://claude.ai/project/019df143-69ba-7215-8d8d-6cb3f7917ff9"
            target="_blank"
            rel="noopener noreferrer"
            title="Claude CSV 생성 프로젝트"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'rgba(201,100,66,0.12)', border: '1px solid rgba(201,100,66,0.30)',
              color: '#e09070', textDecoration: 'none', cursor: 'pointer',
            }}
          >
            📋 CSV사이트
          </a>
          <a
            href="https://gemini.google.com/gem/c863da07b97e"
            target="_blank"
            rel="noopener noreferrer"
            title="Gemini 대본 생성 사이트"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.30)',
              color: '#80a8f0', textDecoration: 'none', cursor: 'pointer',
            }}
          >
            ✨ 대본사이트
          </a>
          <button onClick={clearChat} style={{
            padding: '5px 11px', borderRadius: 7, fontSize: 12,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
          }}>새 대화</button>
          <button onClick={openSettings} style={{
            width: 30, height: 30, borderRadius: 7, fontSize: 14,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="API 키 설정">⚙️</button>
        </div>
      </div>

      {/* ── 모달들 ── */}
      {showYoutubeSkills && <YouTubeSkillChat onClose={() => setShowYoutubeSkills(false)} />}
      {showClipper && <YouTubeClipperChat onClose={() => setShowClipper(false)} />}
      {showCsvGen && <CsvGenChat onClose={() => setShowCsvGen(false)} />}
      {showGraphicModule && (
        <GraphicModule
          initialScenes={latestScenes}
          onClose={() => setShowGraphicModule(false)}
          onSendToEditor={scenes => {
            setShowGraphicModule(false);
            setShowEditor(true);
          }}
        />
      )}
      {showScriptViewer && (
        <ScriptViewer
          scenes={latestScenes}
          onClose={() => setShowScriptViewer(false)}
        />
      )}
      {showVideoWorkflow && (
        <VideoWorkflow onClose={() => setShowVideoWorkflow(false)} />
      )}
      {showEditor && (
        <VideoEditor
          initialScenes={latestScenes}
          initialImages={uploadedMedia.images}
          initialVideo={uploadedMedia.video}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* ── 설정 모달 ── */}
      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowSettings(false)}>
          <div style={{
            background: '#252220', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16, padding: 28, width: 440, maxWidth: '92vw',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 22, color: '#e0d5ca' }}>API 키 설정</div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 7, display: 'flex', justifyContent: 'space-between' }}>
                <span>Claude (Anthropic) API Key</span>
                {keyStatus?.anthropicKeyMasked && <span style={{ color: '#c96442' }}>현재: {keyStatus.anthropicKeyMasked}</span>}
              </div>
              <input type="password" placeholder="sk-ant-api03-..." value={settingsAnthropicKey}
                onChange={e => setSettingsAnthropicKey(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 13, background: '#1c1917', border: '1px solid rgba(255,255,255,0.12)', color: '#e0d5ca', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>console.anthropic.com에서 발급 · 크레딧 충전 필요</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 7, display: 'flex', justifyContent: 'space-between' }}>
                <span>Gemini (Google) API Key</span>
                {keyStatus?.geminiKeyMasked && <span style={{ color: '#4285F4' }}>현재: {keyStatus.geminiKeyMasked}</span>}
              </div>
              <input type="password" placeholder="AIzaSy..." value={settingsGeminiKey}
                onChange={e => setSettingsGeminiKey(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 13, background: '#1c1917', border: '1px solid rgba(255,255,255,0.12)', color: '#e0d5ca', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>aistudio.google.com에서 발급 · 무료 티어 제공</div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 7, display: 'flex', justifyContent: 'space-between' }}>
                <span>OpenAI API Key</span>
                {keyStatus?.openaiKeyMasked && <span style={{ color: '#10A37F' }}>현재: {keyStatus.openaiKeyMasked}</span>}
              </div>
              <input type="password" placeholder="sk-..." value={settingsOpenaiKey}
                onChange={e => setSettingsOpenaiKey(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 13, background: '#1c1917', border: '1px solid rgba(255,255,255,0.12)', color: '#e0d5ca', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>platform.openai.com에서 발급 · GPT-4o 사용 (유료)</div>
            </div>

            {settingsMsg && (
              <div style={{ fontSize: 13, marginBottom: 14, color: settingsMsg.startsWith('✅') ? '#86efac' : '#fca5a5' }}>
                {settingsMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveSettings} disabled={settingsSaving} style={{
                flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 600,
                background: '#c96442', border: 'none', color: '#fff', cursor: 'pointer', opacity: settingsSaving ? 0.6 : 1,
              }}>{settingsSaving ? '저장 중...' : '저장'}</button>
              <button onClick={() => setShowSettings(false)} style={{
                padding: '10px 18px', borderRadius: 9, fontSize: 14,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 미디어 & Remotion 프리뷰 모달 ── */}
      {showMedia && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9100,
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={() => setShowMedia(false)}>
          <div style={{
            background: '#1e1c19', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 18, width: '100%', maxWidth: 860, maxHeight: '90vh',
            overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
          }} onClick={e => e.stopPropagation()}>

            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#e0d5ca' }}>🎬 미디어 업로드 & 프리뷰</span>
              <button onClick={() => setShowMedia(false)} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>

            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 씬 정보 */}
              {latestScenes.length > 0 ? (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.20)', fontSize: 13, color: '#86efac',
                }}>
                  ✅ 채팅에서 생성된 스크립트 {latestScenes.length}씬이 감지됐습니다.
                  이미지를 씬 순서대로 업로드하거나 영상을 업로드하세요.
                </div>
              ) : (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, background: 'rgba(255,200,0,0.08)',
                  border: '1px solid rgba(255,200,0,0.18)', fontSize: 13, color: '#fcd34d',
                }}>
                  ⚠️ 먼저 채팅에서 스크립트를 생성하면 자막이 자동으로 추가됩니다.
                </div>
              )}

              {/* 이미지 업로드 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c8b8a2', marginBottom: 10 }}>
                  이미지 업로드
                  {latestScenes.length > 0 && (
                    <span style={{ fontWeight: 400, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>
                      씬 순서대로 업로드 권장 ({uploadedMedia.images.length}/{latestScenes.length}장)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                  {/* 업로드된 이미지 썸네일 */}
                  {uploadedMedia.images.map((img, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img src={img.src} alt={img.name} style={{
                        width: 90, height: 60, objectFit: 'cover', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.12)',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 2, left: 2,
                        background: 'rgba(0,0,0,0.7)', color: '#fff',
                        fontSize: 10, padding: '1px 5px', borderRadius: 4,
                      }}>씬 {idx + 1}</div>
                      <button onClick={() => removeImage(idx)} style={{
                        position: 'absolute', top: -5, right: -5, width: 18, height: 18,
                        borderRadius: '50%', background: '#c96442', border: 'none',
                        color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '18px', padding: 0,
                      }}>×</button>
                    </div>
                  ))}
                  {/* 추가 버튼 */}
                  <button onClick={() => imageInputRef.current?.click()} style={{
                    width: 90, height: 60, borderRadius: 8, fontSize: 22,
                    background: 'rgba(255,255,255,0.05)', border: '1.5px dashed rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</button>
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />
              </div>

              {/* 영상 업로드 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#c8b8a2', marginBottom: 10 }}>영상 업로드</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => videoInputRef.current?.click()} style={{
                    padding: '9px 18px', borderRadius: 9, fontSize: 13,
                    background: uploadedMedia.video ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${uploadedMedia.video ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.12)'}`,
                    color: uploadedMedia.video ? '#86efac' : 'rgba(255,255,255,0.55)', cursor: 'pointer',
                  }}>
                    {uploadedMedia.video ? `✅ ${uploadedMedia.video.name}` : '+ 영상 파일 선택 (mp4, webm, mov)'}
                  </button>
                  {uploadedMedia.video && (
                    <button onClick={() => setUploadedMedia(prev => ({ ...prev, video: null }))} style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 12,
                      background: 'rgba(201,100,66,0.15)', border: '1px solid rgba(201,100,66,0.25)',
                      color: '#e09070', cursor: 'pointer',
                    }}>제거</button>
                  )}
                </div>
                <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={handleVideoUpload} />
              </div>

              {/* 씬당 시간 설정 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#c8b8a2', flexShrink: 0 }}>씬당 재생 시간</span>
                <input
                  type="range" min={2} max={15} step={1} value={secPerScene}
                  onChange={e => setSecPerScene(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#c96442' }}
                />
                <span style={{ fontSize: 13, color: '#e0d5ca', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{secPerScene}초</span>
              </div>

              {/* 프리뷰 버튼 */}
              {hasMedia && (
                <button
                  onClick={() => setShowPlayer(p => !p)}
                  style={{
                    padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    background: canPreview ? '#c96442' : '#2a2724',
                    border: canPreview ? 'none' : '1px solid rgba(255,255,255,0.10)',
                    color: canPreview ? '#fff' : 'rgba(255,255,255,0.35)', cursor: 'pointer',
                  }}
                >
                  {showPlayer ? '▲ 프리뷰 숨기기' : '▶ Remotion 프리뷰'}
                  {!canPreview && <span style={{ fontSize: 11, marginLeft: 8 }}>(스크립트 생성 후 사용 가능)</span>}
                </button>
              )}

              {/* Remotion Player */}
              {showPlayer && canPreview && (
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <RemotionPreview
                    scenes={latestScenes}
                    media={uploadedMedia}
                    secPerScene={secPerScene}
                  />
                  <div style={{
                    padding: '10px 14px', background: '#161412', fontSize: 12, color: 'rgba(255,255,255,0.35)',
                    display: 'flex', gap: 16,
                  }}>
                    <span>씬 {latestScenes.length}개</span>
                    <span>총 {latestScenes.length * secPerScene}초</span>
                    <span>이미지 {uploadedMedia.images.length}장</span>
                    {uploadedMedia.video && <span>영상: {uploadedMedia.video.name}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 채팅 영역 ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '32px 0 24px',
      }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                /* ── 사용자 메시지 ── */
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '12px 18px',
                    borderRadius: '18px 18px 4px 18px',
                    background: '#2e2b28',
                    color: '#e0d5ca', fontSize: 14, lineHeight: 1.7,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* ── AI 응답 ── */
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <ClaudeAvatar />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#c8b8a2', marginBottom: 8 }}>
                      {aiModel === 'claude' ? 'Claude' : aiModel === 'gemini' ? 'Gemini' : 'GPT-4o'}
                    </div>
                    <div style={{ fontSize: 14.5, lineHeight: 1.78, color: '#d8cfc5' }}>
                      {renderContent(msg.content)}
                      {i === messages.length - 1 && isStreaming && (
                        <span style={{
                          display: 'inline-block', width: 2, height: 16,
                          background: '#c96442',
                          marginLeft: 2, verticalAlign: 'text-bottom',
                          animation: 'cur 0.75s steps(1) infinite',
                        }} />
                      )}
                    </div>
                    {msg.scenes && msg.scenes.length > 0 && (
                      <SceneTable scenes={msg.scenes} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── 입력 영역 ── */}
      <div style={{ flexShrink: 0, padding: '0 24px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            background: '#2a2724',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 16,
            padding: '4px 4px 4px 16px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}>
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
              placeholder="주제를 입력하세요.  (Enter 전송 / Shift+Enter 줄바꿈)"
              rows={2}
              style={{
                width: '100%', border: 'none', outline: 'none', resize: 'none',
                background: 'transparent',
                color: '#e0d5ca', fontSize: 14.5, lineHeight: 1.65,
                padding: '10px 0 6px', fontFamily: 'inherit',
              }}
            />
            {/* 하단 바 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 }}>
              {/* 모델 토글 */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => switchModel('claude')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: aiModel === 'claude' ? 'rgba(201,100,66,0.22)' : 'transparent',
                    color: aiModel === 'claude' ? '#e09070' : 'rgba(255,255,255,0.35)',
                  }}
                >Claude</button>
                <button
                  onClick={() => switchModel('gemini')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: aiModel === 'gemini' ? 'rgba(66,133,244,0.20)' : 'transparent',
                    color: aiModel === 'gemini' ? '#80a8f0' : 'rgba(255,255,255,0.35)',
                  }}
                >Gemini</button>
                <button
                  onClick={() => switchModel('openai')}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: aiModel === 'openai' ? 'rgba(16,163,127,0.20)' : 'transparent',
                    color: aiModel === 'openai' ? '#5bc8a8' : 'rgba(255,255,255,0.35)',
                  }}
                >GPT-4o</button>
              </div>

              {/* 전송 버튼 */}
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: isStreaming || !input.trim() ? 'rgba(255,255,255,0.08)' : '#c96442',
                  border: 'none',
                  cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {isStreaming ? (
                  <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#fff' : 'rgba(255,255,255,0.25)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cur { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 10px; }
        textarea::placeholder { color: rgba(255,255,255,0.22); }
        button { font-family: inherit; }
      `}</style>
    </div>
  );
}

function headerBtnStyle(color: string, bg: string): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 7, fontSize: 14,
    background: bg, border: `1px solid ${color}30`,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}
