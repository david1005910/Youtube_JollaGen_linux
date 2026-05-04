'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ScriptScene } from '../types';
import type { RemotionVideoProps, RemotionScene, SubtitleStyle } from '../remotion/types';
import { DEFAULT_SUBTITLE_STYLE } from '../remotion/types';
import { StoryboardVideo } from '../remotion/compositions/StoryboardVideo';
import { IMAGE_MODELS } from '../config';

const Player = dynamic(
  () => import('@remotion/player').then(m => m.Player),
  { ssr: false, loading: () => <div style={loadingStyle}>플레이어 로딩 중...</div> }
);

// ─── 자막 청크 ──────────────────────────────────────────────────────────────
interface SubtitleChunk {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
}

// ─── 편집 씬 ────────────────────────────────────────────────────────────────
interface EditorScene {
  id: string;
  narration: string;       // 사이드바 표시용 전체 텍스트
  visualPrompt: string;
  imageSrc: string;
  videoSrc: string;
  durationSec: number;
  subtitleChunks: SubtitleChunk[];
}

let _uid = 0;
const uid = () => `u_${++_uid}_${Date.now()}`;
const FPS = 30;

// ─── 자막 자동 분할 ─────────────────────────────────────────────────────────
function autoSplit(narration: string, durationSec: number): SubtitleChunk[] {
  if (!narration.trim()) return [];
  const parts = narration
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  const list = parts.length > 0 ? parts : [narration.trim()];
  const secPer = durationSec / list.length;
  return list.map((text, i) => ({
    id: uid(),
    text,
    startSec: parseFloat((i * secPer).toFixed(2)),
    endSec: parseFloat(Math.min((i + 1) * secPer, durationSec).toFixed(2)),
  }));
}

// ─── Remotion 씬 변환 ───────────────────────────────────────────────────────
function toRemotionScene(s: EditorScene): RemotionScene {
  const frames = Math.round(s.durationSec * FPS);
  const subtitles = s.subtitleChunks.length > 0
    ? s.subtitleChunks.map(c => ({
        text: c.text,
        startFrame: Math.round(Math.min(c.startSec, s.durationSec) * FPS),
        endFrame: Math.round(Math.min(c.endSec, s.durationSec) * FPS) - 1,
      })).filter(c => c.endFrame > c.startFrame)
    : s.narration
      ? [{ text: s.narration, startFrame: 0, endFrame: frames - 1 }]
      : [];
  return { imageSrc: s.imageSrc, audioSrc: '', videoSrc: s.videoSrc || undefined, durationInFrames: frames, subtitles };
}

