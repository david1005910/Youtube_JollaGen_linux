'use client';

import React, { useState, useRef, useCallback } from 'react';

interface ClipSpec {
  start: string;
  end: string;
  label: string;
  reason?: string;
}

interface ClipResult {
  label: string;
  url: string;
  size: number;
}

type Stage = 'idle' | 'downloading' | 'fetching-transcript' | 'analyzing' | 'editing' | 'clipping' | 'done' | 'error';

interface DownloadInfo {
  path: string;
  title: string;
  videoId: string;
  duration: number;
  srtFiles: string[];
}

/* ── Glassmorphism tokens ─────────────────────────────────────────────── */
const glass = {
  panel: {
    background:           'rgba(255,255,255,0.16)',
    backdropFilter:       'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border:               '1px solid rgba(255,255,255,0.30)',
    borderRadius:         20,
    boxShadow:            'inset 0 0 12px rgba(255,255,255,0.12), 0 4px 24px rgba(0,0,0,0.22)',
  },
  input: {
    background:           'rgba(255,255,255,0.10)',
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border:               '1px solid rgba(255,255,255,0.28)',
    borderRadius:         12,
    color:                '#fff',
    outline:              'none',
  },
  btn: (accent: string) => ({
    background:           accent,
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border:               '1px solid rgba(255,255,255,0.35)',
    borderRadius:         12,
    color:                '#fff',
    fontWeight:           700 as const,
    cursor:               'pointer',
    boxShadow:            '0 4px 24px rgba(0,0,0,0.20)',
    textShadow:           '0 1px 3px rgba(0,0,0,0.25)',
    transition:           'opacity 0.15s',
  }),
} as const;

