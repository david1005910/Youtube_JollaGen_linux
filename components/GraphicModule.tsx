'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { ScriptScene } from '../types';
import { IMAGE_MODELS } from '../config';

// ─── 내부 씬 타입 ────────────────────────────────────────────────────────────
interface GMScene {
  id: string;
  narration: string;
  visualPrompt: string;
  imageSrc: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  error: string;
  audioSrc: string;
  audioStatus: 'idle' | 'generating' | 'done' | 'error';
  audioError: string;
}

interface RefImages {
  character: string[]; // base64 data URLs, max 2
  style: string[];     // base64 data URLs, max 2
}

type Mode = 'input' | 'generate' | 'output';

let _id = 0;
const uid = () => `gm_${++_id}_${Date.now()}`;

function makeScene(s?: Partial<GMScene>): GMScene {
  return {
    id: uid(), narration: '', visualPrompt: '', imageSrc: '',
    status: 'idle', error: '',
    audioSrc: '', audioStatus: 'idle', audioError: '',
    ...s,
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  initialScenes: ScriptScene[];
  onClose: () => void;
  onSendToEditor?: (scenes: { narration: string; visualPrompt: string; imageSrc: string }[]) => void;
}

// ─── 모드 메타 ────────────────────────────────────────────────────────────────
const MODES: { key: Mode; icon: string; label: string; sub: string }[] = [
  { key: 'input',    icon: '✏️', label: '스크립트 입력', sub: 'Input Mode' },
  { key: 'generate', icon: '⚙️', label: '이미지 생성',   sub: 'Generate Mode' },
  { key: 'output',   icon: '🎬', label: '결과 출력',     sub: 'Output Mode' },
];

// ─── 모델 피커 ───────────────────────────────────────────────────────────────
const PROVIDER_COLOR: Record<string, string> = {
  'Google':  '#4285F4',
  'fal.ai':  '#f59e0b',
};

function ModelPicker({ current, onSelect, onCancel }: {
  current: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.70)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onCancel}>
      <div style={{ width: '100%', maxWidth: 860, background: '#1e1c19', borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 32px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', background: '#252220', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e0d5ca' }}>🎨 이미지 생성 모델 선택</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginTop: 3 }}>이미지를 생성할 AI 모델을 선택하세요</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {IMAGE_MODELS.map(m => {
            const isSelected = current === m.id;
            const isHovered  = hovered === m.id;
            const pColor     = PROVIDER_COLOR[(m as any).provider] ?? '#c96442';
            const isFree     = m.pricePerImage === 0;
            return (
              <div key={m.id} onClick={() => onSelect(m.id)} onMouseEnter={() => setHovered(m.id)} onMouseLeave={() => setHovered(null)}
                style={{ borderRadius: 12, padding: '14px 16px', cursor: 'pointer', border: `1.5px solid ${isSelected ? '#c96442' : isHovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`, background: isSelected ? 'rgba(201,100,66,0.10)' : isHovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', transition: 'all 0.15s', position: 'relative' }}>
                {isSelected && <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: '#c96442', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</div>}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, background: pColor + '18', border: `1px solid ${pColor}35`, marginBottom: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: pColor }}>{(m as any).provider}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e0d5ca', marginBottom: 4, lineHeight: 1.3 }}>{(m as any).name.replace(' (무료)', '')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginBottom: 10 }}>{(m as any).description}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: isFree ? 'rgba(134,239,172,0.12)' : 'rgba(147,197,253,0.12)', border: `1px solid ${isFree ? 'rgba(134,239,172,0.25)' : 'rgba(147,197,253,0.22)'}`, color: isFree ? '#86efac' : '#93c5fd' }}>{isFree ? '무료' : `$${m.pricePerImage}/장`}</span>
                  <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>{(m as any).speed === '빠름' ? '⚡ 빠름' : (m as any).speed === '보통' ? '🔄 보통' : '🐢 느림'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '14px 22px', background: '#1a1815', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.45)', cursor: 'pointer' }}>취소</button>
          <button onClick={() => onSelect(current)} style={{ padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#c96442', border: 'none', color: '#fff', cursor: 'pointer' }}>이 모델로 이미지 생성 →</button>
        </div>
      </div>
    </div>
  );
}

// ─── 참조 이미지 피커 ─────────────────────────────────────────────────────────
function RefImagePicker({ refImages, onUpdate, onClose }: {
  refImages: RefImages;
  onUpdate: (ref: RefImages) => void;
  onClose: () => void;
}) {
  const charInput = useRef<HTMLInputElement>(null);
  const styleInput = useRef<HTMLInputElement>(null);

  const readFile = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target?.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  const addImages = async (type: 'character' | 'style', files: FileList | null) => {
    if (!files) return;
    const existing = refImages[type];
    const remaining = 2 - existing.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).slice(0, remaining);
    const dataUrls = await Promise.all(toAdd.map(readFile));
    onUpdate({ ...refImages, [type]: [...existing, ...dataUrls] });
  };

  const removeImage = (type: 'character' | 'style', idx: number) => {
    const next = refImages[type].filter((_, i) => i !== idx);
    onUpdate({ ...refImages, [type]: next });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 620, background: '#1e1c19', borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 32px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ padding: '18px 22px', background: '#252220', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e0d5ca' }}>🖼 참조 이미지 설정</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginTop: 3 }}>캐릭터·스타일 일관성을 위한 참조 이미지 (Gemini 전용, 최대 각 2장)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 캐릭터 참조 */}
          {(['character', 'style'] as const).map(type => (
            <div key={type}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e0d5ca' }}>
                    {type === 'character' ? '👤 캐릭터 참조 이미지' : '🎨 스타일 참조 이미지'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 2 }}>
                    {type === 'character' ? '캐릭터 외모·복장 일관성 유지' : '전체 화풍·분위기·색감 참조'}
                  </div>
                </div>
                {refImages[type].length < 2 && (
                  <button
                    onClick={() => (type === 'character' ? charInput : styleInput).current?.click()}
                    style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: 'rgba(201,100,66,0.14)', border: '1px solid rgba(201,100,66,0.28)', color: '#e09070', cursor: 'pointer' }}>
                    + 이미지 추가
                  </button>
                )}
              </div>
              <input
                ref={type === 'character' ? charInput : styleInput}
                type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={e => addImages(type, e.target.files)}
              />
              {refImages[type].length === 0 ? (
                <div
                  onClick={() => (type === 'character' ? charInput : styleInput).current?.click()}
                  style={{ border: '2px dashed rgba(255,255,255,0.10)', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.22)', fontSize: 12 }}>
                  클릭하여 이미지 업로드 (최대 2장)
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10 }}>
                  {refImages[type].map((src, idx) => (
                    <div key={idx} style={{ position: 'relative', width: 120, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      <button onClick={() => removeImage(type, idx)} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ))}
                  {refImages[type].length < 2 && (
                    <div onClick={() => (type === 'character' ? charInput : styleInput).current?.click()} style={{ width: 120, height: 80, borderRadius: 8, border: '2px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>+ 추가</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 안내 + 하단 버튼 */}
        <div style={{ padding: '10px 22px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '10px 14px', background: 'rgba(66,133,244,0.07)', border: '1px solid rgba(66,133,244,0.15)', borderRadius: 8, fontSize: 11, color: 'rgba(147,197,253,0.70)', lineHeight: 1.6 }}>
            ℹ️ 참조 이미지는 <strong>Gemini 모델 전용</strong>입니다. fal.ai 모델 선택 시 이미지 없이 텍스트 프롬프트만 사용됩니다.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {(refImages.character.length > 0 || refImages.style.length > 0) && (
              <button onClick={() => onUpdate({ character: [], style: [] })} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5', cursor: 'pointer' }}>전체 초기화</button>
            )}
            <button onClick={onClose} style={{ padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#c96442', border: 'none', color: '#fff', cursor: 'pointer' }}>확인</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function GraphicModule({ initialScenes, onClose, onSendToEditor }: Props) {
  const [mode, setMode] = useState<Mode>('input');
  const [scenes, setScenes] = useState<GMScene[]>(() => {
    if (initialScenes.length > 0) {
      return initialScenes.map(s => makeScene({ narration: s.narration, visualPrompt: s.visualPrompt }));
    }
    return [makeScene()];
  });
  const [selectedId, setSelectedId] = useState<string>(scenes[0]?.id ?? '');
  const [imageModel, setImageModel] = useState<string>('gemini-2.0-flash-image');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [refImages, setRefImages] = useState<RefImages>({ character: [], style: [] });
  const abortRef = useRef(false);

  const updateScene = useCallback((id: string, patch: Partial<GMScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const addScene = () => {
    const s = makeScene();
    setScenes(prev => [...prev, s]);
    setSelectedId(s.id);
  };

  const deleteScene = (id: string) => {
    setScenes(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(s => s.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? '');
      return next;
    });
  };

  // ── 단일 씬 이미지 생성 ──────────────────────────────────────────────────
  const generateOne = useCallback(async (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (!scene?.visualPrompt.trim()) {
      updateScene(id, { status: 'error', error: '이미지 프롬프트를 입력하세요.' });
      return;
    }
    updateScene(id, { status: 'generating', error: '' });
    try {
      // Gemini 모델일 때만 참조 이미지 전송
      const isGemini = imageModel === 'gemini-2.0-flash-image';
      const allRefImages = isGemini
        ? [...refImages.character, ...refImages.style]
        : [];

      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: scene.visualPrompt,
          modelId: imageModel,
          ...(allRefImages.length > 0 && { referenceImages: allRefImages }),
        }),
      });
      const data = await res.json() as { imageUrl?: string; imageDataUrl?: string; error?: string };
      if (data.error) throw new Error(data.error);
      updateScene(id, { imageSrc: data.imageDataUrl ?? data.imageUrl ?? '', status: 'done', error: '' });
    } catch (err: any) {
      updateScene(id, { status: 'error', error: err.message ?? '생성 실패' });
    }
  }, [scenes, imageModel, refImages, updateScene]);

  // ── 단일 씬 TTS 생성 ─────────────────────────────────────────────────────
  const generateAudio = useCallback(async (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (!scene?.narration.trim()) {
      updateScene(id, { audioStatus: 'error', audioError: '나레이션 텍스트가 없습니다.' });
      return;
    }
    updateScene(id, { audioStatus: 'generating', audioError: '' });
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scene.narration }),
      });
      const data = await res.json() as { audioDataUrl?: string; error?: string };
      if (data.error) throw new Error(data.error);
      updateScene(id, { audioSrc: data.audioDataUrl ?? '', audioStatus: 'done', audioError: '' });
    } catch (err: any) {
      updateScene(id, { audioStatus: 'error', audioError: err.message ?? 'TTS 실패' });
    }
  }, [scenes, updateScene]);

  // ── 전체 순차 생성 ──────────────────────────────────────────────────────
  const generateAll = useCallback(async () => {
    setIsGeneratingAll(true);
    abortRef.current = false;
    for (const scene of scenes) {
      if (abortRef.current) break;
      if (scene.status === 'done') continue;
      await generateOne(scene.id);
      if (!abortRef.current) await new Promise(r => setTimeout(r, 800));
    }
    setIsGeneratingAll(false);
  }, [scenes, generateOne]);

  const stopAll = () => { abortRef.current = true; setIsGeneratingAll(false); };

  const downloadAll = () => {
    scenes.forEach((s, i) => {
      if (!s.imageSrc) return;
      const a = document.createElement('a');
      a.href = s.imageSrc;
      a.download = `scene_${String(i + 1).padStart(2, '0')}.jpg`;
      a.click();
    });
  };

  const doneCount = scenes.filter(s => s.status === 'done').length;
  const selectedScene = scenes.find(s => s.id === selectedId);
  const totalRefCount = refImages.character.length + refImages.style.length;
  const isGeminiModel = imageModel === 'gemini-2.0-flash-image';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9300, background: '#0f0e0c', color: '#e0d5ca', fontFamily: "'Noto Sans KR', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── 상단 모드 스테퍼 ── */}
      <div style={{ flexShrink: 0, background: '#161412', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#c96442', marginRight: 28, letterSpacing: '-0.2px', flexShrink: 0 }}>🎨 Graphic Module</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {MODES.map((m, i) => {
            const isActive = mode === m.key;
            const isDone = MODES.findIndex(x => x.key === mode) > i;
            return (
              <React.Fragment key={m.key}>
                <button onClick={() => setMode(m.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 28px', border: 'none', cursor: 'pointer', background: isActive ? 'rgba(201,100,66,0.10)' : 'transparent', borderBottom: isActive ? '2px solid #c96442' : '2px solid transparent', gap: 3, transition: 'all 0.15s' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: isActive ? 'rgba(201,100,66,0.22)' : isDone ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', border: isActive ? '1.5px solid rgba(201,100,66,0.60)' : isDone ? '1.5px solid rgba(34,197,94,0.40)' : '1.5px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.15s' }}>
                    {isDone ? '✓' : m.icon}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#e09070' : isDone ? '#86efac' : 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>{m.sub}</div>
                </button>
                {i < MODES.length - 1 && (
                  <div style={{ width: 48, height: 1, background: isDone ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)', flexShrink: 0, position: 'relative', top: -8 }}>
                    <div style={{ position: 'absolute', right: -5, top: -4, fontSize: 10, color: isDone ? '#86efac66' : 'rgba(255,255,255,0.15)' }}>▶</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <button onClick={onClose} style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', marginLeft: 16, flexShrink: 0 }}>✕ 닫기</button>
      </div>

      {/* ── 컨텐츠 영역 ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ══════════════ INPUT MODE ══════════════ */}
        {mode === 'input' && (
          <>
            {/* 왼쪽 씬 목록 */}
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', background: '#141210', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>씬 목록 ({scenes.length})</span>
                <button onClick={addScene} style={smallBtn}>+ 씬 추가</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {scenes.map((s, i) => (
                  <div key={s.id} onClick={() => setSelectedId(s.id)} style={{ margin: '3px 8px', padding: '8px 10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${selectedId === s.id ? 'rgba(201,100,66,0.50)' : 'rgba(255,255,255,0.06)'}`, background: selectedId === s.id ? 'rgba(201,100,66,0.07)' : 'rgba(255,255,255,0.02)', transition: 'all 0.1s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>씬 {i + 1}</div>
                      {s.audioStatus === 'done' && <span title="음성 생성됨" style={{ fontSize: 10 }}>🔊</span>}
                    </div>
                    <div style={{ fontSize: 12, color: s.narration ? '#d0c4b8' : 'rgba(255,255,255,0.18)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {s.narration || '(나레이션 없음)'}
                    </div>
                    {s.visualPrompt && (
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', marginTop: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        🖼 {s.visualPrompt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* 하단 버튼들 */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <button onClick={() => setShowRefPicker(true)} style={{ width: '100%', padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, background: totalRefCount > 0 ? 'rgba(66,133,244,0.18)' : 'rgba(255,255,255,0.06)', border: `1px solid ${totalRefCount > 0 ? 'rgba(66,133,244,0.35)' : 'rgba(255,255,255,0.10)'}`, color: totalRefCount > 0 ? '#93c5fd' : 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  🖼 참조 이미지 {totalRefCount > 0 ? `(${totalRefCount}장)` : '설정'}
                </button>
                <button onClick={() => setShowModelPicker(true)} style={{ width: '100%', padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'rgba(201,100,66,0.85)', border: 'none', color: '#fff', cursor: 'pointer' }}>🎨 모델 선택 후 생성 →</button>
              </div>
            </div>

            {/* 오른쪽 편집 패널 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              {selectedScene ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                  <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>씬 {scenes.findIndex(s => s.id === selectedId) + 1} / {scenes.length}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0d5ca' }}>스크립트 편집</div>
                      </div>
                      <button onClick={() => deleteScene(selectedId)} style={{ ...smallBtn, background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.22)', color: '#fca5a5' }} disabled={scenes.length <= 1}>삭제</button>
                    </div>

                    {/* 나레이션 */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelSt}>📝 나레이션 (화면에 표시될 자막 텍스트)</label>
                      <textarea value={selectedScene.narration} onChange={e => updateScene(selectedId, { narration: e.target.value })} rows={4} placeholder="이 씬에서 내레이터가 읽을 텍스트를 입력하세요..." style={textareaSt} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)' }}>{selectedScene.narration.length}자</div>
                        <AudioButton scene={selectedScene} onGenerate={() => generateAudio(selectedId)} />
                      </div>
                    </div>

                    {/* 이미지 프롬프트 */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelSt}>🎨 이미지 프롬프트 (영어 권장)</label>
                      <textarea value={selectedScene.visualPrompt} onChange={e => updateScene(selectedId, { visualPrompt: e.target.value })} rows={4} placeholder="A stick figure standing in front of a rising stock chart, vibrant colors, 16:9 composition..." style={{ ...textareaSt, color: '#a09080' }} />
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>{selectedScene.visualPrompt.length}자</div>
                    </div>

                    {/* 씬 이동 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {scenes.findIndex(s => s.id === selectedId) > 0 && (
                        <button onClick={() => { const idx = scenes.findIndex(s => s.id === selectedId); setSelectedId(scenes[idx - 1].id); }} style={navBtn}>← 이전 씬</button>
                      )}
                      <button onClick={addScene} style={{ ...navBtn, flex: 1, justifyContent: 'center' }}>+ 새 씬 추가</button>
                      {scenes.findIndex(s => s.id === selectedId) < scenes.length - 1 && (
                        <button onClick={() => { const idx = scenes.findIndex(s => s.id === selectedId); setSelectedId(scenes[idx + 1].id); }} style={navBtn}>다음 씬 →</button>
                      )}
                    </div>

                    {/* 팁 */}
                    <div style={{ marginTop: 28, padding: '14px 18px', background: 'rgba(201,100,66,0.05)', border: '1px solid rgba(201,100,66,0.12)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(201,100,66,0.70)', marginBottom: 8 }}>✨ 프롬프트 작성 팁</div>
                      <ul style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.8, margin: 0, paddingLeft: 16 }}>
                        <li>영어로 작성하면 더 좋은 이미지가 나옵니다</li>
                        <li>구도, 색상, 스타일을 함께 명시하세요 (예: vibrant, minimal, dark)</li>
                        <li>인물 묘사 시: <code style={{ color: '#c8b8a2' }}>stick figure</code> 또는 <code style={{ color: '#c8b8a2' }}>simple character</code></li>
                        <li>16:9 구도를 명시하면 영상에 적합한 이미지가 생성됩니다</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.20)', fontSize: 14 }}>왼쪽에서 씬을 선택하세요</div>
              )}
            </div>
          </>
        )}

        {/* ══════════════ GENERATE MODE ══════════════ */}
        {mode === 'generate' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* 컨트롤 바 */}
            <div style={{ flexShrink: 0, padding: '10px 20px', background: '#161412', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* 현재 모델 + 변경 */}
              {(() => {
                const m = IMAGE_MODELS.find(x => x.id === imageModel) ?? IMAGE_MODELS[0];
                const pColor = PROVIDER_COLOR[(m as any).provider] ?? '#c96442';
                const isFree = m.pricePerImage === 0;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#d0c4b8' }}>{(m as any).name.replace(' (무료)', '')}</span>
                      <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: isFree ? 'rgba(134,239,172,0.12)' : 'rgba(147,197,253,0.12)', color: isFree ? '#86efac' : '#93c5fd', border: `1px solid ${isFree ? 'rgba(134,239,172,0.22)' : 'rgba(147,197,253,0.20)'}` }}>{isFree ? '무료' : `$${m.pricePerImage}`}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{(m as any).speed === '빠름' ? '⚡' : (m as any).speed === '보통' ? '🔄' : '🐢'}</span>
                    </div>
                    <button onClick={() => setShowModelPicker(true)} style={{ padding: '5px 11px', borderRadius: 7, fontSize: 11.5, background: 'rgba(201,100,66,0.14)', border: '1px solid rgba(201,100,66,0.28)', color: '#e09070', cursor: 'pointer', fontWeight: 500 }}>🎨 모델 변경</button>
                  </div>
                );
              })()}

              {/* 참조 이미지 버튼 (Gemini만 활성) */}
              <button
                onClick={() => setShowRefPicker(true)}
                title={isGeminiModel ? '참조 이미지 설정' : 'Gemini 모델에서만 사용 가능'}
                style={{ padding: '5px 11px', borderRadius: 7, fontSize: 11.5, background: totalRefCount > 0 ? 'rgba(66,133,244,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${totalRefCount > 0 ? 'rgba(66,133,244,0.30)' : 'rgba(255,255,255,0.09)'}`, color: totalRefCount > 0 ? '#93c5fd' : (isGeminiModel ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.20)'), cursor: isGeminiModel ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
                🖼 참조{totalRefCount > 0 ? ` (${totalRefCount})` : ''}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <div style={{ fontSize: 12, color: doneCount === scenes.length ? '#86efac' : 'rgba(255,255,255,0.35)' }}>{doneCount}/{scenes.length} 완료</div>
                <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(doneCount / scenes.length) * 100}%`, background: '#c96442', borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
              {isGeneratingAll ? (
                <button onClick={stopAll} style={actionBtn('#fca5a5', 'rgba(239,68,68,0.15)')}>⏹ 중단</button>
              ) : (
                <button onClick={generateAll} style={actionBtn('#e09070', 'rgba(201,100,66,0.18)')}>⚡ 전체 생성</button>
              )}
              {doneCount === scenes.length && doneCount > 0 && (
                <button onClick={() => setMode('output')} style={actionBtn('#86efac', 'rgba(34,197,94,0.15)')}>🎬 결과 보기 →</button>
              )}
            </div>

            {/* 씬 카드 그리드 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {scenes.map((s, i) => (
                  <GenerateCard
                    key={s.id} scene={s} index={i}
                    onGenerate={() => generateOne(s.id)}
                    onGenerateAudio={() => generateAudio(s.id)}
                    onEdit={() => { setMode('input'); setSelectedId(s.id); }}
                    isGeneratingAll={isGeneratingAll}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ OUTPUT MODE ══════════════ */}
        {mode === 'output' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flexShrink: 0, padding: '12px 20px', background: '#161412', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e0d5ca' }}>결과: {doneCount}/{scenes.length}개 이미지 생성됨</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('generate')} style={actionBtn('#c8b8a2', 'rgba(255,255,255,0.07)')}>← 생성 화면</button>
                {doneCount > 0 && <button onClick={downloadAll} style={actionBtn('#93c5fd', 'rgba(147,197,253,0.12)')}>⬇ 전체 다운로드</button>}
                {onSendToEditor && doneCount > 0 && (
                  <button onClick={() => onSendToEditor(scenes.map(s => ({ narration: s.narration, visualPrompt: s.visualPrompt, imageSrc: s.imageSrc })))} style={actionBtn('#a78bfa', 'rgba(167,139,250,0.15)')}>✂️ 편집기로 전송</button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {doneCount === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'rgba(255,255,255,0.25)' }}>
                  <div style={{ fontSize: 48 }}>🖼</div>
                  <div style={{ fontSize: 14 }}>생성된 이미지가 없습니다.</div>
                  <button onClick={() => setMode('generate')} style={{ ...actionBtn('#e09070', 'rgba(201,100,66,0.18)'), marginTop: 8 }}>⚙️ 이미지 생성하러 가기</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {scenes.map((s, i) => (
                    <OutputCard key={s.id} scene={s} index={i} onLightbox={src => setLightboxSrc(src)} onRetry={() => setMode('generate')} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 모달들 ── */}
      {showModelPicker && (
        <ModelPicker current={imageModel} onSelect={id => { setImageModel(id); setShowModelPicker(false); if (mode === 'input') setMode('generate'); }} onCancel={() => setShowModelPicker(false)} />
      )}
      {showRefPicker && (
        <RefImagePicker refImages={refImages} onUpdate={setRefImages} onClose={() => setShowRefPicker(false)} />
      )}
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img src={lightboxSrc} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }} alt="" />
          <button onClick={() => setLightboxSrc(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', opacity: 0.7 }}>✕</button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-border { 0%,100%{opacity:0.5} 50%{opacity:1} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        button:disabled { opacity: 0.3 !important; cursor: not-allowed !important; }
      `}</style>
    </div>
  );
}

// ─── 음성 버튼 (인라인) ────────────────────────────────────────────────────
function AudioButton({ scene, onGenerate }: { scene: GMScene; onGenerate: () => void }) {
  if (scene.audioStatus === 'done' && scene.audioSrc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <audio controls src={scene.audioSrc} style={{ height: 26, borderRadius: 5, accentColor: '#c96442', maxWidth: 180 }} />
        <button onClick={onGenerate} title="재생성" style={{ ...smallBtn, padding: '3px 7px', fontSize: 10 }}>🔄</button>
      </div>
    );
  }
  if (scene.audioStatus === 'generating') {
    return <div style={{ fontSize: 11, color: 'rgba(201,100,66,0.70)', display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, height: 12, border: '2px solid rgba(201,100,66,0.25)', borderTop: '2px solid #c96442', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />음성 생성 중...</div>;
  }
  if (scene.audioStatus === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ fontSize: 10.5, color: '#fca5a5' }}>{scene.audioError.slice(0, 50)}</div>
        <button onClick={onGenerate} style={{ ...smallBtn, fontSize: 10, padding: '2px 7px' }}>↺</button>
      </div>
    );
  }
  return (
    <button onClick={onGenerate} disabled={!scene.narration.trim()} style={{ ...smallBtn, background: 'rgba(201,100,66,0.12)', borderColor: 'rgba(201,100,66,0.25)', color: '#e09070', padding: '4px 10px', fontSize: 11.5 }}>🔊 음성 생성</button>
  );
}

// ─── 생성 카드 ─────────────────────────────────────────────────────────────
function GenerateCard({ scene, index, onGenerate, onGenerateAudio, onEdit, isGeneratingAll }: {
  scene: GMScene;
  index: number;
  onGenerate: () => void;
  onGenerateAudio: () => void;
  onEdit: () => void;
  isGeneratingAll: boolean;
}) {
  const isGenerating = scene.status === 'generating';
  const isDone = scene.status === 'done';
  const isError = scene.status === 'error';
  const borderColor = isGenerating ? '#c96442' : isDone ? 'rgba(34,197,94,0.50)' : isError ? 'rgba(239,68,68,0.40)' : 'rgba(255,255,255,0.08)';

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${borderColor}`, background: '#1a1714', boxShadow: isGenerating ? `0 0 0 1px ${borderColor}` : 'none', animation: isGenerating ? 'pulse-border 1.5s ease-in-out infinite' : 'none', transition: 'border-color 0.3s' }}>
      {/* 이미지 영역 16:9 */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#0d0b09', position: 'relative', overflow: 'hidden' }}>
        {isDone && scene.imageSrc ? (
          <img src={scene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            {isGenerating ? (
              <><div style={{ width: 32, height: 32, border: '3px solid rgba(201,100,66,0.20)', borderTop: '3px solid #c96442', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><div style={{ fontSize: 11, color: 'rgba(201,100,66,0.70)' }}>생성 중...</div></>
            ) : isError ? (
              <div style={{ textAlign: 'center', padding: '0 16px' }}><div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div><div style={{ fontSize: 10.5, color: '#fca5a5', lineHeight: 1.5 }}>{scene.error.slice(0, 100)}</div></div>
            ) : (
              <div style={{ fontSize: 36, opacity: 0.12 }}>🖼</div>
            )}
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>씬 {index + 1}</div>
        <div style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: isGenerating ? 'rgba(201,100,66,0.85)' : isDone ? 'rgba(34,197,94,0.85)' : isError ? 'rgba(239,68,68,0.80)' : 'rgba(0,0,0,0.60)', color: '#fff' }}>
          {isGenerating ? '생성 중' : isDone ? '완료' : isError ? '오류' : '대기'}
        </div>
      </div>

      {/* 나레이션 + 컨트롤 */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, color: scene.narration ? '#c8b8a2' : 'rgba(255,255,255,0.20)', lineHeight: 1.5, marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{scene.narration || '(나레이션 없음)'}</div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', marginBottom: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{scene.visualPrompt || '(프롬프트 없음)'}</div>

        {/* 음성 플레이어 (생성됐을 때) */}
        {scene.audioStatus === 'done' && scene.audioSrc && (
          <div style={{ marginBottom: 8 }}>
            <audio controls src={scene.audioSrc} style={{ width: '100%', height: 24, borderRadius: 4, accentColor: '#c96442' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={{ ...smallBtn, flex: 1, justifyContent: 'center' }}>✏️ 편집</button>
          <button onClick={onGenerateAudio} disabled={scene.audioStatus === 'generating' || !scene.narration.trim()} style={{ ...smallBtn, flex: 1.5, justifyContent: 'center', background: scene.audioStatus === 'done' ? 'rgba(201,100,66,0.10)' : 'rgba(255,255,255,0.04)', color: scene.audioStatus === 'done' ? '#e09070' : 'rgba(255,255,255,0.40)' }}>
            {scene.audioStatus === 'generating' ? '🔊...' : scene.audioStatus === 'done' ? '🔊 재생성' : '🔊 음성'}
          </button>
          <button onClick={onGenerate} disabled={isGenerating || isGeneratingAll} style={{ ...smallBtn, flex: 2, justifyContent: 'center', background: isDone ? 'rgba(34,197,94,0.12)' : 'rgba(201,100,66,0.18)', borderColor: isDone ? 'rgba(34,197,94,0.28)' : 'rgba(201,100,66,0.30)', color: isDone ? '#86efac' : '#e09070' }}>
            {isGenerating ? '생성 중...' : isDone ? '🔄 재생성' : isError ? '↺ 재시도' : '🎨 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 출력 카드 ─────────────────────────────────────────────────────────────
function OutputCard({ scene, index, onLightbox, onRetry }: {
  scene: GMScene;
  index: number;
  onLightbox: (src: string) => void;
  onRetry: () => void;
}) {
  const download = () => {
    const a = document.createElement('a');
    a.href = scene.imageSrc;
    a.download = `scene_${String(index + 1).padStart(2, '0')}.jpg`;
    a.click();
  };

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${scene.imageSrc ? 'rgba(255,255,255,0.10)' : 'rgba(239,68,68,0.25)'}`, background: '#1a1714', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.45)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#0d0b09', position: 'relative', overflow: 'hidden', cursor: scene.imageSrc ? 'zoom-in' : 'default' }} onClick={() => scene.imageSrc && onLightbox(scene.imageSrc)}>
        {scene.imageSrc ? (
          <>
            <img src={scene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '24px 14px 12px', fontSize: 12, color: '#e8e0d8', lineHeight: 1.5 }}>{scene.narration}</div>
            <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.60)', padding: '3px 8px', borderRadius: 5, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>🔍 확대</div>
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 20 }}>⚠️</div>
            <div style={{ fontSize: 10.5, color: '#fca5a5' }}>{scene.error || '이미지 없음'}</div>
          </div>
        )}
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>씬 {index + 1}</div>
      </div>

      {/* 오디오 플레이어 */}
      {scene.audioStatus === 'done' && scene.audioSrc && (
        <div style={{ padding: '8px 12px 4px', background: 'rgba(201,100,66,0.05)', borderTop: '1px solid rgba(201,100,66,0.10)' }}>
          <audio controls src={scene.audioSrc} style={{ width: '100%', height: 28, borderRadius: 4, accentColor: '#c96442' }} />
        </div>
      )}

      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, fontSize: 10.5, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{scene.visualPrompt || '(프롬프트 없음)'}</div>
        {scene.imageSrc ? (
          <button onClick={download} title="이미지 다운로드" style={{ ...smallBtn, padding: '4px 8px' }}>⬇</button>
        ) : (
          <button onClick={onRetry} style={{ ...smallBtn, borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>재시도</button>
        )}
      </div>
    </div>
  );
}

// ─── 스타일 상수 ─────────────────────────────────────────────────────────────
const smallBtn: React.CSSProperties = {
  padding: '4px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.50)', cursor: 'pointer', display: 'flex', alignItems: 'center',
};
const navBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 7, fontSize: 12,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center',
};
const actionBtn = (color: string, bg: string): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
  background: bg, border: `1px solid ${color}40`, color, cursor: 'pointer',
  whiteSpace: 'nowrap',
});
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 8,
};
const textareaSt: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 9, fontSize: 13.5,
  background: '#1e1b18', border: '1px solid rgba(255,255,255,0.09)',
  color: '#e0d5ca', outline: 'none', resize: 'vertical', fontFamily: 'inherit',
  lineHeight: 1.65, boxSizing: 'border-box',
};
