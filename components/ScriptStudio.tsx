'use client';

import React, { useState, useCallback, useRef } from 'react';
import { ScriptScene, GenerationStep } from '../types';

interface ScriptStudioProps {
  onStartFullGeneration: (topic: string, scenes: ScriptScene[]) => void;
}

const GL = {
  glass:       'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(255,255,255,0.22)',
  shadow:      '0px 4px 24px rgba(0,0,0,0.25)',
  innerGlow:   'inset 0px 0px 12px rgba(255,255,255,0.10)',
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

const ScriptStudio: React.FC<ScriptStudioProps> = ({ onStartFullGeneration }) => {
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');
  const [inputMode, setInputMode] = useState<'keyword' | 'manual'>('keyword');
  const [scenes, setScenes] = useState<ScriptScene[]>([]);
  const [step, setStep] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ idx: number; field: 'narration' | 'visualPrompt' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const abortRef = useRef(false);

  const handleCopy = (text: string, key: string) => {
    copyToClipboard(text);
    setCopiedCell(key);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleCopyAll = (field: 'narration' | 'visualPrompt') => {
    const all = scenes.map((s, i) =>
      field === 'narration'
        ? `[씬 ${s.sceneNumber}] ${s.narration}`
        : `[씬 ${s.sceneNumber}] ${s.visualPrompt}`
    ).join('\n\n');
    copyToClipboard(all);
    setCopiedCell(`all-${field}`);
    setTimeout(() => setCopiedCell(null), 1800);
  };

  const startEdit = (idx: number, field: 'narration' | 'visualPrompt') => {
    setEditingCell({ idx, field });
    setEditValue(scenes[idx][field]);
  };

  const commitEdit = () => {
    if (!editingCell) return;
    setScenes(prev =>
      prev.map((s, i) =>
        i === editingCell.idx ? { ...s, [editingCell.field]: editValue } : s
      )
    );
    setEditingCell(null);
  };

  const handleGenerate = useCallback(async () => {
    const sourceText = inputMode === 'manual' ? manualScript.trim() : null;
    const targetTopic = inputMode === 'keyword' ? topic.trim() : 'Manual Script Input';

    if (!targetTopic && !sourceText) return;

    abortRef.current = false;
    setStep('loading');
    setErrorMsg('');
    setScenes([]);

    try {
      const body: any = { topic: targetTopic, hasReferenceImage: false };
      if (sourceText) body.sourceContext = sourceText;

      // 긴 대본 분기
      const isLong = (sourceText?.length ?? 0) > 3000;
      const url = isLong ? '/api/gemini/script-chunked' : '/api/gemini/script';
      if (isLong) {
        body.chunkSize = 2500;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }

      const data: ScriptScene[] = await res.json();
      setScenes(data);
      setStep('done');
    } catch (e: any) {
      setErrorMsg(e.message || '알 수 없는 오류');
      setStep('error');
    }
  }, [topic, manualScript, inputMode]);

  const isLoading = step === 'loading';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' }}>
          📋 자막 & 이미지 프롬프트 생성
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          주제를 입력하면 YouTube 자막과 씬별 이미지 프롬프트를 생성합니다
        </p>
      </div>

      {/* 입력 패널 */}
      <div style={{
        background: GL.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${GL.glassBorder}`, borderRadius: 20,
        boxShadow: `${GL.innerGlow}, ${GL.shadow}`,
        padding: '24px', marginBottom: 28,
      }}>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['keyword', 'manual'] as const).map(mode => (
            <button key={mode}
              onClick={() => setInputMode(mode)}
              style={{
                padding: '7px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                background: inputMode === mode
                  ? 'linear-gradient(135deg, rgba(139,92,246,0.75), rgba(59,130,246,0.65))'
                  : 'rgba(255,255,255,0.10)',
                color: '#fff',
                boxShadow: inputMode === mode ? '0 2px 12px rgba(139,92,246,0.35)' : 'none',
                border: inputMode === mode ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {mode === 'keyword' ? '🔍 키워드 입력' : '📝 대본 직접 입력'}
            </button>
          ))}
        </div>

        {inputMode === 'keyword' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLoading && handleGenerate()}
              placeholder="예: 미국과 이란의 전쟁, 비트코인 전망, 인공지능 혁명..."
              disabled={isLoading}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, fontSize: 14,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)',
                color: '#fff', outline: 'none',
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={isLoading || !topic.trim()}
              style={{
                padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: isLoading || !topic.trim()
                  ? 'rgba(255,255,255,0.12)'
                  : 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                color: '#fff', border: 'none', cursor: isLoading ? 'default' : 'pointer',
                boxShadow: isLoading ? 'none' : '0 4px 16px rgba(139,92,246,0.45)',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >
              {isLoading ? '⏳ 생성 중...' : '✨ 생성하기'}
            </button>
          </div>
        ) : (
          <div>
            <textarea
              value={manualScript}
              onChange={e => setManualScript(e.target.value)}
              placeholder="대본을 직접 입력하세요. 자막과 이미지 프롬프트가 자동 생성됩니다..."
              rows={6}
              disabled={isLoading}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 14,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)',
                color: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={handleGenerate}
                disabled={isLoading || !manualScript.trim()}
                style={{
                  padding: '11px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: isLoading || !manualScript.trim()
                    ? 'rgba(255,255,255,0.12)'
                    : 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
                  color: '#fff', border: 'none', cursor: isLoading ? 'default' : 'pointer',
                  boxShadow: isLoading ? 'none' : '0 4px 16px rgba(139,92,246,0.45)',
                  transition: 'all 0.2s',
                }}
              >
                {isLoading ? '⏳ 생성 중...' : '✨ 생성하기'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: GL.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${GL.glassBorder}`, borderRadius: 20,
          boxShadow: `${GL.innerGlow}, ${GL.shadow}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⚙️</div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: 600 }}>
            AI가 자막과 이미지 프롬프트를 생성하고 있습니다...
          </p>
          <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13, marginTop: 6 }}>
            보통 10~30초 정도 소요됩니다
          </p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 에러 */}
      {step === 'error' && (
        <div style={{
          padding: '16px 20px', borderRadius: 16,
          background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.35)',
          color: '#fda4af', fontSize: 14, marginBottom: 20,
        }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* 결과 */}
      {step === 'done' && scenes.length > 0 && (
        <div>
          {/* 상단 액션 바 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 14, fontWeight: 600 }}>
              총 <span style={{ color: '#a78bfa', fontWeight: 800 }}>{scenes.length}개</span> 씬 생성됨
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleCopyAll('narration')}
                style={actionBtnStyle(copiedCell === 'all-narration', '#06B6D4')}
              >
                {copiedCell === 'all-narration' ? '✅ 복사됨!' : '📋 전체 자막 복사'}
              </button>
              <button
                onClick={() => handleCopyAll('visualPrompt')}
                style={actionBtnStyle(copiedCell === 'all-visualPrompt', '#EC4899')}
              >
                {copiedCell === 'all-visualPrompt' ? '✅ 복사됨!' : '🎨 전체 프롬프트 복사'}
              </button>
              <button
                onClick={() => onStartFullGeneration(
                  inputMode === 'keyword' ? topic : 'Manual Script Input',
                  scenes
                )}
                style={{
                  padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(139,92,246,0.40)',
                  transition: 'opacity 0.2s',
                }}
              >
                🚀 이미지+음성 생성 시작 →
              </button>
            </div>
          </div>

          {/* 씬 카드 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {scenes.map((scene, idx) => (
              <SceneCard
                key={idx}
                scene={scene}
                idx={idx}
                editingCell={editingCell}
                editValue={editValue}
                copiedCell={copiedCell}
                onStartEdit={startEdit}
                onEditChange={setEditValue}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingCell(null)}
                onCopy={handleCopy}
              />
            ))}
          </div>

          {/* 하단 액션 */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <button
              onClick={() => onStartFullGeneration(
                inputMode === 'keyword' ? topic : 'Manual Script Input',
                scenes
              )}
              style={{
                padding: '14px 40px', borderRadius: 14, fontSize: 16, fontWeight: 800,
                background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 50%, #EC4899 100%)',
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 6px 24px rgba(139,92,246,0.50)',
                letterSpacing: '0.03em', transition: 'opacity 0.2s',
              }}
            >
              🚀 스토리보드 이미지 + 음성 생성 시작
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function actionBtnStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: active ? `${color}33` : 'rgba(255,255,255,0.10)',
    color: active ? color : 'rgba(255,255,255,0.80)',
    border: `1px solid ${active ? color + '66' : 'rgba(255,255,255,0.18)'}`,
    cursor: 'pointer', transition: 'all 0.2s',
  };
}

interface SceneCardProps {
  scene: ScriptScene;
  idx: number;
  editingCell: { idx: number; field: 'narration' | 'visualPrompt' } | null;
  editValue: string;
  copiedCell: string | null;
  onStartEdit: (idx: number, field: 'narration' | 'visualPrompt') => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onCopy: (text: string, key: string) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene, idx, editingCell, editValue, copiedCell,
  onStartEdit, onEditChange, onCommitEdit, onCancelEdit, onCopy,
}) => {
  const isEditingNarration = editingCell?.idx === idx && editingCell.field === 'narration';
  const isEditingPrompt = editingCell?.idx === idx && editingCell.field === 'visualPrompt';
  const narCopied = copiedCell === `nar-${idx}`;
  const promptCopied = copiedCell === `prompt-${idx}`;

  return (
    <div style={{
      background: GL.glass, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${GL.glassBorder}`, borderRadius: 18,
      boxShadow: `${GL.innerGlow}, ${GL.shadow}`,
      overflow: 'hidden',
    }}>
      {/* 씬 헤더 */}
      <div style={{
        padding: '10px 20px',
        background: 'rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
          color: '#fff', fontWeight: 800, fontSize: 12,
          padding: '3px 10px', borderRadius: 20,
          letterSpacing: '0.04em',
        }}>
          씬 {scene.sceneNumber}
        </span>
      </div>

      {/* 컨텐츠 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* 자막 (나레이션) */}
        <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(255,255,255,0.10)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#06B6D4',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              📝 YouTube 자막
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onStartEdit(idx, 'narration')}
                style={iconBtnStyle('#a78bfa')}
                title="편집"
              >✏️</button>
              <button
                onClick={() => onCopy(scene.narration, `nar-${idx}`)}
                style={iconBtnStyle(narCopied ? '#06B6D4' : 'rgba(255,255,255,0.50)')}
                title="복사"
              >{narCopied ? '✅' : '📋'}</button>
            </div>
          </div>

          {isEditingNarration ? (
            <EditArea
              value={editValue}
              onChange={onEditChange}
              onCommit={onCommitEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <p style={{
              color: '#fff', fontSize: 14, lineHeight: 1.7,
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
            }}>
              {scene.narration}
            </p>
          )}
        </div>

        {/* 이미지 프롬프트 */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#EC4899',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              🎨 이미지 프롬프트
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onStartEdit(idx, 'visualPrompt')}
                style={iconBtnStyle('#f9a8d4')}
                title="편집"
              >✏️</button>
              <button
                onClick={() => onCopy(scene.visualPrompt, `prompt-${idx}`)}
                style={iconBtnStyle(promptCopied ? '#EC4899' : 'rgba(255,255,255,0.50)')}
                title="복사"
              >{promptCopied ? '✅' : '📋'}</button>
            </div>
          </div>

          {isEditingPrompt ? (
            <EditArea
              value={editValue}
              onChange={onEditChange}
              onCommit={onCommitEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <p style={{
              color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.65,
              margin: 0, fontFamily: 'monospace', wordBreak: 'break-word',
            }}>
              {scene.visualPrompt}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const EditArea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onCommit, onCancel }) => (
  <div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={4}
      autoFocus
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
        background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(139,92,246,0.55)',
        color: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
      }}
    />
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <button
        onClick={onCommit}
        style={{
          padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
          background: 'rgba(139,92,246,0.55)', color: '#fff', border: 'none', cursor: 'pointer',
        }}
      >저장</button>
      <button
        onClick={onCancel}
        style={{
          padding: '5px 12px', borderRadius: 7, fontSize: 12,
          background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)', border: 'none', cursor: 'pointer',
        }}
      >취소</button>
    </div>
  </div>
);

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, color, padding: '2px 4px',
    transition: 'opacity 0.15s', lineHeight: 1,
  };
}

export default ScriptStudio;
