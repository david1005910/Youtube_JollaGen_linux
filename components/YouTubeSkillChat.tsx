'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ─── Skill definitions ──────────────────────────────────────────────────── */
type SkillCategory = 'creator' | 'data';

interface SkillDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  category: SkillCategory;
  placeholder?: string;
}

const SKILLS: SkillDef[] = [
  // ── Creator skills (Gemini AI) ──────────────────────────────────────────
  { id: 'audit',      name: '채널 진단',      emoji: '🔍', category: 'creator', desc: '채널 종합 건강 진단 (SEO·퍼포먼스·전략·수익화 4개 분석)' },
  { id: 'script',     name: '스크립트',        emoji: '📝', category: 'creator', desc: '리텐션 설계 스크립트 (훅·패턴 인터럽트·CTA 포함)' },
  { id: 'hook',       name: '훅 작성',          emoji: '🎣', category: 'creator', desc: '오프닝 훅 5개 변형 + 이탈률 위험 예측' },
  { id: 'seo',        name: 'SEO 최적화',       emoji: '🔎', category: 'creator', desc: '제목·설명·태그·챕터·해시태그 SEO 패키지' },
  { id: 'thumbnail',  name: '썸네일',           emoji: '🖼️', category: 'creator', desc: '썸네일 브리프 + A/B 변형 3개' },
  { id: 'strategy',   name: '채널 전략',        emoji: '🎯', category: 'creator', desc: '포지셔닝·닉 정의·30/60/90일 마일스톤' },
  { id: 'calendar',   name: '콘텐츠 캘린더',   emoji: '📅', category: 'creator', desc: '월간 업로드 플랜 + Shorts 계획' },
  { id: 'shorts',     name: 'Shorts 전략',      emoji: '⚡', category: 'creator', desc: 'Shorts 제작·알고리즘·수익화 패키지' },
  { id: 'analyze',    name: '성과 분석',        emoji: '📊', category: 'creator', desc: '분석 지표 해석 + 우선 액션 플랜' },
  { id: 'repurpose',  name: '콘텐츠 재활용',   emoji: '♻️', category: 'creator', desc: '영상 → Shorts·SNS 크로스플랫폼 변환' },
  { id: 'monetize',   name: '수익화 전략',      emoji: '💰', category: 'creator', desc: '7가지 수익화 스트림 전략 및 액션 플랜' },
  { id: 'competitor', name: '경쟁 분석',        emoji: '🏆', category: 'creator', desc: '경쟁 채널 분석 + 키워드·포맷·오디언스 갭 발굴' },
  { id: 'metadata',   name: '메타데이터',       emoji: '📋', category: 'creator', desc: '업로드 즉시 복붙 가능한 제목·설명·태그 패키지' },
  { id: 'ideate',     name: '영상 아이디어',   emoji: '💡', category: 'creator', desc: '키워드 기반 영상 아이디어 10개 + 우선순위 분석' },

  // ── Data skills (TranscriptAPI.com) ────────────────────────────────────
  {
    id: 'transcript',
    name: '자막 추출',
    emoji: '📜',
    category: 'data',
    desc: 'YouTube 영상 자막·스크립트 추출 (타임스탬프 포함)',
    placeholder: 'YouTube 영상 URL을 붙여넣으세요… (예: https://youtu.be/xxxxx)',
  },
  {
    id: 'youtube-data',
    name: 'YouTube 데이터',
    emoji: '📡',
    category: 'data',
    desc: '영상·채널·검색·플레이리스트 데이터 실시간 조회',
    placeholder: 'YouTube URL, @채널핸들, 또는 검색어를 입력하세요…',
  },
];

const CREATOR_SKILLS = SKILLS.filter(s => s.category === 'creator');
const DATA_SKILLS    = SKILLS.filter(s => s.category === 'data');

interface Message { role: 'user' | 'assistant'; content: string; }
interface Props    { onClose: () => void; }

