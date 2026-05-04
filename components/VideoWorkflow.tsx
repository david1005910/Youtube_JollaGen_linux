'use client';

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SrtEntry {
  index: number;
  start: number;    // seconds
  end: number;
  startStr: string;
  endStr: string;
  text: string;
}

interface VideoSource {
  videoPath: string;
  videoUrl: string;
  title: string;
  duration: number;
  srtFiles: string[];
}

interface WorkflowClip {
  id: string;
  label: string;
  start: number;
  end: number;
  reason?: string;
  exportStatus: 'idle' | 'processing' | 'done' | 'error';
  exportUrl?: string;
  exportError?: string;
}

interface SubStyle {
  fontSize: number;
  fontColor: string;
  bgColor: string;
  bgOpacity: number;
  position: 'bottom' | 'center' | 'top';
  bold: boolean;
}

interface DownloadProgress { pct: number; msg: string; }

type Step = 'source' | 'transcript' | 'clips' | 'edit' | 'export';

// ─── SRT Utilities ────────────────────────────────────────────────────────────
function timeToSec(t: string): number {
  const [h, m, s] = t.replace(',', '.').split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}

function secToStr(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0').replace('.', ',')}`;
}

function parseSrt(raw: string): SrtEntry[] {
  const blocks = raw.trim().split(/\n\n+/);
  return blocks.flatMap(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return [];
    const timeParts = lines[1]?.split('-->');
    if (!timeParts || timeParts.length !== 2) return [];
    const startStr = timeParts[0].trim();
    const endStr   = timeParts[1].trim();
    const text = lines.slice(2).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!text) return [];
    return [{ index: parseInt(lines[0]) || 0, start: timeToSec(startStr), end: timeToSec(endStr), startStr, endStr, text }];
  });
}

function fmtSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function secToInput(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function inputToSec(v: string): number {
  const parts = v.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  return 0;
}

let _clipId = 0;
const clipUid = () => `wclip_${++_clipId}_${Date.now()}`;

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { onClose: () => void; }

const STEPS: { key: Step; icon: string; label: string }[] = [
  { key: 'source',     icon: '📥', label: '소스' },
  { key: 'transcript', icon: '📝', label: '자막' },
  { key: 'clips',      icon: '✂️', label: '클립' },
  { key: 'edit',       icon: '🎬', label: '편집' },
  { key: 'export',     icon: '⬇️', label: '내보내기' },
];

const DEFAULT_STYLE: SubStyle = {
  fontSize: 28, fontColor: 'ffffff', bgColor: '000000',
  bgOpacity: 160, position: 'bottom', bold: false,
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VideoWorkflow({ onClose }: Props) {
  const [step, setStep] = useState<Step>('source');
  const [ytUrl, setYtUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress>({ pct: 0, msg: '' });
  const [dlError, setDlError] = useState('');
  const [source, setSource] = useState<VideoSource | null>(null);

  const [srtEntries, setSrtEntries] = useState<SrtEntry[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(-1);

  const [clips, setClips] = useState<WorkflowClip[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [manualStart, setManualStart] = useState('00:00:00');
  const [manualEnd, setManualEnd] = useState('00:00:00');
  const [manualLabel, setManualLabel] = useState('');

  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [subStyle, setSubStyle] = useState<SubStyle>(DEFAULT_STYLE);

  const [exportAll, setExportAll] = useState(false);
  const [exportingId, setExportingId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Active subtitle tracking ─────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const handler = () => {
      const t = vid.currentTime;
      const idx = srtEntries.findIndex(e => t >= e.start && t < e.end);
      setActiveSubIdx(idx);
    };
    vid.addEventListener('timeupdate', handler);
    return () => vid.removeEventListener('timeupdate', handler);
  }, [srtEntries]);

  // ── SSE YouTube Download ─────────────────────────────────────────────────
  const startDownload = useCallback(async () => {
    if (!ytUrl.trim()) return;
    setDownloading(true);
    setDlError('');
    setDlProgress({ pct: 0, msg: '요청 중...' });

    try {
      const res = await fetch('/api/youtube/download-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ytUrl.trim() }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            setDlProgress({ pct: data.pct, msg: data.msg });
          } else if (data.type === 'error') {
            setDlError(data.msg);
            setDownloading(false);
            return;
          } else if (data.type === 'done') {
            const src: VideoSource = {
              videoPath: data.path,
              videoUrl:  `/api/media/serve?path=${encodeURIComponent(data.path)}`,
              title:     data.title,
              duration:  data.duration,
              srtFiles:  data.srtFiles ?? [],
            };
            setSource(src);
            setDlProgress({ pct: 100, msg: '다운로드 완료!' });
            setDownloading(false);
            // Auto-load first SRT
            if (src.srtFiles.length > 0) {
              loadSrt(src.srtFiles[0]);
            }
            setStep('transcript');
          }
        }
      }
    } catch (e: any) {
      setDlError(e.message);
      setDownloading(false);
    }
  }, [ytUrl]);

  const loadSrt = async (srtPath: string) => {
    try {
      const text = await fetch(`/api/media/serve?path=${encodeURIComponent(srtPath)}`).then(r => r.text());
      setSrtEntries(parseSrt(text));
    } catch { /* no-op */ }
  };

  // ── Local file upload ─────────────────────────────────────────────────────
  const handleLocalVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSource({ videoPath: file.name, videoUrl: url, title: file.name, duration: 0, srtFiles: [] });
    setStep('transcript');
  };

  const handleLocalSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setSrtEntries(parseSrt(ev.target?.result as string));
    reader.readAsText(file, 'utf-8');
  };

  // ── AI clip analysis ─────────────────────────────────────────────────────
  const runAiAnalysis = async () => {
    if (!source || srtEntries.length === 0) return;
    setAiAnalyzing(true);
    try {
      const transcript = srtEntries.map(e => `${fmtSec(e.start)} ${e.text}`).join('\n');
      const res = await fetch('/api/youtube/clipper-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          videoTitle: source.title,
          duration:   source.duration,
          userQuery:  '핵심 하이라이트와 재미있는 구간을 추출해주세요',
        }),
      });
      const data = await res.json();
      if (data.ok && data.clips?.length) {
        const newClips: WorkflowClip[] = data.clips.map((c: any) => ({
          id:     clipUid(),
          label:  c.label,
          start:  inputToSec(c.start),
          end:    inputToSec(c.end),
          reason: c.reason,
          exportStatus: 'idle',
        }));
        setClips(prev => [...prev, ...newClips]);
      }
    } catch { /* no-op */ }
    setAiAnalyzing(false);
  };

  const addManualClip = () => {
    const s = inputToSec(manualStart);
    const e = inputToSec(manualEnd);
    if (e <= s) return;
    setClips(prev => [...prev, {
      id: clipUid(), label: manualLabel || `클립 ${prev.length + 1}`,
      start: s, end: e, exportStatus: 'idle',
    }]);
    setManualLabel('');
  };

  // ── Clip SRT filter ──────────────────────────────────────────────────────
  const clippedSrt = useCallback((clip: WorkflowClip): SrtEntry[] =>
    srtEntries
      .filter(e => e.end > clip.start && e.start < clip.end)
      .map((e, i) => ({
        ...e,
        index:    i + 1,
        start:    Math.max(0, e.start - clip.start),
        end:      Math.min(e.end - clip.start, clip.end - clip.start),
        startStr: secToStr(Math.max(0, e.start - clip.start)),
        endStr:   secToStr(Math.min(e.end - clip.start, clip.end - clip.start)),
      })),
  [srtEntries]);

  // ── Export clip ──────────────────────────────────────────────────────────
  const exportClip = async (clip: WorkflowClip) => {
    if (!source) return;
    setExportingId(clip.id);
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, exportStatus: 'processing' } : c));

    try {
      // 1. Clip the video
      const clipRes = await fetch('/api/youtube/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: source.videoPath,
          clips: [{ start: secToInput(clip.start), end: secToInput(clip.end), label: clip.label }],
          quality: 'h264',
        }),
      }).then(r => r.json());

      if (!clipRes.ok || !clipRes.outputs?.[0]) throw new Error(clipRes.error ?? '클립 추출 실패');

      const clippedVideoPath = `/tmp/tubegen/${clipRes.outputs[0].url.split('/').pop()}`;
      // the clips are served from /clips/, need server path
      const clippedVideoServerPath = `${process.cwd()}/public${clipRes.outputs[0].url}`.replace('/api/..', '');

      // 2. Burn subtitles
      const burnRes = await fetch('/api/youtube/burn-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath:   clipRes.outputs[0].url.startsWith('/clips/')
            ? `${process.cwd()}/public${clipRes.outputs[0].url}`
            : source.videoPath,
          srtEntries: clippedSrt(clip),
          outputName: `${clip.label}_burned.mp4`,
          style: {
            fontSize:   subStyle.fontSize,
            fontColor:  subStyle.fontColor,
            bgColor:    subStyle.bgColor,
            bgOpacity:  subStyle.bgOpacity,
            position:   subStyle.position,
            bold:       subStyle.bold,
          },
        }),
      }).then(r => r.json());

      if (!burnRes.ok) throw new Error(burnRes.error ?? '자막 삽입 실패');

      setClips(prev => prev.map(c => c.id === clip.id
        ? { ...c, exportStatus: 'done', exportUrl: burnRes.url }
        : c
      ));
    } catch (e: any) {
      setClips(prev => prev.map(c => c.id === clip.id
        ? { ...c, exportStatus: 'error', exportError: e.message }
        : c
      ));
    }
    setExportingId('');
  };

  // ── Download SRT ─────────────────────────────────────────────────────────
  const downloadSrt = () => {
    const content = srtEntries.map(e => `${e.index}\n${e.startStr} --> ${e.endStr}\n${e.text}\n`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${source?.title ?? 'subtitle'}.srt`;
    a.click();
  };

  const selectedClip = clips.find(c => c.id === selectedClipId);
  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9200, background: '#0a0908', color: '#e0d5ca', fontFamily: "'Noto Sans KR', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── Stepper Header ── */}
      <div style={{ flexShrink: 0, background: '#111009', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#c96442', marginRight: 28, flexShrink: 0, letterSpacing: '-0.2px' }}>
          🎞 영상 워크플로우
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          {STEPS.map((s, i) => {
            const isActive = step === s.key;
            const isDone   = stepIdx > i;
            const canClick = isDone || (source && i <= 4);
            return (
              <React.Fragment key={s.key}>
                <button
                  onClick={() => canClick && setStep(s.key)}
                  disabled={!canClick}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '11px 22px', border: 'none', background: isActive ? 'rgba(201,100,66,0.10)' : 'transparent', borderBottom: isActive ? '2px solid #c96442' : '2px solid transparent', cursor: canClick ? 'pointer' : 'default', gap: 3, transition: 'all 0.15s', opacity: canClick ? 1 : 0.35 }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: isActive ? 'rgba(201,100,66,0.22)' : isDone ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', border: isActive ? '1.5px solid rgba(201,100,66,0.55)' : isDone ? '1.5px solid rgba(34,197,94,0.40)' : '1.5px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                    {isDone ? '✓' : s.icon}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#e09070' : isDone ? '#86efac' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{s.label}</div>
                </button>
                {i < STEPS.length - 1 && (
                  <div style={{ width: 36, height: 1, background: isDone ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative', top: -8 }}>
                    <div style={{ position: 'absolute', right: -4, top: -4, fontSize: 9, color: 'rgba(255,255,255,0.14)' }}>▶</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <button onClick={onClose} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.40)', cursor: 'pointer', marginLeft: 16, flexShrink: 0 }}>✕ 닫기</button>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ══════ STEP: SOURCE ══════ */}
        {step === 'source' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: '100%', maxWidth: 560 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#e0d5ca', marginBottom: 6 }}>📥 소스 선택</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>YouTube 영상을 다운로드하거나 로컬 파일을 불러오세요</div>

              {/* YouTube 입력 */}
              <div style={{ background: '#161412', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e09070', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ background: 'rgba(255,0,0,0.18)', border: '1px solid rgba(255,0,0,0.25)', borderRadius: 5, padding: '2px 7px', fontSize: 11, color: '#f87171' }}>YouTube</span>
                  자동 다운로드 + 자막 추출
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !downloading && startDownload()}
                    placeholder="https://www.youtube.com/watch?v=..."
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: '#1e1b18', border: `1px solid ${dlError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.09)'}`, color: '#e0d5ca', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={startDownload} disabled={downloading || !ytUrl.trim()}
                    style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: downloading ? 'rgba(255,255,255,0.08)' : 'rgba(201,100,66,0.85)', border: 'none', color: '#fff', cursor: downloading ? 'default' : 'pointer', whiteSpace: 'nowrap', minWidth: 88 }}
                  >
                    {downloading ? '⏳ 처리 중' : '📥 다운로드'}
                  </button>
                </div>

                {/* Progress */}
                {(downloading || dlProgress.pct > 0) && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{dlProgress.msg}</div>
                      <div style={{ fontSize: 11, color: '#c96442', fontWeight: 600 }}>{Math.round(dlProgress.pct)}%</div>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${dlProgress.pct}%`, background: dlProgress.pct === 100 ? '#22c55e' : '#c96442', borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )}
                {dlError && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 7, fontSize: 11.5, color: '#fca5a5' }}>{dlError}</div>}
                {source && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 7, fontSize: 11.5, color: '#86efac' }}>✅ {source.title} ({fmtSec(source.duration)})</div>}
              </div>

              {/* 로컬 파일 */}
              <div style={{ background: '#161412', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 14 }}>💾 로컬 파일 불러오기</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1.5px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.40)', fontSize: 12, cursor: 'pointer', textAlign: 'center' }}>
                    🎥 영상 파일 (.mp4, .webm)
                    <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleLocalVideo} />
                  </label>
                  <label style={{ flex: 1, padding: '9px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1.5px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.40)', fontSize: 12, cursor: 'pointer', textAlign: 'center' }}>
                    📄 자막 파일 (.srt)
                    <input type="file" accept=".srt,.txt" style={{ display: 'none' }} onChange={handleLocalSrt} />
                  </label>
                </div>
              </div>

              {source && (
                <button onClick={() => setStep('transcript')} style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, background: '#c96442', border: 'none', color: '#fff', cursor: 'pointer' }}>
                  자막 편집으로 →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════ STEP: TRANSCRIPT ══════ */}
        {step === 'transcript' && (
          <div style={{ flex: 1, display: 'flex', gap: 0, minWidth: 0 }}>
            {/* 왼쪽: 비디오 + 타임라인 */}
            <div style={{ width: '42%', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0d0b0a' }}>
              {source ? (
                <>
                  {/* 비디오 플레이어 */}
                  <div style={{ position: 'relative', width: '100%', background: '#000', flexShrink: 0 }}>
                    <video
                      ref={videoRef}
                      src={source.videoUrl}
                      controls
                      style={{ width: '100%', display: 'block', maxHeight: 280 }}
                    />
                    {/* 자막 오버레이 */}
                    {activeSubIdx >= 0 && srtEntries[activeSubIdx] && (
                      <div style={{
                        position: 'absolute',
                        bottom: '14%', left: '8%', right: '8%',
                        textAlign: 'center',
                        background: `rgba(0,0,0,0.72)`,
                        color: '#fff',
                        fontSize: 14,
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontWeight: 500,
                        pointerEvents: 'none',
                      }}>
                        {srtEntries[activeSubIdx].text}
                      </div>
                    )}
                  </div>

                  {/* 미니 타임라인 */}
                  {source.duration > 0 && srtEntries.length > 0 && (
                    <div style={{ padding: '10px 14px', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>자막 타임라인</div>
                      <div style={{ height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                        {srtEntries.map((e, i) => (
                          <div key={i} onClick={() => { if (videoRef.current) videoRef.current.currentTime = e.start; }}
                            title={`${fmtSec(e.start)}: ${e.text.slice(0, 30)}`}
                            style={{ position: 'absolute', top: 1, height: 14, borderRadius: 2, background: 'rgba(201,100,66,0.65)', cursor: 'pointer', left: `${(e.start / source.duration) * 100}%`, width: `${Math.max(0.3, ((e.end - e.start) / source.duration) * 100)}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SRT 파일 선택 */}
                  {source.srtFiles.length > 1 && (
                    <div style={{ padding: '8px 14px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.30)', marginBottom: 6 }}>다운로드된 자막 파일</div>
                      {source.srtFiles.map((f, i) => (
                        <button key={i} onClick={() => loadSrt(f)} style={{ ...tagBtn, marginRight: 6, marginBottom: 4 }}>
                          {f.split('/').pop()?.slice(-30)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* SRT 없을 때 업로드 유도 */}
                  {srtEntries.length === 0 && (
                    <label style={{ margin: 14, padding: '12px 0', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1.5px dashed rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.30)', fontSize: 12, cursor: 'pointer', textAlign: 'center', display: 'block' }}>
                      📄 SRT 자막 파일 업로드
                      <input type="file" accept=".srt,.txt" style={{ display: 'none' }} onChange={handleLocalSrt} />
                    </label>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.20)', fontSize: 13 }}>영상 소스 없음</div>
              )}
            </div>

            {/* 오른쪽: 자막 편집기 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* 툴바 */}
              <div style={{ flexShrink: 0, padding: '9px 16px', background: '#111009', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e0d5ca' }}>📝 자막 편집기</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 5 }}>{srtEntries.length}개</div>
                <div style={{ flex: 1 }} />
                <button onClick={downloadSrt} disabled={srtEntries.length === 0} style={toolBtn}>📄 SRT 다운로드</button>
                <button onClick={() => { setSrtEntries(prev => [...prev, { index: prev.length + 1, start: 0, end: 3, startStr: '00:00:00,000', endStr: '00:00:03,000', text: '새 자막' }]); }} style={toolBtn}>+ 추가</button>
                <button onClick={() => setStep('clips')} disabled={!source} style={{ ...toolBtn, background: 'rgba(201,100,66,0.80)', borderColor: 'rgba(201,100,66,0.9)', color: '#fff' }}>클립 선택 →</button>
              </div>

              {/* 자막 목록 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {srtEntries.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.18)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 32 }}>📄</div>
                    자막 파일을 업로드하거나 YouTube 자동 자막을 사용하세요
                  </div>
                ) : (
                  srtEntries.map((e, i) => (
                    <SrtRow
                      key={i} entry={e} idx={i}
                      isActive={i === activeSubIdx}
                      isEditing={i === editingIdx}
                      onSeek={() => { if (videoRef.current) videoRef.current.currentTime = e.start; }}
                      onStartEdit={() => setEditingIdx(i)}
                      onEndEdit={() => setEditingIdx(null)}
                      onChange={text => setSrtEntries(prev => prev.map((x, j) => j === i ? { ...x, text } : x))}
                      onDelete={() => setSrtEntries(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════ STEP: CLIPS ══════ */}
        {step === 'clips' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* 툴바 */}
            <div style={{ flexShrink: 0, padding: '10px 20px', background: '#111009', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e0d5ca' }}>✂️ 클립 선택</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 5 }}>{clips.length}개</div>
              <div style={{ flex: 1 }} />
              <button onClick={runAiAnalysis} disabled={aiAnalyzing || srtEntries.length === 0} style={{ ...toolBtn, background: aiAnalyzing ? 'rgba(255,255,255,0.06)' : 'rgba(66,133,244,0.18)', borderColor: 'rgba(66,133,244,0.30)', color: aiAnalyzing ? 'rgba(255,255,255,0.35)' : '#93c5fd' }}>
                {aiAnalyzing ? '⏳ AI 분석 중...' : '🤖 AI 클립 추천'}
              </button>
              {clips.length > 0 && (
                <button onClick={() => { const first = clips[0]; setSelectedClipId(first.id); setStep('edit'); }} style={{ ...toolBtn, background: 'rgba(201,100,66,0.80)', borderColor: 'rgba(201,100,66,0.9)', color: '#fff' }}>편집 →</button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* 수동 클립 추가 */}
              <div style={{ background: '#161412', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>+ 수동 클립 추가</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="클립 제목" style={{ ...inpSt, flex: 2, minWidth: 120 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>시작</span>
                    <input value={manualStart} onChange={e => setManualStart(e.target.value)} placeholder="00:00:00" style={{ ...inpSt, width: 90, textAlign: 'center', fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>종료</span>
                    <input value={manualEnd} onChange={e => setManualEnd(e.target.value)} placeholder="00:00:00" style={{ ...inpSt, width: 90, textAlign: 'center', fontFamily: 'monospace' }} />
                  </div>
                  <button onClick={addManualClip} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'rgba(201,100,66,0.20)', border: '1px solid rgba(201,100,66,0.35)', color: '#e09070', cursor: 'pointer' }}>추가</button>
                </div>
              </div>

              {/* 클립 카드 목록 */}
              {clips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✂️</div>
                  AI 분석 또는 수동으로 클립을 추가하세요
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clips.map((clip, i) => (
                    <div key={clip.id} style={{ background: '#161412', border: `1px solid ${selectedClipId === clip.id ? 'rgba(201,100,66,0.50)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,100,66,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#d97559', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e0d5ca', marginBottom: 3 }}>{clip.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                          {fmtSec(clip.start)} → {fmtSec(clip.end)} ({fmtSec(clip.end - clip.start)})
                        </div>
                        {clip.reason && <div style={{ fontSize: 10.5, color: 'rgba(147,197,253,0.60)', marginTop: 3 }}>{clip.reason}</div>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)' }}>자막 {clippedSrt(clip).length}개</div>
                      <button onClick={() => { setSelectedClipId(clip.id); setStep('edit'); }} style={{ ...tagBtn, background: 'rgba(201,100,66,0.14)', borderColor: 'rgba(201,100,66,0.28)', color: '#e09070' }}>편집</button>
                      <button onClick={() => setClips(prev => prev.filter(c => c.id !== clip.id))} style={{ ...tagBtn, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.18)', color: '#fca5a5' }}>삭제</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════ STEP: EDIT ══════ */}
        {step === 'edit' && (
          <div style={{ flex: 1, display: 'flex', minWidth: 0, gap: 0 }}>
            {/* 클립 리스트 + 스타일 패널 */}
            <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0e0c0b', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>클립 목록</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {clips.map(clip => (
                  <div key={clip.id} onClick={() => setSelectedClipId(clip.id)} style={{ margin: '3px 8px', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selectedClipId === clip.id ? 'rgba(201,100,66,0.45)' : 'rgba(255,255,255,0.06)'}`, background: selectedClipId === clip.id ? 'rgba(201,100,66,0.07)' : 'rgba(255,255,255,0.02)', transition: 'all 0.1s' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#d0c4b8', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{clip.label}</div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace' }}>{fmtSec(clip.start)} ~ {fmtSec(clip.end)}</div>
                  </div>
                ))}
              </div>

              {/* 자막 스타일 패널 */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: '0.04em' }}>🎨 자막 스타일</div>
                <StylePanel style={subStyle} onChange={setSubStyle} />
              </div>
            </div>

            {/* 편집 중앙: 비디오 + 자막 목록 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {selectedClip ? (
                <>
                  {/* 비디오 + 자막 오버레이 */}
                  <div style={{ flexShrink: 0, background: '#000', position: 'relative' }}>
                    <video
                      src={source?.videoUrl}
                      controls
                      style={{ width: '100%', display: 'block', maxHeight: 300 }}
                      onLoadedMetadata={e => {
                        if (selectedClip) (e.target as HTMLVideoElement).currentTime = selectedClip.start;
                      }}
                    />
                    {/* 현재 자막 오버레이 (미리보기) */}
                    {srtEntries.filter(e => {
                      if (!videoRef.current) return false;
                      const t = videoRef.current.currentTime;
                      return t >= e.start && t < e.end;
                    }).slice(0, 1).map((e, i) => (
                      <div key={i} style={{
                        position: 'absolute',
                        bottom: subStyle.position === 'top' ? 'auto' : subStyle.position === 'center' ? '45%' : '14%',
                        top:    subStyle.position === 'top' ? '8%' : 'auto',
                        left: '8%', right: '8%', textAlign: 'center',
                        background: `rgba(0,0,0,${subStyle.bgOpacity / 255})`,
                        color: `#${subStyle.fontColor}`,
                        fontSize: subStyle.fontSize,
                        fontWeight: subStyle.bold ? 700 : 400,
                        padding: '4px 10px',
                        borderRadius: 4,
                        pointerEvents: 'none',
                      }}>{e.text}</div>
                    ))}
                  </div>

                  {/* 클립 자막 목록 */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
                    <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>클립 자막: {selectedClip.label}</div>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)' }}>{clippedSrt(selectedClip).length}개</div>
                    </div>
                    {clippedSrt(selectedClip).map((e, i) => (
                      <div key={i} style={{ padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0, paddingTop: 2 }}>
                          {fmtSec(e.start + selectedClip.start)}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, color: '#d0c4b8', lineHeight: 1.5 }}>{e.text}</div>
                      </div>
                    ))}
                  </div>

                  {/* 내보내기 버튼 */}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setStep('export')} style={{ ...toolBtn, background: 'rgba(201,100,66,0.80)', borderColor: 'rgba(201,100,66,0.9)', color: '#fff' }}>내보내기 →</button>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>왼쪽에서 클립을 선택하세요</div>
              )}
            </div>
          </div>
        )}

        {/* ══════ STEP: EXPORT ══════ */}
        {step === 'export' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flexShrink: 0, padding: '10px 20px', background: '#111009', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e0d5ca' }}>⬇️ 내보내기</div>
              <div style={{ flex: 1 }} />
              <button onClick={downloadSrt} style={toolBtn}>📄 SRT 다운로드</button>
              <button
                onClick={async () => {
                  setExportAll(true);
                  for (const clip of clips) {
                    if (clip.exportStatus !== 'done') await exportClip(clip);
                  }
                  setExportAll(false);
                }}
                disabled={exportAll || clips.length === 0}
                style={{ ...toolBtn, background: 'rgba(201,100,66,0.80)', borderColor: 'rgba(201,100,66,0.9)', color: '#fff' }}
              >
                {exportAll ? '⏳ 렌더링 중...' : '⚡ 전체 FFmpeg 렌더'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* 스타일 요약 */}
              <div style={{ background: '#161412', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>자막 스타일 적용:</div>
                <StyleTag label="크기" value={`${subStyle.fontSize}px`} />
                <StyleTag label="위치" value={subStyle.position === 'bottom' ? '하단' : subStyle.position === 'top' ? '상단' : '중앙'} />
                <StyleTag label="굵기" value={subStyle.bold ? '굵음' : '보통'} />
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: `#${subStyle.fontColor}`, border: '1.5px solid rgba(255,255,255,0.20)' }} />
              </div>

              {/* 클립별 내보내기 상태 */}
              {clips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.18)', fontSize: 13 }}>
                  클립이 없습니다. ← 클립 선택 단계로 돌아가세요
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clips.map((clip, i) => (
                    <ExportCard
                      key={clip.id}
                      clip={clip}
                      index={i}
                      subCount={clippedSrt(clip).length}
                      onExport={() => exportClip(clip)}
                      isBusy={exportingId === clip.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.09); border-radius: 4px; }
        button:disabled { opacity: 0.35 !important; cursor: not-allowed !important; }
        input:focus { outline: none; border-color: rgba(201,100,66,0.40) !important; }
      `}</style>
    </div>
  );
}

// ─── SRT Row ─────────────────────────────────────────────────────────────────
function SrtRow({ entry, idx, isActive, isEditing, onSeek, onStartEdit, onEndEdit, onChange, onDelete }: {
  entry: SrtEntry; idx: number; isActive: boolean; isEditing: boolean;
  onSeek: () => void; onStartEdit: () => void; onEndEdit: () => void;
  onChange: (t: string) => void; onDelete: () => void;
}) {
  return (
    <div style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'flex-start', background: isActive ? 'rgba(201,100,66,0.07)' : 'transparent', transition: 'background 0.15s' }}>
      <div style={{ width: 28, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', flexShrink: 0, paddingTop: 3 }}>{entry.index}</div>
      <button onClick={onSeek} title="이 시간으로 이동" style={{ fontSize: 10.5, color: isActive ? '#c96442' : 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', padding: 0, flexShrink: 0, paddingTop: 3 }}>
        {fmtSec(entry.start)}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <textarea
            autoFocus
            value={entry.text}
            onChange={e => onChange(e.target.value)}
            onBlur={onEndEdit}
            rows={2}
            style={{ width: '100%', background: '#1e1b18', border: '1px solid rgba(201,100,66,0.30)', borderRadius: 6, color: '#e0d5ca', fontSize: 13, padding: '5px 8px', fontFamily: 'inherit', lineHeight: 1.6, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
          />
        ) : (
          <div onClick={onStartEdit} title="클릭하여 편집" style={{ fontSize: 13, color: '#d0c4b8', lineHeight: 1.6, cursor: 'text', padding: '2px 4px', borderRadius: 4, minHeight: 24 }}>
            {entry.text || <span style={{ color: 'rgba(255,255,255,0.18)' }}>(없음)</span>}
          </div>
        )}
      </div>
      <button onClick={onDelete} style={{ fontSize: 11, color: 'rgba(239,68,68,0.50)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ─── Style Panel ─────────────────────────────────────────────────────────────
function StylePanel({ style, onChange }: { style: SubStyle; onChange: (s: SubStyle) => void }) {
  const upd = (patch: Partial<SubStyle>) => onChange({ ...style, ...patch });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11.5 }}>
      <div>
        <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>크기 ({style.fontSize}px)</div>
        <input type="range" min={14} max={60} value={style.fontSize} onChange={e => upd({ fontSize: Number(e.target.value) })} style={{ width: '100%', accentColor: '#c96442' }} />
      </div>
      <div>
        <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>위치</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['top', 'center', 'bottom'] as const).map(p => (
            <button key={p} onClick={() => upd({ position: p })} style={{ flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 10.5, background: style.position === p ? 'rgba(201,100,66,0.22)' : 'rgba(255,255,255,0.05)', border: `1px solid ${style.position === p ? 'rgba(201,100,66,0.45)' : 'rgba(255,255,255,0.09)'}`, color: style.position === p ? '#e09070' : 'rgba(255,255,255,0.40)', cursor: 'pointer' }}>
              {p === 'top' ? '상단' : p === 'center' ? '중앙' : '하단'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>글자색</div>
          <input type="color" value={`#${style.fontColor}`} onChange={e => upd({ fontColor: e.target.value.slice(1) })} style={{ width: '100%', height: 28, borderRadius: 5, border: '1px solid rgba(255,255,255,0.10)', background: 'none', cursor: 'pointer' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>배경색</div>
          <input type="color" value={`#${style.bgColor}`} onChange={e => upd({ bgColor: e.target.value.slice(1) })} style={{ width: '100%', height: 28, borderRadius: 5, border: '1px solid rgba(255,255,255,0.10)', background: 'none', cursor: 'pointer' }} />
        </div>
      </div>
      <div>
        <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>배경 불투명도 ({Math.round(style.bgOpacity / 255 * 100)}%)</div>
        <input type="range" min={0} max={255} value={style.bgOpacity} onChange={e => upd({ bgOpacity: Number(e.target.value) })} style={{ width: '100%', accentColor: '#c96442' }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.45)' }}>
        <input type="checkbox" checked={style.bold} onChange={e => upd({ bold: e.target.checked })} style={{ accentColor: '#c96442' }} />
        굵게
      </label>
    </div>
  );
}

// ─── Export Card ──────────────────────────────────────────────────────────────
function ExportCard({ clip, index, subCount, onExport, isBusy }: {
  clip: WorkflowClip; index: number; subCount: number;
  onExport: () => void; isBusy: boolean;
}) {
  return (
    <div style={{ background: '#161412', border: `1px solid ${clip.exportStatus === 'done' ? 'rgba(34,197,94,0.30)' : clip.exportStatus === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
        {clip.exportStatus === 'done' ? '✅' : clip.exportStatus === 'processing' ? (
          <div style={{ width: 16, height: 16, border: '2px solid rgba(201,100,66,0.2)', borderTop: '2px solid #c96442', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        ) : clip.exportStatus === 'error' ? '⚠️' : <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)' }}>{index + 1}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e0d5ca', marginBottom: 3 }}>{clip.label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>
          {fmtSec(clip.start)} → {fmtSec(clip.end)} · 자막 {subCount}개
        </div>
        {clip.exportStatus === 'error' && <div style={{ fontSize: 10.5, color: '#fca5a5', marginTop: 3 }}>{clip.exportError?.slice(0, 120)}</div>}
      </div>
      {clip.exportStatus === 'done' && clip.exportUrl ? (
        <a href={clip.exportUrl} download style={{ ...tagBtn as any, background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.28)', color: '#86efac', textDecoration: 'none' }}>⬇ 다운로드</a>
      ) : (
        <button onClick={onExport} disabled={isBusy || clip.exportStatus === 'processing'} style={{ ...tagBtn, background: 'rgba(201,100,66,0.18)', borderColor: 'rgba(201,100,66,0.30)', color: '#e09070' }}>
          {clip.exportStatus === 'processing' ? '처리 중...' : clip.exportStatus === 'error' ? '↺ 재시도' : '🎬 렌더'}
        </button>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StyleTag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#c8b8a2' }}>{value}</span>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────
const toolBtn: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.50)', cursor: 'pointer', whiteSpace: 'nowrap',
};
const tagBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.45)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
};
const inpSt: React.CSSProperties = {
  padding: '7px 11px', borderRadius: 7, fontSize: 12.5,
  background: '#1e1b18', border: '1px solid rgba(255,255,255,0.09)',
  color: '#e0d5ca', fontFamily: 'inherit',
};
