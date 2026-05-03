'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScriptScene, ReferenceImages, DEFAULT_REFERENCE_IMAGES, GenerationStep } from '../types';
import { CONFIG, IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId } from '../config';
import { getSelectedImageModel, setSelectedImageModel } from '../services/imageConfig';

/* ── 글래스 토큰 ── */
const G = {
  bg:     'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  blur:   'blur(18px)',
  glow:   'inset 0 0 14px rgba(255,255,255,0.08)',
  shadow: '0 8px 32px rgba(0,0,0,0.30)',
};
const glass = { background: G.bg, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, border: G.border, boxShadow: `${G.glow}, ${G.shadow}` } as const;

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Props
═══════════════════════════════════════════════════════════════════════════ */
interface MainStudioProps {
  step: GenerationStep;
  onStartFullGeneration: (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string | null,
    previewedScenes?: ScriptScene[]
  ) => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════════════════════════ */
export default function MainStudio({ step, onStartFullGeneration }: MainStudioProps) {
  /* ── 입력 상태 ── */
  const [inputMode, setInputMode] = useState<'keyword' | 'manual'>('keyword');
  const [keyword, setKeyword]     = useState('');
  const [manual, setManual]       = useState('');

  /* ── 스크립트 미리보기 상태 ── */
  const [scriptScenes, setScriptScenes] = useState<ScriptScene[]>([]);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError]   = useState('');