/* ── helpers ──────────────────────────────────────────────────────────── */
function formatBytes(b: number) {
  if (b > 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

async function fetchTranscript(videoId: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.transcriptapi.com/transcript', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TubeGen/1.0',
    },
    body: JSON.stringify({ video_id: videoId, timestamps: true }),
  });
  if (!res.ok) throw new Error(`TranscriptAPI ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  // Convert timestamped segments to text
  if (Array.isArray(data.transcript)) {
    return data.transcript.map((s: any) => `[${s.start}] ${s.text}`).join('\n');
  }
  return typeof data.transcript === 'string' ? data.transcript : JSON.stringify(data.transcript);
}

/* ── Component ────────────────────────────────────────────────────────── */
interface YouTubeClipperChatProps {
  onClose: () => void;
}

const YouTubeClipperChat: React.FC<YouTubeClipperChatProps> = ({ onClose }) => {
  const [url, setUrl]               = useState('');
  const [stage, setStage]           = useState<Stage>('idle');
  const [log, setLog]               = useState<string[]>([]);
  const [downloadInfo, setDownload] = useState<DownloadInfo | null>(null);
  const [transcript, setTranscript] = useState('');
  const [clips, setClips]           = useState<ClipSpec[]>([]);
  const [results, setResults]       = useState<ClipResult[]>([]);
  const [userQuery, setUserQuery]   = useState('');
  const [quality, setQuality]       = useState<'copy'|'h264'>('copy');

  const addLog = useCallback((msg: string) => setLog(prev => [...prev, msg]), []);

  /* ── Step 1: 다운로드 ─────────────────────────────────────────────── */
  const handleDownload = async () => {
    if (!url.trim()) return;
    setStage('downloading');
    setLog([]);
    setDownload(null);
    setTranscript('');
    setClips([]);
    setResults([]);
    addLog('📥 영상 다운로드 시작...');

    try {
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '다운로드 실패');

      setDownload(data);
      addLog(`✅ 다운로드 완료: "${data.title}" (${formatBytes(data.size || 0)})${data.cached ? ' [캐시]' : ''}`);

      // Step 2: 트랜스크립트 자동 조회
      await handleFetchTranscript(data.videoId, data.title, data.duration, data.path, data.srtFiles);

    } catch (e: any) {
      addLog(`❌ 오류: ${e.message}`);
      setStage('error');
    }
  };

  /* ── Step 2: 트랜스크립트 ─────────────────────────────────────────── */
  const handleFetchTranscript = async (
    videoId: string, title: string, duration: number, filePath: string, srtFiles: string[]
  ) => {
    setStage('fetching-transcript');
    addLog('📜 자막 조회 중...');

    let text = '';
    try {
      // SRT 파일이 있으면 사용
      if (srtFiles && srtFiles.length > 0) {
        const res = await fetch('/api/youtube/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `transcript srt file: ${srtFiles[0]}` }],
            skill: 'transcript',
          }),
        });
        // SRT 직접 읽기 대신 TranscriptAPI 사용
      }

      // TranscriptAPI로 자막 가져오기
      const transRes = await fetch('/api/youtube/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `https://www.youtube.com/watch?v=${videoId}` }],
          skill: 'transcript',
          rawTranscript: true,
        }),
      });

      // SSE 스트림 읽기
      const reader = transRes.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) text += parsed.text;
            } catch {}
          }
        }
      }

      if (text.trim().length < 50) {
        addLog('⚠️ TranscriptAPI 자막 없음 — SRT 파일로 진행합니다.');
        text = srtFiles.length > 0 ? `[SRT 파일: ${srtFiles[0]}]` : '';
      } else {
        addLog(`✅ 자막 로드 완료 (${text.length}자)`);
      }
    } catch (e: any) {
      addLog(`⚠️ 자막 조회 실패: ${e.message}`);
    }

    setTranscript(text);
    await handleAnalyze(text, title, duration, filePath);
  };

  /* ── Step 3: AI 분석 ──────────────────────────────────────────────── */
  const handleAnalyze = async (
    transcriptText: string, title: string, duration: number, filePath: string
  ) => {
    setStage('analyzing');
    addLog('🤖 AI 클립 구간 분석 중...');

    try {
      const res = await fetch('/api/youtube/clipper-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          userQuery,
          videoTitle: title,
          duration,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '분석 실패');

      setClips(data.clips || []);
      addLog(`✅ ${data.clips.length}개 클립 구간 추천됨`);
      setStage('editing');

    } catch (e: any) {
      addLog(`⚠️ AI 분석 실패: ${e.message} — 수동으로 클립 구간을 입력해주세요.`);
      setClips([{ start: '00:00:00', end: '00:01:00', label: '클립 1' }]);
      setStage('editing');
    }
  };

  /* ── Step 4: 클립 추출 ────────────────────────────────────────────── */
  const handleClip = async () => {
    if (!downloadInfo || clips.length === 0) return;
    setStage('clipping');
    addLog(`✂️ ${clips.length}개 클립 추출 중...`);

    try {
      const res = await fetch('/api/youtube/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: downloadInfo.path,
          clips: clips.map(c => ({ start: c.start, end: c.end, label: c.label })),
          quality,
        }),
      });
      const data = await res.json();
      if (!data.ok && data.outputs?.length === 0) throw new Error(data.error || '추출 실패');

      setResults(data.outputs || []);
      addLog(`✅ ${data.success}/${data.total}개 클립 완료!`);
      setStage('done');

    } catch (e: any) {
      addLog(`❌ 클립 추출 실패: ${e.message}`);
      setStage('error');
    }
  };

  /* ── clip editor helpers ──────────────────────────────────────────── */
  const updateClip = (i: number, field: keyof ClipSpec, value: string) => {
    setClips(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };
  const removeClip = (i: number) => setClips(prev => prev.filter((_, idx) => idx !== i));
  const addClip = () => setClips(prev => [...prev, { start: '00:00:00', end: '00:01:00', label: `클립 ${prev.length + 1}` }]);

  const isLoading = ['downloading','fetching-transcript','analyzing','clipping'].includes(stage);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: [
          'radial-gradient(ellipse at 20% 15%, rgba(124,58,237,0.60) 0%, transparent 48%)',
          'radial-gradient(ellipse at 78% 22%, rgba(59,130,246,0.50) 0%, transparent 48%)',
          'radial-gradient(ellipse at 50% 88%, rgba(236,72,153,0.38) 0%, transparent 45%)',
          'linear-gradient(135deg, #0f0728 0%, #0d1b4b 100%)',
        ].join(','),
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 24, overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 860 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 20, fontWeight: 700, color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }}>
              ✂️ YouTube Clipper
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              URL 입력 → AI 클립 분석 → 자동 추출
            </p>
          </div>
          <button onClick={onClose} style={{ ...glass.btn('rgba(255,255,255,0.15)'), padding: '7px 18px', fontSize: 12 }}>
            닫기
          </button>
        </div>

        {/* URL Input Panel */}
        <div style={{ ...glass.panel, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading) handleDownload(); }}
              placeholder="YouTube URL 붙여넣기 (예: https://youtu.be/xxxxx)"
              style={{ ...glass.input, flex: 1, padding: '10px 14px', fontSize: 14 }}
              disabled={isLoading}
            />
            <button
              onClick={handleDownload}
              disabled={isLoading || !url.trim()}
              style={{
                ...glass.btn('linear-gradient(135deg,rgba(139,92,246,0.75),rgba(236,72,153,0.65))'),
                padding: '10px 22px', fontSize: 14, opacity: (isLoading || !url.trim()) ? 0.5 : 1,
              }}
            >
              {isLoading ? '처리 중...' : '시작'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 6 }}>
              클립 품질:
              <select
                value={quality}
                onChange={e => setQuality(e.target.value as any)}
                style={{ ...glass.input, fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}
              >
                <option value="copy">원본 복사 (빠름)</option>
                <option value="h264">H.264 재인코딩</option>
              </select>
            </label>
            <input
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              placeholder="AI에게 클립 요청 (예: 재미있는 장면만, 핵심 요약 3개)"
              style={{ ...glass.input, flex: 1, padding: '4px 10px', fontSize: 12 }}
            />
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div style={{ ...glass.panel, padding: 14, marginBottom: 16, maxHeight: 140, overflowY: 'auto' }}>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>{l}</div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.6)', borderTopColor: 'transparent',
                  animation: 'glSpin 0.75s linear infinite',
                }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>처리 중...</span>
              </div>
            )}
          </div>
        )}

        {/* Download info */}
        {downloadInfo && (
          <div style={{
            ...glass.panel, padding: '10px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 16 }}>🎬</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                {downloadInfo.title}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {Math.floor(downloadInfo.duration / 60)}분 {downloadInfo.duration % 60}초 · {downloadInfo.videoId}
              </div>
            </div>
          </div>
        )}

        {/* Clip Editor */}
        {stage === 'editing' || stage === 'done' ? (
          <div style={{ ...glass.panel, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                클립 구간 ({clips.length}개)
              </h3>
              <button onClick={addClip} style={{ ...glass.btn('rgba(20,184,166,0.50)'), padding: '5px 14px', fontSize: 12 }}>
                + 추가
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clips.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 12px',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', minWidth: 24, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                  <input
                    value={c.start} onChange={e => updateClip(i, 'start', e.target.value)}
                    placeholder="00:00:00"
                    style={{ ...glass.input, width: 80, padding: '5px 8px', fontSize: 13, textAlign: 'center' }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>→</span>
                  <input
                    value={c.end} onChange={e => updateClip(i, 'end', e.target.value)}
                    placeholder="00:01:00"
                    style={{ ...glass.input, width: 80, padding: '5px 8px', fontSize: 13, textAlign: 'center' }}
                  />
                  <input
                    value={c.label} onChange={e => updateClip(i, 'label', e.target.value)}
                    placeholder="클립 제목"
                    style={{ ...glass.input, flex: 1, padding: '5px 10px', fontSize: 13 }}
                  />
                  {c.reason && (
                    <span style={{ fontSize: 11, color: 'rgba(167,139,250,0.8)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.reason}
                    </span>
                  )}
                  <button
                    onClick={() => removeClip(i)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {stage === 'editing' && (
              <button
                onClick={handleClip}
                disabled={clips.length === 0}
                style={{
                  ...glass.btn('linear-gradient(135deg,rgba(16,185,129,0.70),rgba(20,184,166,0.60))'),
                  width: '100%', padding: '12px', fontSize: 14, marginTop: 16,
                  opacity: clips.length === 0 ? 0.4 : 1,
                }}
              >
                ✂️ {clips.length}개 클립 추출 시작
              </button>
            )}
          </div>
        ) : null}

        {/* Results */}
        {results.length > 0 && (
          <div style={{ ...glass.panel, padding: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
              ✅ 완료된 클립 ({results.length}개)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                      🎞 {r.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                      {formatBytes(r.size)}
                    </div>
                  </div>
                  <a
                    href={r.url}
                    download
                    style={{
                      ...glass.btn('linear-gradient(135deg,rgba(59,130,246,0.70),rgba(139,92,246,0.60))'),
                      padding: '7px 18px', fontSize: 12, textDecoration: 'none',
                      display: 'inline-block',
                    }}
                  >
                    ⬇ 다운로드
                  </a>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setStage('editing'); setResults([]); addLog('🔄 다시 추출 모드'); }}
              style={{ ...glass.btn('rgba(255,255,255,0.12)'), width: '100%', padding: '10px', fontSize: 13, marginTop: 14 }}
            >
              클립 편집 계속
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes glSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default YouTubeClipperChat;