// ─── 자막 타임라인 바 ────────────────────────────────────────────────────────
const CHUNK_COLORS = ['#c96442', '#4285f4', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4'];

function SubtitleTimeline({
  chunks, durationSec, selectedChunkId, onSelect,
}: {
  chunks: SubtitleChunk[];
  durationSec: number;
  selectedChunkId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 32, background: '#0a0908', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
      {durationSec > 0 && chunks.map((c, i) => {
        const left = (c.startSec / durationSec) * 100;
        const width = Math.max(((c.endSec - c.startSec) / durationSec) * 100, 0.5);
        const color = CHUNK_COLORS[i % CHUNK_COLORS.length];
        return (
          <div key={c.id} onClick={() => onSelect(c.id)} title={c.text} style={{
            position: 'absolute', top: 2, bottom: 2,
            left: `${left}%`, width: `${width}%`,
            background: selectedChunkId === c.id ? color + 'cc' : color + '55',
            border: `1px solid ${color}99`,
            borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#fff', fontWeight: 700, transition: 'background 0.1s',
          }}>
            {i + 1}
          </div>
        );
      })}
      {/* 눈금 */}
      {[0.25, 0.5, 0.75].map(p => (
        <div key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p * 100}%`, width: 1, background: 'rgba(255,255,255,0.08)' }} />
      ))}
    </div>
  );
}

// ─── 자막 청크 편집기 ────────────────────────────────────────────────────────
function SubtitleEditor({
  scene, onUpdate,
}: {
  scene: EditorScene;
  onUpdate: (patch: Partial<EditorScene>) => void;
}) {
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(scene.subtitleChunks[0]?.id ?? null);

  const addChunk = () => {
    const lastEnd = scene.subtitleChunks.at(-1)?.endSec ?? 0;
    const newEnd = Math.min(lastEnd + 2, scene.durationSec);
    if (lastEnd >= scene.durationSec) return;
    const chunk: SubtitleChunk = { id: uid(), text: '', startSec: parseFloat(lastEnd.toFixed(2)), endSec: parseFloat(newEnd.toFixed(2)) };
    const next = [...scene.subtitleChunks, chunk];
    onUpdate({ subtitleChunks: next });
    setSelectedChunkId(chunk.id);
  };

  const updateChunk = (id: string, patch: Partial<SubtitleChunk>) => {
    const next = scene.subtitleChunks.map(c => c.id === id ? { ...c, ...patch } : c);
    onUpdate({ subtitleChunks: next });
  };

  const deleteChunk = (id: string) => {
    const next = scene.subtitleChunks.filter(c => c.id !== id);
    if (selectedChunkId === id) setSelectedChunkId(next[0]?.id ?? null);
    onUpdate({ subtitleChunks: next });
  };

  const doAutoSplit = () => {
    const chunks = autoSplit(scene.narration, scene.durationSec);
    onUpdate({ subtitleChunks: chunks });
    setSelectedChunkId(chunks[0]?.id ?? null);
  };

  // 기존 청크 텍스트를 유지하면서 영상 길이에 균등 배분
  const redistributeEvenly = () => {
    const n = scene.subtitleChunks.length;
    if (n === 0) return;
    const secPer = scene.durationSec / n;
    const next = scene.subtitleChunks.map((c, i) => ({
      ...c,
      startSec: parseFloat((i * secPer).toFixed(2)),
      endSec: parseFloat(Math.min((i + 1) * secPer, scene.durationSec).toFixed(2)),
    }));
    onUpdate({ subtitleChunks: next });
  };

  const clearAll = () => {
    onUpdate({ subtitleChunks: [] });
    setSelectedChunkId(null);
  };

  return (
    <div>
      {/* 타임라인 */}
      <SubtitleTimeline
        chunks={scene.subtitleChunks}
        durationSec={scene.durationSec}
        selectedChunkId={selectedChunkId}
        onSelect={setSelectedChunkId}
      />

      {/* 시간 눈금 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
        <span>0s</span>
        <span>{(scene.durationSec * 0.25).toFixed(1)}s</span>
        <span>{(scene.durationSec * 0.5).toFixed(1)}s</span>
        <span>{(scene.durationSec * 0.75).toFixed(1)}s</span>
        <span>{scene.durationSec}s</span>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
        <button onClick={doAutoSplit} style={{ ...chunkBtn, flex: 1, background: 'rgba(201,100,66,0.15)', borderColor: 'rgba(201,100,66,0.25)', color: '#e09070' }}>
          ⚡ 자동 분할
        </button>
        <button onClick={addChunk} style={{ ...chunkBtn, flex: 1 }}>+ 추가</button>
        <button onClick={clearAll} style={{ ...chunkBtn, color: 'rgba(255,255,255,0.28)' }}>초기화</button>
      </div>
      {/* 자동 매칭 버튼 */}
      {scene.subtitleChunks.length > 0 && (
        <button onClick={redistributeEvenly} title="자막 청크를 영상 길이에 균등하게 재배분" style={{ ...chunkBtn, width: '100%', marginBottom: 10, background: 'rgba(66,133,244,0.12)', borderColor: 'rgba(66,133,244,0.25)', color: '#7eb8f7' }}>
          ⏱ 자막 자동 매칭 ({scene.durationSec}s에 균등 배분)
        </button>
      )}
      {scene.subtitleChunks.length === 0 && <div style={{ marginBottom: 10 }} />}

      {/* 청크 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {scene.subtitleChunks.length === 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', textAlign: 'center', padding: '12px 0' }}>
            자막 청크가 없습니다.<br />⚡ 자동 분할 또는 + 추가를 눌러 생성하세요.
          </div>
        )}
        {scene.subtitleChunks.map((chunk, i) => {
          const color = CHUNK_COLORS[i % CHUNK_COLORS.length];
          const isSelected = selectedChunkId === chunk.id;
          return (
            <div key={chunk.id} onClick={() => setSelectedChunkId(chunk.id)} style={{
              borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${isSelected ? color + 'aa' : 'rgba(255,255,255,0.08)'}`,
              background: isSelected ? color + '12' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
            }}>
              {/* 청크 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: color + '55', border: `1px solid ${color}99`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>{i + 1}</div>
                {/* 시작/종료 시간 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
                  <input
                    type="number" min={0} max={scene.durationSec} step={0.1}
                    value={chunk.startSec}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateChunk(chunk.id, { startSec: parseFloat(Number(e.target.value).toFixed(2)) })}
                    style={{ ...timeInput, borderColor: isSelected ? color + '66' : 'rgba(255,255,255,0.10)' }}
                  />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>→</span>
                  <input
                    type="number" min={0} max={scene.durationSec} step={0.1}
                    value={chunk.endSec}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateChunk(chunk.id, { endSec: parseFloat(Number(e.target.value).toFixed(2)) })}
                    style={{ ...timeInput, borderColor: isSelected ? color + '66' : 'rgba(255,255,255,0.10)' }}
                  />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>s</span>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteChunk(chunk.id); }} style={{
                  width: 16, height: 16, borderRadius: 3, background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5',
                  fontSize: 10, cursor: 'pointer', padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
              </div>

              {/* 자막 텍스트 */}
              <textarea
                value={chunk.text}
                onClick={e => e.stopPropagation()}
                onChange={e => updateChunk(chunk.id, { text: e.target.value })}
                placeholder="자막 텍스트..."
                rows={2}
                style={{
                  width: '100%', padding: '6px 8px', border: 'none', outline: 'none',
                  background: 'transparent', color: '#e0d5ca', fontSize: 12,
                  resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                }}
              />

              {/* 길이 표시 */}
              <div style={{ padding: '2px 8px 5px', fontSize: 10, color: 'rgba(255,255,255,0.22)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{chunk.text.length}자</span>
                <span>{(chunk.endSec - chunk.startSec).toFixed(1)}초</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
  initialScenes: ScriptScene[];
  initialImages: { src: string; name: string }[];
  initialVideo: { src: string; name: string } | null;
  onClose: () => void;
}

// ─── VideoEditor ─────────────────────────────────────────────────────────────
export default function VideoEditor({ initialScenes, initialImages, initialVideo, onClose }: Props) {

  const [scenes, setScenes] = useState<EditorScene[]>(() => {
    const makeScene = (s: ScriptScene | null, i: number): EditorScene => {
      const narration = s?.narration ?? '';
      const durationSec = 5;
      return {
        id: uid(),
        narration,
        visualPrompt: s?.visualPrompt ?? '',
        imageSrc: initialImages[i]?.src ?? '',
        videoSrc: initialVideo && i === 0 ? initialVideo.src : '',
        durationSec,
        subtitleChunks: autoSplit(narration, durationSec),
      };
    };
    if (initialScenes.length > 0) return initialScenes.map((s, i) => makeScene(s, i));
    return [makeScene(null, 0)];
  });

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [selectedId, setSelectedId] = useState<string>(scenes[0]?.id ?? '');
  const [rightTab, setRightTab] = useState<'props' | 'subtitle'>('subtitle');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const [imageGenModel, setImageGenModel] = useState<string>('gemini-2.0-flash-image');
  const [imageGenLoading, setImageGenLoading] = useState<Record<string, boolean>>({});
  const [imageGenError, setImageGenError] = useState<Record<string, string>>({});

  const videoProps = useMemo<RemotionVideoProps>(() => ({
    scenes: scenes.map(toRemotionScene),
    fps: FPS, width: 1280, height: 720, subtitleStyle,
  }), [scenes, subtitleStyle]);

  const totalFrames = useMemo(() => videoProps.scenes.reduce((s, sc) => s + sc.durationInFrames, 0) || 30, [videoProps.scenes]);
  const totalSec = useMemo(() => scenes.reduce((s, sc) => s + sc.durationSec, 0), [scenes]);

  // ── 씬 업데이트 ─────────────────────────────────────────────────────────
  const updateScene = useCallback((id: string, patch: Partial<EditorScene>) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      // 재생 시간 변경 시 자막 청크를 비례 조정 (자동 매칭)
      if (patch.durationSec !== undefined && s.durationSec > 0 && s.subtitleChunks.length > 0) {
        const ratio = patch.durationSec / s.durationSec;
        next.subtitleChunks = next.subtitleChunks.map(c => ({
          ...c,
          startSec: parseFloat((c.startSec * ratio).toFixed(2)),
          endSec: parseFloat(Math.min(c.endSec * ratio, patch.durationSec!).toFixed(2)),
        }));
      }
      return next;
    }));
  }, []);

  const addScene = useCallback((afterId?: string) => {
    const newScene: EditorScene = { id: uid(), narration: '', visualPrompt: '', imageSrc: '', videoSrc: '', durationSec: 5, subtitleChunks: [] };
    setScenes(prev => {
      if (!afterId) return [...prev, newScene];
      const idx = prev.findIndex(s => s.id === afterId);
      const next = [...prev]; next.splice(idx + 1, 0, newScene);
      return next;
    });
    setSelectedId(newScene.id);
  }, []);

  const deleteScene = useCallback((id: string) => {
    setScenes(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(s => s.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? '');
      return next;
    });
  }, [selectedId]);

  const moveScene = useCallback((id: string, dir: -1 | 1) => {
    setScenes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev]; [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }, []);

  const duplicateScene = useCallback((id: string) => {
    setScenes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const clone = { ...prev[idx], id: uid(), subtitleChunks: prev[idx].subtitleChunks.map(c => ({ ...c, id: uid() })) };
      const next = [...prev]; next.splice(idx + 1, 0, clone);
      return next;
    });
  }, []);

  // ── 이미지 AI 생성 ──────────────────────────────────────────────────────
  const generateSceneImage = useCallback(async (sceneId: string, prompt: string) => {
    if (!prompt.trim()) { setImageGenError(p => ({ ...p, [sceneId]: '이미지 프롬프트를 입력하세요.' })); return; }
    setImageGenLoading(p => ({ ...p, [sceneId]: true }));
    setImageGenError(p => ({ ...p, [sceneId]: '' }));
    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, modelId: imageGenModel }),
      });
      const data = await res.json() as { imageUrl?: string; imageDataUrl?: string; error?: string };
      if (data.error) throw new Error(data.error);
      const src = data.imageDataUrl ?? data.imageUrl ?? '';
      updateScene(sceneId, { imageSrc: src, videoSrc: '' });
    } catch (err: any) {
      setImageGenError(p => ({ ...p, [sceneId]: err.message ?? '이미지 생성 실패' }));
    } finally {
      setImageGenLoading(p => ({ ...p, [sceneId]: false }));
    }
  }, [imageGenModel, updateScene]);

  // ── 미디어 업로드 ────────────────────────────────────────────────────────
  const handleImageFile = useCallback((id: string, file: File) => {
    const r = new FileReader();
    r.onload = e => updateScene(id, { imageSrc: e.target!.result as string, videoSrc: '' });
    r.readAsDataURL(file);
  }, [updateScene]);

  const handleVideoFile = useCallback((id: string, file: File) => {
    const r = new FileReader();
    r.onload = e => {
      const src = e.target!.result as string;
      // 영상 길이 자동 감지 → durationSec 자동 매칭
      const vid = document.createElement('video');
      vid.src = src;
      vid.onloadedmetadata = () => {
        const dur = parseFloat(Math.max(Math.min(vid.duration, 60), 1).toFixed(1));
        updateScene(id, { videoSrc: src, imageSrc: '', durationSec: dur });
      };
      vid.onerror = () => updateScene(id, { videoSrc: src, imageSrc: '' });
    };
    r.readAsDataURL(file);
  }, [updateScene]);

  // ── 드래그앤드롭 ─────────────────────────────────────────────────────────
  const onDragStart = (id: string) => { dragRef.current = id; };
  const onDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOver(id); };
  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault(); setDragOver(null);
    const srcId = dragRef.current;
    if (!srcId || srcId === targetId) return;
    setScenes(prev => {
      const si = prev.findIndex(s => s.id === srcId), ti = prev.findIndex(s => s.id === targetId);
      const next = [...prev]; const [item] = next.splice(si, 1); next.splice(ti, 0, item);
      return next;
    });
  };

  // ── 내보내기 ─────────────────────────────────────────────────────────────
  const exportSRT = () => {
    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600).toString().padStart(2, '0');
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
      const s = (sec % 60).toFixed(3).replace('.', ',').padStart(6, '0');
      return `${h}:${m}:${s}`;
    };
    let idx = 1; let sceneOffset = 0;
    const entries: string[] = [];
    for (const scene of scenes) {
      if (scene.subtitleChunks.length > 0) {
        for (const c of scene.subtitleChunks) {
          if (!c.text.trim()) continue;
          entries.push(`${idx++}\n${fmt(sceneOffset + c.startSec)} --> ${fmt(sceneOffset + c.endSec)}\n${c.text}`);
        }
      } else if (scene.narration) {
        entries.push(`${idx++}\n${fmt(sceneOffset)} --> ${fmt(sceneOffset + scene.durationSec)}\n${scene.narration}`);
      }
      sceneOffset += scene.durationSec;
    }
    dl(entries.join('\n\n'), 'script.srt', 'text/plain;charset=utf-8');
  };

  const exportJSON = () => {
    const data = {
      scenes: scenes.map(s => ({
        narration: s.narration, visualPrompt: s.visualPrompt, durationSec: s.durationSec,
        subtitleChunks: s.subtitleChunks.map(({ id: _, ...c }) => c),
      })), subtitleStyle,
    };
    dl(JSON.stringify(data, null, 2), 'project.json', 'application/json');
  };

  const exportScript = () => {
    const text = scenes.map((s, i) => `[씬 ${i + 1}]\n${s.narration || s.subtitleChunks.map(c => c.text).join(' ')}`).join('\n\n');
    dl(text, 'script.txt', 'text/plain;charset=utf-8');
  };

  function dl(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedScene = scenes.find(s => s.id === selectedId);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9200, background: '#141210', color: '#e0d5ca', fontFamily: "'Noto Sans KR', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── 툴바 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 50, flexShrink: 0, background: '#1a1815', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>🎬 TubeGen 편집기</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>씬 {scenes.length}개 · 총 {Math.floor(totalSec / 60)}:{(totalSec % 60).toString().padStart(2, '0')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={exportScript} style={tbBtn('#c8b8a2')}>📄 TXT</button>
          <button onClick={exportSRT} style={tbBtn('#86efac')}>📝 SRT</button>
          <button onClick={exportJSON} style={tbBtn('#93c5fd')}>💾 JSON</button>
          <button onClick={onClose} style={tbBtn('#fca5a5')}>✕ 닫기</button>
        </div>
      </div>

      {/* ── 메인 ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* 왼쪽: 씬 타임라인 */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.07)', background: '#181512' }}>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.40)' }}>씬 목록</span>
            <button onClick={() => addScene()} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11.5, background: 'rgba(201,100,66,0.20)', border: '1px solid rgba(201,100,66,0.30)', color: '#e09070', cursor: 'pointer', fontWeight: 600 }}>+ 씬 추가</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {scenes.map((scene, idx) => (
              <div key={scene.id} draggable
                onDragStart={() => onDragStart(scene.id)}
                onDragOver={e => onDragOver(e, scene.id)}
                onDrop={e => onDrop(e, scene.id)}
                onDragEnd={() => setDragOver(null)}
                onClick={() => setSelectedId(scene.id)}
                style={{ margin: '3px 8px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${selectedId === scene.id ? 'rgba(201,100,66,0.55)' : dragOver === scene.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`, background: selectedId === scene.id ? 'rgba(201,100,66,0.07)' : 'rgba(255,255,255,0.02)', transition: 'all 0.1s' }}>
                <div style={{ display: 'flex', gap: 8, padding: '7px 9px', alignItems: 'flex-start' }}>
                  {/* 썸네일 */}
                  <div style={{ width: 60, height: 40, borderRadius: 5, flexShrink: 0, background: '#0e0c0a', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {scene.imageSrc ? <img src={scene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : scene.videoSrc ? <video src={scene.videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                        : <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.10)' }}>🖼</span>}
                    <div style={{ position: 'absolute', bottom: 1, right: 2, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 8, padding: '1px 3px', borderRadius: 2, fontWeight: 700 }}>{scene.durationSec}s</div>
                  </div>
                  {/* 텍스트 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>씬 {idx + 1} · {scene.subtitleChunks.length}개 자막</div>
                    <div style={{ fontSize: 11.5, color: scene.narration ? '#d0c4b8' : 'rgba(255,255,255,0.18)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {scene.narration || scene.subtitleChunks.map(c => c.text).join(' ') || '내용 없음'}
                    </div>
                  </div>
                  {/* ↑↓ */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={e => { e.stopPropagation(); moveScene(scene.id, -1); }} style={iconBtn} disabled={idx === 0}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveScene(scene.id, 1); }} style={iconBtn} disabled={idx === scenes.length - 1}>↓</button>
                  </div>
                </div>
                {/* 미니 자막 타임라인 */}
                {scene.subtitleChunks.length > 0 && (
                  <div style={{ margin: '0 9px 7px', height: 6, background: '#0a0908', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    {scene.subtitleChunks.map((c, ci) => (
                      <div key={c.id} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(c.startSec / scene.durationSec) * 100}%`, width: `${((c.endSec - c.startSec) / scene.durationSec) * 100}%`, background: CHUNK_COLORS[ci % CHUNK_COLORS.length] + '70', borderRadius: 2 }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 가운데 + 오른쪽 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

            {/* Remotion 플레이어 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 14, gap: 8, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>
                미리보기 · {Math.floor(totalSec / 60)}:{(totalSec % 60).toString().padStart(2, '0')} · {FPS}fps
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: 680 }}>
                  <Player
                    component={StoryboardVideo as any}
                    inputProps={videoProps}
                    durationInFrames={totalFrames}
                    compositionWidth={1280}
                    compositionHeight={720}
                    fps={FPS}
                    style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' }}
                    controls autoPlay={false}
                  />
                </div>
              </div>
            </div>

            {/* 오른쪽 패널 */}
            {selectedScene && (
              <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#181512', display: 'flex', flexDirection: 'column' }}>
                {/* 탭 */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                  {([['subtitle', '자막 편집'], ['props', '씬 속성']] as const).map(([tab, label]) => (
                    <button key={tab} onClick={() => setRightTab(tab)} style={{
                      flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: rightTab === tab ? 'rgba(201,100,66,0.10)' : 'transparent',
                      color: rightTab === tab ? '#e09070' : 'rgba(255,255,255,0.35)',
                      borderBottom: rightTab === tab ? '2px solid #c96442' : '2px solid transparent',
                    }}>{label}</button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
                  {/* ── 자막 편집 탭 ── */}
                  {rightTab === 'subtitle' && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', marginBottom: 10 }}>
                        씬 {scenes.findIndex(s => s.id === selectedId) + 1} · 자막 청크 ({selectedScene.subtitleChunks.length}개)
                      </div>

                      {/* 나레이션 전체 텍스트 */}
                      <label style={labelStyle}>전체 나레이션 (자동 분할 원본)</label>
                      <textarea
                        value={selectedScene.narration}
                        onChange={e => updateScene(selectedId, { narration: e.target.value })}
                        rows={3}
                        placeholder="나레이션 전체 텍스트..."
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 7, fontSize: 12.5, background: '#0e0c0a', border: '1px solid rgba(255,255,255,0.10)', color: '#e0d5ca', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.55, boxSizing: 'border-box', marginBottom: 10 }}
                      />

                      {/* 자막 청크 편집기 */}
                      <SubtitleEditor
                        scene={selectedScene}
                        onUpdate={patch => updateScene(selectedId, patch)}
                      />
                    </div>
                  )}

                  {/* ── 씬 속성 탭 ── */}
                  {rightTab === 'props' && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', marginBottom: 10 }}>
                        씬 {scenes.findIndex(s => s.id === selectedId) + 1} 속성
                      </div>

                      {/* 이미지 프롬프트 */}
                      <label style={labelStyle}>이미지 프롬프트</label>
                      <textarea value={selectedScene.visualPrompt}
                        onChange={e => updateScene(selectedId, { visualPrompt: e.target.value })}
                        rows={3} placeholder="영어로 이미지 묘사..."
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 7, fontSize: 12, background: '#0e0c0a', border: '1px solid rgba(255,255,255,0.08)', color: '#a09080', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                      />

                      {/* AI 이미지 생성 */}
                      <label style={{ ...labelStyle, marginTop: 8 }}>AI 이미지 생성</label>
                      <select
                        value={imageGenModel}
                        onChange={e => setImageGenModel(e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 11.5, background: '#0e0c0a', border: '1px solid rgba(255,255,255,0.10)', color: '#c0b0a0', outline: 'none', marginBottom: 6, cursor: 'pointer' }}
                      >
                        {IMAGE_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name} {m.pricePerImage > 0 ? `($${m.pricePerImage})` : '(무료)'}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => generateSceneImage(selectedId, selectedScene.visualPrompt)}
                        disabled={imageGenLoading[selectedId] || !selectedScene.visualPrompt.trim()}
                        style={{ ...mediaBtn, width: '100%', background: imageGenLoading[selectedId] ? 'rgba(201,100,66,0.08)' : 'rgba(201,100,66,0.18)', borderColor: 'rgba(201,100,66,0.30)', color: '#e09070', marginBottom: 4 }}
                      >
                        {imageGenLoading[selectedId] ? '⏳ 생성 중...' : '🎨 이미지 생성'}
                      </button>
                      {imageGenError[selectedId] && (
                        <div style={{ fontSize: 10.5, color: '#fca5a5', marginBottom: 6, lineHeight: 1.4 }}>{imageGenError[selectedId]}</div>
                      )}

                      {/* 재생 시간 */}
                      <label style={{ ...labelStyle, marginTop: 8 }}>재생 시간 <span style={{ color: 'rgba(66,133,244,0.7)', fontSize: 10 }}>(변경 시 자막 자동 조정)</span></label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min={1} max={30} step={0.5} value={selectedScene.durationSec}
                          onChange={e => updateScene(selectedId, { durationSec: Number(e.target.value) })}
                          style={{ flex: 1, accentColor: '#c96442' }} />
                        <span style={{ fontSize: 12, color: '#e0d5ca', minWidth: 36, textAlign: 'right' }}>{selectedScene.durationSec}초</span>
                      </div>

                      {/* 미디어 업로드 */}
                      <label style={{ ...labelStyle, marginTop: 10 }}>미디어 업로드 <span style={{ color: 'rgba(66,133,244,0.7)', fontSize: 10 }}>(영상은 길이 자동 감지)</span></label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleImageFile(selectedId, f); }; i.click(); }} style={mediaBtn}>🖼 이미지</button>
                        <button onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleVideoFile(selectedId, f); }; i.click(); }} style={mediaBtn}>🎥 영상</button>
                        {(selectedScene.imageSrc || selectedScene.videoSrc) && (
                          <button onClick={() => updateScene(selectedId, { imageSrc: '', videoSrc: '' })} style={{ ...mediaBtn, background: 'rgba(201,100,66,0.15)', borderColor: 'rgba(201,100,66,0.25)', color: '#e09070' }}>✕</button>
                        )}
                      </div>
                      {(selectedScene.imageSrc || selectedScene.videoSrc) && (
                        <div style={{ marginTop: 8, borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', height: 76 }}>
                          {selectedScene.imageSrc
                            ? <img src={selectedScene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : <video src={selectedScene.videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />}
                        </div>
                      )}

                      {/* 씬 액션 */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                        <button onClick={() => addScene(selectedId)} style={{ ...mediaBtn, flex: 1 }}>+ 아래 추가</button>
                        <button onClick={() => duplicateScene(selectedId)} style={{ ...mediaBtn, flex: 1 }}>복제</button>
                        <button onClick={() => deleteScene(selectedId)} style={{ ...mediaBtn, background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.20)', color: '#fca5a5' }} disabled={scenes.length <= 1}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── 자막 스타일 바 ── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#181512', padding: '8px 18px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.32)', flexShrink: 0 }}>자막 스타일</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={ctrlLabel}>크기</span>
              <input type="range" min={18} max={72} step={2} value={subtitleStyle.fontSize} onChange={e => setSubtitleStyle(p => ({ ...p, fontSize: +e.target.value }))} style={{ width: 75, accentColor: '#c96442' }} />
              <span style={ctrlValue}>{subtitleStyle.fontSize}px</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={ctrlLabel}>글자</span>
              <input type="color" value={subtitleStyle.textColor} onChange={e => setSubtitleStyle(p => ({ ...p, textColor: e.target.value }))} style={{ width: 28, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={ctrlLabel}>배경</span>
              <input type="color" value={subtitleStyle.bgColor} onChange={e => setSubtitleStyle(p => ({ ...p, bgColor: e.target.value }))} style={{ width: 28, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={ctrlLabel}>투명도</span>
              <input type="range" min={0} max={1} step={0.05} value={subtitleStyle.bgOpacity} onChange={e => setSubtitleStyle(p => ({ ...p, bgOpacity: +e.target.value }))} style={{ width: 65, accentColor: '#c96442' }} />
              <span style={ctrlValue}>{Math.round(subtitleStyle.bgOpacity * 100)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={ctrlLabel}>위치</span>
              {(['bottom', 'center', 'top'] as const).map(pos => (
                <button key={pos} onClick={() => setSubtitleStyle(p => ({ ...p, position: pos }))} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: subtitleStyle.position === pos ? 'rgba(201,100,66,0.22)' : 'rgba(255,255,255,0.05)', border: `1px solid ${subtitleStyle.position === pos ? 'rgba(201,100,66,0.38)' : 'rgba(255,255,255,0.09)'}`, color: subtitleStyle.position === pos ? '#e09070' : 'rgba(255,255,255,0.35)', cursor: 'pointer' }}>
                  {{ bottom: '하단', center: '중앙', top: '상단' }[pos]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {([['bold', '굵게'], ['shadow', '그림자']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setSubtitleStyle(p => ({ ...p, [k]: !p[k as keyof SubtitleStyle] }))} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: subtitleStyle[k as keyof SubtitleStyle] ? 'rgba(201,100,66,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${subtitleStyle[k as keyof SubtitleStyle] ? 'rgba(201,100,66,0.32)' : 'rgba(255,255,255,0.09)'}`, color: subtitleStyle[k as keyof SubtitleStyle] ? '#e09070' : 'rgba(255,255,255,0.32)', cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
            <button onClick={() => setSubtitleStyle(DEFAULT_SUBTITLE_STYLE)} style={{ padding: '2px 9px', borderRadius: 4, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', marginLeft: 'auto' }}>초기화</button>
          </div>
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 8px; }
        input[type=range] { cursor: pointer; }
        button:disabled { opacity: 0.28 !important; cursor: not-allowed !important; }
        textarea { font-family: 'Noto Sans KR', system-ui, sans-serif; }
      `}</style>
    </div>
  );
}

// ── 스타일 상수 ──────────────────────────────────────────────────────────────
const loadingStyle: React.CSSProperties = { width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 };
const tbBtn = (c: string): React.CSSProperties => ({ padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: 'rgba(255,255,255,0.06)', border: `1px solid ${c}30`, color: c, cursor: 'pointer' });
const iconBtn: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5 };
const mediaBtn: React.CSSProperties = { padding: '5px 9px', borderRadius: 6, fontSize: 11.5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.50)', cursor: 'pointer' };
const chunkBtn: React.CSSProperties = { padding: '5px 10px', borderRadius: 6, fontSize: 11.5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.50)', cursor: 'pointer' };
const timeInput: React.CSSProperties = { width: 46, padding: '2px 5px', borderRadius: 4, fontSize: 11, background: '#0e0c0a', border: '1px solid rgba(255,255,255,0.10)', color: '#e0d5ca', outline: 'none', textAlign: 'center' };
const ctrlLabel: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.32)', flexShrink: 0 };
const ctrlValue: React.CSSProperties = { fontSize: 11, color: '#c8b8a2', minWidth: 32, textAlign: 'right' };