  /* ── 편집/복사 상태 ── */
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'narration' | 'visualPrompt' } | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [copiedKey, setCopiedKey]     = useState<string | null>(null);

  /* ── 설정 패널 ── */
  const [showSettings, setShowSettings] = useState(false);
  const [imageModel, setImageModel]     = useState<ImageModelId>(() => getSelectedImageModel());
  const [charRefImages, setCharRefImages] = useState<string[]>([]);
  const [styleRefImages, setStyleRefImages] = useState<string[]>([]);
  const charFileRef  = useRef<HTMLInputElement>(null);
  const styleFileRef = useRef<HTMLInputElement>(null);

  const isGenerating = step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS;

  /* ── 이미지 모델 변경 ── */
  const handleModelChange = (id: ImageModelId) => {
    setImageModel(id);
    setSelectedImageModel(id);
  };

  /* ── 참조 이미지 업로드 ── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'char' | 'style') => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const data = ev.target?.result as string;
        if (type === 'char')  setCharRefImages(prev => [...prev.slice(-1), data]);
        else                  setStyleRefImages(prev => [...prev.slice(-1), data]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  /* ── 자막+프롬프트 생성 (Gemini 스크립트만) ── */
  const handleGenerateScript = useCallback(async () => {
    const topic      = inputMode === 'keyword' ? keyword.trim() : 'Manual Script Input';
    const sourceText = inputMode === 'manual'  ? manual.trim() : null;
    if (!topic && !sourceText) return;

    setScriptLoading(true);
    setScriptError('');
    setScriptScenes([]);

    try {
      const isLong = (sourceText?.length ?? 0) > 3000;
      const url    = isLong ? '/api/gemini/script-chunked' : '/api/gemini/script';
      const body: any = { topic, hasReferenceImage: charRefImages.length > 0 };
      if (sourceText) body.sourceContext = sourceText;
      if (isLong)     body.chunkSize    = 2500;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const scenes: ScriptScene[] = await res.json();
      setScriptScenes(scenes);
    } catch (e: any) {
      setScriptError(e.message || '알 수 없는 오류');
    } finally {
      setScriptLoading(false);
    }
  }, [inputMode, keyword, manual, charRefImages.length]);

  /* ── 전체 생성 (이미지+음성) ── */
  const handleFullGeneration = useCallback(() => {
    const topic      = inputMode === 'keyword' ? keyword.trim() : 'Manual Script Input';
    const sourceText = inputMode === 'manual'  ? manual.trim()  : null;
    const refImgs: ReferenceImages = {
      ...DEFAULT_REFERENCE_IMAGES,
      character: charRefImages,
      style:     styleRefImages,
    };
    onStartFullGeneration(topic, refImgs, sourceText, scriptScenes.length > 0 ? scriptScenes : undefined);
  }, [inputMode, keyword, manual, charRefImages, styleRefImages, scriptScenes, onStartFullGeneration]);

  /* ── 복사 ── */
  const handleCopy = (text: string, key: string) => {
    copyText(text); setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };
  const handleCopyAll = (field: 'narration' | 'visualPrompt') => {
    const all = scriptScenes.map(s =>
      field === 'narration'
        ? `[씬 ${s.sceneNumber}] ${s.narration}`
        : `[씬 ${s.sceneNumber}] ${s.visualPrompt}`
    ).join('\n\n');
    handleCopy(all, `all-${field}`);
  };

  /* ── 인라인 편집 ── */
  const startEdit = (idx: number, field: 'narration' | 'visualPrompt') => {
    setEditingCell({ idx, field });
    setEditValue(scriptScenes[idx][field]);
  };
  const commitEdit = () => {
    if (!editingCell) return;
    setScriptScenes(prev => prev.map((s, i) =>
      i === editingCell.idx ? { ...s, [editingCell.field]: editValue } : s
    ));
    setEditingCell(null);
  };

  /* ══════════════════════════════════════════════════════════════════════════
     Render
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px' }}>

      {/* ── 입력 패널 ── */}
      <div style={{ ...glass, borderRadius: 22, padding: '28px 28px 22px', marginBottom: 24 }}>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['keyword', 'manual'] as const).map(m => (
            <button key={m} onClick={() => setInputMode(m)}
              style={{
                padding: '7px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                background: inputMode === m
                  ? 'linear-gradient(135deg,rgba(139,92,246,.75),rgba(59,130,246,.65))'
                  : 'rgba(255,255,255,0.07)',
                color: '#fff',
                border: inputMode === m ? '1px solid rgba(255,255,255,.30)' : '1px solid rgba(255,255,255,.12)',
                boxShadow: inputMode === m ? '0 2px 12px rgba(139,92,246,.35)' : 'none',
              }}>
              {m === 'keyword' ? '🔍 키워드 검색' : '📝 대본 직접 입력'}
            </button>
          ))}
          <button onClick={() => setShowSettings(s => !s)}
            style={{
              marginLeft: 'auto', padding: '7px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              background: showSettings ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,.15)',
            }}>
            ⚙️ 설정 {showSettings ? '▲' : '▼'}
          </button>
        </div>

        {/* 입력 영역 */}
        {inputMode === 'keyword' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input
              type="text" value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !scriptLoading && !isGenerating && handleGenerateScript()}
              placeholder="예: 미국과 이란의 전쟁, 비트코인 전망, 인공지능 혁명..."
              disabled={scriptLoading || isGenerating}
              style={{
                flex: 1, padding: '13px 18px', borderRadius: 13, fontSize: 15,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,.20)',
                color: '#fff', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionBtn
                label={scriptLoading ? '⏳ 생성 중...' : '✨ 자막+프롬프트 생성'}
                onClick={handleGenerateScript}
                disabled={scriptLoading || isGenerating || !keyword.trim()}
                gradient="linear-gradient(135deg,#06B6D4,#3B82F6)"
                glow="rgba(6,182,212,.45)"
              />
              <ActionBtn
                label={isGenerating ? '⏳ 전체 생성 중...' : '🚀 이미지+음성 생성'}
                onClick={handleFullGeneration}
                disabled={isGenerating || (!keyword.trim())}
                gradient="linear-gradient(135deg,#8B5CF6,#EC4899)"
                glow="rgba(139,92,246,.45)"
              />
            </div>
          </div>
        ) : (
          <div>
            <textarea
              value={manual} onChange={e => setManual(e.target.value)} rows={6}
              placeholder="대본을 직접 입력하세요. 자막과 이미지 프롬프트가 자동 생성됩니다..."
              disabled={scriptLoading || isGenerating}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 13, fontSize: 14,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,.20)',
                color: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <ActionBtn
                label={scriptLoading ? '⏳ 생성 중...' : '✨ 자막+프롬프트 생성'}
                onClick={handleGenerateScript}
                disabled={scriptLoading || isGenerating || !manual.trim()}
                gradient="linear-gradient(135deg,#06B6D4,#3B82F6)"
                glow="rgba(6,182,212,.45)"
              />
              <ActionBtn
                label={isGenerating ? '⏳ 전체 생성 중...' : '🚀 이미지+음성 생성'}
                onClick={handleFullGeneration}
                disabled={isGenerating || !manual.trim()}
                gradient="linear-gradient(135deg,#8B5CF6,#EC4899)"
                glow="rgba(139,92,246,.45)"
              />
            </div>
          </div>
        )}

        {/* 설정 패널 (접힘) */}
        {showSettings && (
          <div style={{
            marginTop: 22, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,.12)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
          }}>
            {/* 이미지 모델 */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.50)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                🎨 이미지 모델
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {IMAGE_MODELS.filter(m => m.provider === 'Google').map(m => (
                  <ModelBtn key={m.id} id={m.id as ImageModelId} name={m.name}
                    desc={m.description} tier={m.tier as 'free'|'paid'}
                    selected={imageModel === m.id} onClick={handleModelChange} />
                ))}
              </div>
            </div>

            {/* 참조 이미지 */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.50)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                🖼️ 참조 이미지 (선택)
              </p>
              <RefImageSection
                label="캐릭터 참조"
                images={charRefImages}
                onUpload={e => handleImageUpload(e, 'char')}
                onRemove={i => setCharRefImages(prev => prev.filter((_, idx) => idx !== i))}
                fileRef={charFileRef}
              />
              <div style={{ marginTop: 10 }}>
                <RefImageSection
                  label="스타일 참조"
                  images={styleRefImages}
                  onUpload={e => handleImageUpload(e, 'style')}
                  onRemove={i => setStyleRefImages(prev => prev.filter((_, idx) => idx !== i))}
                  fileRef={styleFileRef}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 에러 ── */}
      {scriptError && (
        <div style={{
          padding: '14px 20px', borderRadius: 14, marginBottom: 20,
          background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,.35)',
          color: '#fda4af', fontSize: 14,
        }}>
          ❌ {scriptError}
        </div>
      )}

      {/* ── 로딩 ── */}
      {scriptLoading && (
        <div style={{ ...glass, borderRadius: 20, padding: '40px 20px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 34, marginBottom: 12, animation: 'studioSpin 1.2s linear infinite', display: 'inline-block' }}>⚙️</div>
          <p style={{ color: 'rgba(255,255,255,.80)', fontSize: 15, fontWeight: 600 }}>Gemini가 자막과 이미지 프롬프트를 생성하는 중...</p>
          <p style={{ color: 'rgba(255,255,255,.40)', fontSize: 13, marginTop: 6 }}>보통 10~30초 소요됩니다</p>
          <style>{`@keyframes studioSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── 스크립트 결과 ── */}
      {scriptScenes.length > 0 && !scriptLoading && (
        <div style={{ marginBottom: 32 }}>
          {/* 액션 바 */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 14, fontWeight: 600 }}>
              총 <span style={{ color: '#a78bfa', fontWeight: 800 }}>{scriptScenes.length}</span>개 씬 생성됨
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <CopyAllBtn
                label="📋 전체 자막 복사"
                active={copiedKey === 'all-narration'}
                color="#06B6D4"
                onClick={() => handleCopyAll('narration')}
                activeLabel="✅ 복사됨!"
              />
              <CopyAllBtn
                label="🎨 전체 프롬프트 복사"
                active={copiedKey === 'all-visualPrompt'}
                color="#EC4899"
                onClick={() => handleCopyAll('visualPrompt')}
                activeLabel="✅ 복사됨!"
              />
              <button
                onClick={handleFullGeneration}
                disabled={isGenerating}
                style={{
                  padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: isGenerating ? 'rgba(255,255,255,.12)' : 'linear-gradient(135deg,#8B5CF6,#EC4899)',
                  color: '#fff', border: 'none', cursor: isGenerating ? 'default' : 'pointer',
                  boxShadow: isGenerating ? 'none' : '0 4px 16px rgba(139,92,246,.40)',
                  transition: 'opacity 0.2s',
                }}
              >
                🚀 이미지+음성 생성 시작 →
              </button>
            </div>
          </div>

          {/* 씬 카드 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scriptScenes.map((scene, idx) => (
              <SceneCard
                key={idx} scene={scene} idx={idx}
                editingCell={editingCell} editValue={editValue}
                copiedKey={copiedKey}
                onStartEdit={startEdit} onEditChange={setEditValue}
                onCommitEdit={commitEdit} onCancelEdit={() => setEditingCell(null)}
                onCopy={handleCopy}
              />
            ))}
          </div>

          {/* 하단 버튼 */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <button
              onClick={handleFullGeneration} disabled={isGenerating}
              style={{
                padding: '14px 44px', borderRadius: 14, fontSize: 16, fontWeight: 800,
                background: isGenerating
                  ? 'rgba(255,255,255,.12)'
                  : 'linear-gradient(135deg,#8B5CF6 0%,#3B82F6 50%,#EC4899 100%)',
                color: '#fff', border: 'none', cursor: isGenerating ? 'default' : 'pointer',
                boxShadow: isGenerating ? 'none' : '0 6px 28px rgba(139,92,246,.50)',
                letterSpacing: '0.03em', transition: 'opacity 0.2s',
              }}
            >
              {isGenerating ? '⏳ 생성 중...' : '🚀 스토리보드 이미지 + 음성 생성 시작'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 서브 컴포넌트 ───────────────────────────────────────────────────── */

function ActionBtn({ label, onClick, disabled, gradient, glow }: {
  label: string; onClick: () => void; disabled: boolean;
  gradient: string; glow: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '12px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700,
        background: disabled ? 'rgba(255,255,255,.10)' : gradient,
        color: '#fff', border: 'none', cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : `0 4px 16px ${glow}`,
        transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}>
      {label}
    </button>
  );
}

function ModelBtn({ id, name, desc, tier, selected, onClick }: {
  id: ImageModelId; name: string; desc: string; tier: 'free'|'paid';
  selected: boolean; onClick: (id: ImageModelId) => void;
}) {
  return (
    <button onClick={() => onClick(id)}
      style={{
        padding: '9px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
        background: selected ? 'rgba(139,92,246,.22)' : 'rgba(255,255,255,.05)',
        border: selected ? '1px solid rgba(139,92,246,.55)' : '1px solid rgba(255,255,255,.10)',
        transition: 'all 0.2s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{name}</span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700,
          background: tier === 'free' ? 'rgba(34,197,94,.20)' : 'rgba(251,191,36,.20)',
          color: tier === 'free' ? '#4ade80' : '#fbbf24',
        }}>
          {tier === 'free' ? '무료' : '유료'}
        </span>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', margin: '3px 0 0' }}>{desc}</p>
    </button>
  );
}

function RefImageSection({ label, images, onUpload, onRemove, fileRef }: {
  label: string; images: string[]; onRemove: (i: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 7 }}>{label}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {images.map((img, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={img} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,.20)' }} />
            <button onClick={() => onRemove(i)}
              style={{
                position: 'absolute', top: -5, right: -5, width: 16, height: 16,
                borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer',
                color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: '16px',
              }}>✕</button>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()}
          style={{
            width: 48, height: 48, borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,.06)', border: '1px dashed rgba(255,255,255,.25)',
            color: 'rgba(255,255,255,.50)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onUpload} />
      </div>
    </div>
  );
}

function CopyAllBtn({ label, active, color, onClick, activeLabel }: {
  label: string; active: boolean; color: string; onClick: () => void; activeLabel: string;
}) {
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s',
        background: active ? `${color}22` : 'rgba(255,255,255,.08)',
        color: active ? color : 'rgba(255,255,255,.75)',
        border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,.15)'}`,
      }}>
      {active ? activeLabel : label}
    </button>
  );
}

/* ── 씬 카드 ── */
interface SceneCardProps {
  scene: ScriptScene; idx: number;
  editingCell: { idx: number; field: 'narration' | 'visualPrompt' } | null;
  editValue: string; copiedKey: string | null;
  onStartEdit: (idx: number, field: 'narration' | 'visualPrompt') => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void; onCancelEdit: () => void;
  onCopy: (text: string, key: string) => void;
}

function SceneCard({
  scene, idx, editingCell, editValue, copiedKey,
  onStartEdit, onEditChange, onCommitEdit, onCancelEdit, onCopy,
}: SceneCardProps) {
  const isEditNar    = editingCell?.idx === idx && editingCell.field === 'narration';
  const isEditPrompt = editingCell?.idx === idx && editingCell.field === 'visualPrompt';

  return (
    <div style={{
      ...glass, borderRadius: 18, overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}>
      {/* 씬 헤더 */}
      <div style={{
        padding: '9px 18px', background: 'rgba(255,255,255,.05)',
        borderBottom: '1px solid rgba(255,255,255,.10)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          background: 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
          color: '#fff', fontWeight: 800, fontSize: 11,
          padding: '3px 11px', borderRadius: 20, letterSpacing: '0.04em',
        }}>
          씬 {scene.sceneNumber}
        </span>
      </div>

      {/* 2열 본문 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {/* 자막 */}
        <FieldCell
          label="📝 YouTube 자막" labelColor="#06B6D4"
          text={scene.narration} isEditing={isEditNar}
          editValue={editValue} copiedKey={copiedKey}
          copyKey={`nar-${idx}`} border="1px solid rgba(255,255,255,.08)"
          borderRight
          onStartEdit={() => onStartEdit(idx, 'narration')}
          onEditChange={onEditChange} onCommit={onCommitEdit} onCancel={onCancelEdit}
          onCopy={() => onCopy(scene.narration, `nar-${idx}`)}
          mono={false}
        />
        {/* 이미지 프롬프트 */}
        <FieldCell
          label="🎨 이미지 프롬프트 (EN)" labelColor="#EC4899"
          text={scene.visualPrompt} isEditing={isEditPrompt}
          editValue={editValue} copiedKey={copiedKey}
          copyKey={`prompt-${idx}`} border="none"
          borderRight={false}
          onStartEdit={() => onStartEdit(idx, 'visualPrompt')}
          onEditChange={onEditChange} onCommit={onCommitEdit} onCancel={onCancelEdit}
          onCopy={() => onCopy(scene.visualPrompt, `prompt-${idx}`)}
          mono
        />
      </div>
    </div>
  );
}

function FieldCell({ label, labelColor, text, isEditing, editValue, copiedKey, copyKey,
  border, borderRight, onStartEdit, onEditChange, onCommit, onCancel, onCopy, mono }: {
  label: string; labelColor: string; text: string; isEditing: boolean;
  editValue: string; copiedKey: string | null; copyKey: string;
  border: string; borderRight: boolean;
  onStartEdit: () => void; onEditChange: (v: string) => void;
  onCommit: () => void; onCancel: () => void; onCopy: () => void; mono: boolean;
}) {
  const copied = copiedKey === copyKey;
  return (
    <div style={{
      padding: '14px 18px',
      borderRight: borderRight ? '1px solid rgba(255,255,255,.08)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <div style={{ display: 'flex', gap: 5 }}>
          <IconBtn onClick={onStartEdit} title="편집">✏️</IconBtn>
          <IconBtn onClick={onCopy} title="복사" color={copied ? labelColor : undefined}>
            {copied ? '✅' : '📋'}
          </IconBtn>
        </div>
      </div>

      {isEditing ? (
        <div>
          <textarea value={editValue} onChange={e => onEditChange(e.target.value)} rows={4} autoFocus
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,.10)', border: '1px solid rgba(139,92,246,.55)',
              color: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={onCommit}
              style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: 'rgba(139,92,246,.55)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              저장
            </button>
            <button onClick={onCancel}
              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, background: 'rgba(255,255,255,.10)', color: 'rgba(255,255,255,.70)', border: 'none', cursor: 'pointer' }}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <p style={{
          color: mono ? 'rgba(255,255,255,.72)' : '#fff',
          fontSize: mono ? 12 : 14, lineHeight: 1.7, margin: 0,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: mono ? 'monospace' : 'inherit',
        }}>
          {text}
        </p>
      )}
    </div>
  );
}

function IconBtn({ onClick, title, color, children }: {
  onClick: () => void; title: string; color?: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: color || 'rgba(255,255,255,.50)', padding: '2px 4px', lineHeight: 1 }}>
      {children}
    </button>
  );
}