/* ─── Simple markdown renderer ──────────────────────────────────────────── */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;color:#93c5fd;margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:15px;font-weight:700;color:#60a5fa;margin:14px 0 6px;border-bottom:1px solid #1e3a5f;padding-bottom:4px">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:16px;font-weight:800;color:#38bdf8;margin:14px 0 8px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0;font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em style="color:#cbd5e1">$1</em>')
    .replace(/`(.+?)`/g,      '<code style="background:#0f172a;padding:1px 5px;border-radius:4px;font-size:12px;color:#7dd3fc">$1</code>')
    .replace(/^\|[-| ]+\|$/gm, '')
    .replace(/^\| (.+) \|$/gm, (_, row) => {
      const cells = row.split(' | ').map((c: string) =>
        `<td style="padding:4px 8px;border:1px solid #1e293b">${c.trim()}</td>`
      ).join('');
      return `<tr>${cells}</tr>`;
    })
    .replace(/(<tr>[^]*?<\/tr>(\n|<br\/>)?)+/gm, m =>
      `<table style="border-collapse:collapse;font-size:12px;width:100%;margin:8px 0">${m}</table>`)
    .replace(/^[-•] (.+)$/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, m => `<ul style="list-style:disc;padding-left:16px;margin:6px 0">${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>')
    .replace(/^- \[ \] (.+)$/gm,  '<li style="margin:3px 0;list-style:none;padding-left:4px">☐ $1</li>')
    .replace(/^- \[x\] (.+)$/gim, '<li style="margin:3px 0;list-style:none;padding-left:4px">☑ $1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

/* ─── Welcome messages ──────────────────────────────────────────────────── */
function welcomeMessage(skill: SkillDef): string {
  if (skill.id === 'transcript') {
    return `**${skill.emoji} ${skill.name}** 스킬이 활성화됐습니다.\n\n${skill.desc}\n\n**가능한 작업:**\n- 영상 내용 요약\n- 핵심 인용구·명언 추출\n- 한국어↔영어 번역\n- 타임스탬프 챕터 생성\n- 팩트체크\n\nYouTube 영상 URL을 붙여넣어 시작하세요!`;
  }
  if (skill.id === 'youtube-data') {
    return `**${skill.emoji} ${skill.name}** 스킬이 활성화됐습니다.\n\n${skill.desc}\n\n**지원 입력 형식:**\n- 📺 **영상 URL** → 자막 + 메타데이터 조회\n- 📢 **채널 URL / @핸들** → 최신 영상 목록\n- 🔍 **검색어** → YouTube 검색 결과 (첫 메시지)\n- 📋 **플레이리스트 URL** → 영상 목록\n\nURL이나 검색어를 입력해 시작하세요!\n\n> ⚠️ TRANSCRIPT_API_KEY가 필요합니다. 없으면 .env.local에 추가해주세요.`;
  }
  // Creator skills
  return `**${skill.emoji} ${skill.name}** 스킬이 활성화됐습니다.\n\n${skill.desc}\n\n시작하기 전에 아래 정보를 알려주세요:\n1. **채널 주제/닉** — 구체적으로 (예: "30대 직장인 재테크" / "언박싱 리뷰")\n2. **구독자 규모** — 신규(<1K) / 성장(1K-10K) / 정착(10K-100K) / 권위(100K+)\n3. **주요 목표** — 성장 / 수익화 / 브랜딩 / 커뮤니티\n\n(바로 원하는 내용을 물어봐도 됩니다!)`;
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function YouTubeSkillChat({ onClose }: Props) {
  const [selectedSkill, setSelectedSkill] = useState<SkillDef | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [streamText,    setStreamText]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  const handleSkillSelect = (skill: SkillDef) => {
    abortRef.current?.abort();
    setSelectedSkill(skill);
    setMessages([{ role: 'assistant', content: welcomeMessage(skill) }]);
    setStreamText('');
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !selectedSkill) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    setStreamText('');
    abortRef.current = new AbortController();

    const apiEndpoint = selectedSkill.category === 'data'
      ? '/api/youtube/data'
      : '/api/youtube/chat';

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillType: selectedSkill.id, messages: newMessages }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`API 오류 ${res.status}`);

      const reader  = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer      = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) { accumulated += parsed.text; setStreamText(accumulated); }
            } catch {}
          }
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated || '응답을 받지 못했습니다.' }]);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const msg = e.message?.includes('429') || e.message?.includes('quota')
          ? 'Gemini API 할당량 초과입니다. 잠시 후 다시 시도해주세요.'
          : `오류가 발생했습니다: ${e.message}`;
        setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
      }
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  }, [input, isLoading, selectedSkill, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setSelectedSkill(null);
    setMessages([]);
    setStreamText('');
    setInput('');
  };

  /* ── Styles ──────────────────────────────────────────────────────────── */
  const S = {
    overlay:  { position: 'fixed' as const, inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    window:   { width: '92vw', height: '88vh', maxWidth: '1280px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: '20px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' },
    titleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1e293b', background: 'linear-gradient(90deg,#0a0f1e,#0f172a)', flexShrink: 0 },
    body:     { display: 'flex', flex: 1, overflow: 'hidden' },
    sidebar:  { width: '200px', borderRight: '1px solid #1e293b', overflowY: 'auto' as const, padding: '8px 6px', flexShrink: 0, scrollbarWidth: 'thin' as const },
    chatArea: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    messages: { flex: 1, overflowY: 'auto' as const, padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: '16px', scrollbarWidth: 'thin' as const },
    inputRow: { padding: '14px 20px', borderTop: '1px solid #1e293b', display: 'flex', gap: '10px', alignItems: 'flex-end', flexShrink: 0 },
  };

  const skillBtn = (skill: SkillDef, selected: boolean) => ({
    width: '100%', textAlign: 'left' as const, padding: '8px 10px', borderRadius: '8px', border: 'none',
    cursor: 'pointer', marginBottom: '2px',
    background: selected
      ? skill.category === 'data'
        ? 'linear-gradient(135deg,#0f766e,#0e7490)'
        : 'linear-gradient(135deg,#1d4ed8,#7c3aed)'
      : 'transparent',
    color: selected ? '#fff' : '#94a3b8',
    transition: 'all 0.15s',
  });

  const msgBubble = (role: string) => ({
    maxWidth: '82%', padding: '12px 16px', borderRadius: role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
    background: role === 'user' ? 'linear-gradient(135deg,#1d4ed8,#7c3aed)' : '#0f172a',
    color: '#e2e8f0', fontSize: '14px', lineHeight: '1.65',
    border: role === 'assistant' ? '1px solid #1e293b' : 'none',
  });

  const dataAvatar = () => ({
    width: 32, height: 32, borderRadius: '50%',
    background: 'linear-gradient(135deg,#0f766e,#0e7490)',
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
    flexShrink: 0, fontSize: 16, userSelect: 'none' as const,
  });

  const creatorAvatar = () => ({
    width: 32, height: 32, borderRadius: '50%',
    background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
    flexShrink: 0, fontSize: 16, userSelect: 'none' as const,
  });

  const avatarStyle = () => selectedSkill?.category === 'data' ? dataAvatar() : creatorAvatar();

  const inputPlaceholder = selectedSkill?.placeholder
    ?? (selectedSkill ? `${selectedSkill.name}에 대해 질문하세요… (Enter 전송 / Shift+Enter 줄바꿈)` : '');

  const sendBtnActive = !isLoading && !!input.trim();
  const sendBtnBg = sendBtnActive
    ? selectedSkill?.category === 'data'
      ? 'linear-gradient(135deg,#0f766e,#0e7490)'
      : 'linear-gradient(135deg,#1d4ed8,#7c3aed)'
    : '#0f172a';

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.window}>

        {/* Title bar */}
        <div style={S.titleBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#dc2626,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#f8fafc' }}>YouTube Skill Studio</div>
              <div style={{ fontSize: 11, color: '#475569' }}>AI 유튜브 어시스턴트 · 크리에이터 14개 + 데이터 2개 스킬</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedSkill && (
              <button onClick={handleReset} style={{ background: 'none', border: '1px solid #1e293b', color: '#64748b', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
                ↩ 처음으로
              </button>
            )}
            <button onClick={onClose} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>

          {/* Sidebar */}
          <div style={S.sidebar}>

            {/* Creator skills section */}
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, padding: '6px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              크리에이터 스킬
            </div>
            {CREATOR_SKILLS.map(skill => (
              <button key={skill.id} onClick={() => handleSkillSelect(skill)} style={skillBtn(skill, selectedSkill?.id === skill.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{skill.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{skill.name}</span>
                </div>
              </button>
            ))}

            {/* Divider */}
            <div style={{ margin: '10px 4px 8px', borderTop: '1px solid #1e293b' }} />

            {/* Data skills section */}
            <div style={{ fontSize: 10, color: '#0d9488', fontWeight: 700, padding: '0 8px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              데이터 스킬
            </div>
            {DATA_SKILLS.map(skill => (
              <button key={skill.id} onClick={() => handleSkillSelect(skill)} style={skillBtn(skill, selectedSkill?.id === skill.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{skill.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{skill.name}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Chat / Welcome */}
          <div style={S.chatArea}>
            {!selectedSkill ? (

              /* Welcome screen */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', color: '#475569', gap: 20, overflowY: 'auto' }}>
                <div style={{ fontSize: 48 }}>▶</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>어떤 유튜브 작업을 도와드릴까요?</div>
                <div style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 1.7 }}>
                  왼쪽 사이드바에서 스킬을 선택하거나, 아래에서 바로 클릭하세요.
                </div>

                {/* Creator skill cards */}
                <div style={{ width: '100%', maxWidth: 680 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    크리에이터 스킬
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                    {['audit','script','hook','seo','thumbnail','strategy','ideate','shorts'].map(id => {
                      const sk = SKILLS.find(s => s.id === id)!;
                      return (
                        <button key={id} onClick={() => handleSkillSelect(sk)} style={{
                          padding: '12px 8px', borderRadius: 12, border: '1px solid #1e293b',
                          background: '#0f172a', cursor: 'pointer', color: '#94a3b8',
                          textAlign: 'center', transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1d4ed8'; (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1e293b'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 5 }}>{sk.emoji}</div>
                          <div style={{ fontSize: 11, fontWeight: 500 }}>{sk.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Data skill cards */}
                <div style={{ width: '100%', maxWidth: 680 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    데이터 스킬 (TranscriptAPI.com)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                    {DATA_SKILLS.map(sk => (
                      <button key={sk.id} onClick={() => handleSkillSelect(sk)} style={{
                        padding: '14px 16px', borderRadius: 12, border: '1px solid #134e4a',
                        background: '#042f2e', cursor: 'pointer', color: '#5eead4',
                        textAlign: 'left', transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#0d9488'; (e.currentTarget as HTMLElement).style.background = '#0f3f3a'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#134e4a'; (e.currentTarget as HTMLElement).style.background = '#042f2e'; }}
                      >
                        <span style={{ fontSize: 26 }}>{sk.emoji}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{sk.name}</div>
                          <div style={{ fontSize: 11, color: '#2dd4bf', lineHeight: 1.4 }}>{sk.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            ) : (
              <>
                {/* Skill header bar */}
                <div style={{
                  padding: '10px 20px', borderBottom: '1px solid #1e293b',
                  display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                  background: selectedSkill.category === 'data' ? 'rgba(4,47,46,0.4)' : 'transparent',
                }}>
                  <span style={{ fontSize: 20 }}>{selectedSkill.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{selectedSkill.name}</span>
                      {selectedSkill.category === 'data' && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#134e4a', color: '#2dd4bf', fontWeight: 600 }}>
                          LIVE DATA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSkill.desc}</div>
                  </div>
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#0f172a', border: '1px solid #1e293b', fontSize: 11, color: '#64748b' }}>
                    {messages.filter(m => m.role === 'user').length}개 대화
                  </span>
                </div>

                {/* Messages */}
                <div style={S.messages}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start' }}>
                      {msg.role === 'assistant' && <div style={avatarStyle()}>{selectedSkill.emoji}</div>}
                      <div style={msgBubble(msg.role)}>
                        {msg.role === 'assistant'
                          ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          : <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>}
                      </div>
                    </div>
                  ))}

                  {/* Streaming bubble */}
                  {isLoading && streamText && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={avatarStyle()}>{selectedSkill.emoji}</div>
                      <div style={{ ...msgBubble('assistant'), borderColor: selectedSkill.category === 'data' ? '#0f766e' : '#1d4ed8' }}>
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }} />
                        <span style={{ display: 'inline-block', width: 6, height: 14, background: '#60a5fa', marginLeft: 2, animation: 'blink 1s infinite', borderRadius: 1 }} />
                      </div>
                    </div>
                  )}

                  {/* Loading dots */}
                  {isLoading && !streamText && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={avatarStyle()}>{selectedSkill.emoji}</div>
                      <div style={{ ...msgBubble('assistant'), display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px' }}>
                        {[0,1,2].map(i => (
                          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#475569', display: 'block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Input bar */}
                <div style={S.inputRow}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={inputPlaceholder}
                    disabled={isLoading}
                    rows={2}
                    style={{
                      flex: 1, background: '#0f172a', borderRadius: 12,
                      border: `1px solid ${selectedSkill.category === 'data' ? '#134e4a' : '#1e293b'}`,
                      padding: '12px 16px', color: '#f1f5f9', fontSize: 14, resize: 'none', outline: 'none',
                      lineHeight: 1.5, fontFamily: 'inherit', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.target.style.borderColor = selectedSkill.category === 'data' ? '#0d9488' : '#1d4ed8'}
                    onBlur={e => e.target.style.borderColor = selectedSkill.category === 'data' ? '#134e4a' : '#1e293b'}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      onClick={sendMessage}
                      disabled={!sendBtnActive}
                      style={{
                        padding: '12px 20px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14,
                        cursor: sendBtnActive ? 'pointer' : 'not-allowed',
                        background: sendBtnBg,
                        color: sendBtnActive ? '#fff' : '#334155',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      전송 ↑
                    </button>
                    {isLoading && (
                      <button onClick={() => abortRef.current?.abort()} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #334155', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>
                        중단
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
