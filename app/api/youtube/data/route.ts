import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const TAPI_BASE = 'https://transcriptapi.com';

// ── URL parsers ───────────────────────────────────────────────────────────────

const VIDEO_RE = [
  /youtube\.com\/watch\?[^"'\s]*v=([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
];
const CHANNEL_RE  = /(?:youtube\.com\/)?(@[a-zA-Z0-9_.-]{2,})|youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/;
const PLAYLIST_RE = /[?&]list=([a-zA-Z0-9_-]+)/;

function extractVideoId(text: string): string | null {
  for (const p of VIDEO_RE) { const m = text.match(p); if (m) return m[1]; }
  return null;
}
function extractChannel(text: string): string | null {
  const m = text.match(CHANNEL_RE); return m ? (m[1] || m[2]) : null;
}
function extractPlaylist(text: string): string | null {
  const m = text.match(PLAYLIST_RE); return m ? m[1] : null;
}

// ── TranscriptAPI.com helper ──────────────────────────────────────────────────

async function tapi(endpoint: string, params: Record<string, string>): Promise<any> {
  const key = process.env.TRANSCRIPT_API_KEY;
  if (!key) return { _error: 'TRANSCRIPT_API_KEY가 .env.local에 설정되지 않았습니다. transcriptapi.com에서 무료 키를 발급받아 설정해주세요.' };

  const url = new URL(`${TAPI_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${key}`, 'User-Agent': 'TubeGen/1.0' },
    });
    if (!res.ok) {
      const msgs: Record<number, string> = {
        401: 'API 키가 유효하지 않습니다.',
        402: '크레딧이 부족합니다. transcriptapi.com/billing에서 충전해주세요.',
        403: 'Cloudflare 차단 — User-Agent 헤더 문제입니다.',
        404: '자막/데이터를 찾을 수 없습니다. (자막 없는 영상이거나 비공개일 수 있습니다)',
        408: '요청 시간 초과. 다시 시도해주세요.',
        429: '요청이 너무 많습니다. 잠시 후 재시도해주세요.',
      };
      return { _error: msgs[res.status] ?? `API 오류 (${res.status})` };
    }
    return await res.json();
  } catch (e: any) {
    return { _error: `네트워크 오류: ${e.message}` };
  }
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchTranscript(videoId: string, format: 'text' | 'json' = 'text'): Promise<string> {
  const data = await tapi('/api/v2/youtube/transcript', {
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    format,
    include_timestamp: 'true',
    send_metadata: 'true',
  });
  if (data._error) return `[오류] ${data._error}`;

  const meta = data.metadata ?? {};
  const header = `제목: ${meta.title ?? '—'}\n채널: ${meta.author_name ?? '—'}\n언어: ${data.language ?? '—'}\n영상 ID: ${data.video_id}\n`;

  if (format === 'json' && Array.isArray(data.transcript)) {
    const lines = (data.transcript as any[])
      .slice(0, 200)
      .map(t => `[${Math.floor(t.start / 60)}:${String(Math.floor(t.start % 60)).padStart(2, '0')}] ${t.text}`)
      .join('\n');
    return `[영상 자막 데이터]\n${header}\n자막:\n${lines}`;
  }
  return `[영상 자막 데이터]\n${header}\n자막:\n${data.transcript ?? ''}`;
}

async function fetchChannelLatest(channel: string): Promise<string> {
  const data = await tapi('/api/v2/youtube/channel/latest', { channel });
  if (data._error) return `[오류] ${data._error}`;

  const ch = data.channel ?? {};
  const rows = (data.results as any[] ?? []).map(v =>
    `- ${v.title}\n  조회수: ${(v.viewCount ?? 0).toLocaleString()} | 게시일: ${(v.published ?? '').slice(0, 10)} | ID: ${v.videoId}`
  ).join('\n');
  return `[채널 최신 영상]\n채널: ${ch.title ?? channel}\n구독자: ${ch.subscriberCount ?? '—'}\n\n${rows}`;
}

async function fetchSearch(query: string): Promise<string> {
  const data = await tapi('/api/v2/youtube/search', { q: query, type: 'video', limit: '10' });
  if (data._error) return `[오류] ${data._error}`;

  const rows = (data.results as any[] ?? []).map(v =>
    `- ${v.title}\n  채널: ${v.channelTitle} | 조회수: ${v.viewCountText ?? ''} | 게시일: ${v.publishedTimeText ?? ''}\n  URL: https://youtube.com/watch?v=${v.videoId}`
  ).join('\n\n');
  return `[검색 결과: "${query}"]\n\n${rows}`;
}

async function fetchPlaylist(playlistId: string): Promise<string> {
  const data = await tapi('/api/v2/youtube/playlist/videos', { playlist: playlistId });
  if (data._error) return `[오류] ${data._error}`;

  const info = data.playlist_info ?? {};
  const rows = (data.results as any[] ?? []).slice(0, 30).map(v => `- ${v.title} (${v.videoId})`).join('\n');
  return `[플레이리스트: ${info.title ?? playlistId}]\n영상 수: ${info.numVideos ?? '—'} | 제작자: ${info.ownerName ?? '—'}\n\n${rows}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { skillType, messages } = await req.json();
    if (!skillType || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUser) return new Response(JSON.stringify({ error: 'No user message' }), { status: 400 });

    const text: string = lastUser.content;

    // Detect what to fetch from the latest user message
    let fetchedContext = '';

    const videoId  = extractVideoId(text);
    const channel  = extractChannel(text);
    const playlist = extractPlaylist(text);

    if (skillType === 'transcript') {
      if (videoId) {
        fetchedContext = await fetchTranscript(videoId, 'text');
      }
    } else {
      // youtube-data: priority order: video > playlist > channel > search
      if (videoId) {
        fetchedContext = await fetchTranscript(videoId, 'json');
      } else if (playlist) {
        fetchedContext = await fetchPlaylist(playlist);
      } else if (channel) {
        fetchedContext = await fetchChannelLatest(channel);
      } else if (text.trim().length >= 2 && messages.filter((m: any) => m.role === 'user').length === 1) {
        // First user message with no URL → treat as search query
        fetchedContext = await fetchSearch(text.trim());
      }
    }

    const systemInstruction = skillType === 'transcript'
      ? `당신은 YouTube 자막 분석 전문가입니다. 사용자가 제공한 YouTube URL의 자막을 분석합니다.
가능한 작업: 요약, 핵심 인용구 추출, 번역, 팩트체크, 타임스탬프 챕터 생성, 특정 내용 검색.
사용자가 쓴 언어로 응답하세요 (한국어 ↔ 영어). 마크다운 헤더·불릿·표를 사용해 명확하게 작성하세요.
${fetchedContext ? `\n## 조회된 데이터\n${fetchedContext}` : '\nURL이 없으면 YouTube 영상 URL을 붙여달라고 안내하세요.'}`
      : `당신은 YouTube 데이터 분석 전문가입니다. TranscriptAPI.com으로 영상·채널·검색·플레이리스트 데이터를 조회하고 분석합니다.
사용자가 쓴 언어로 응답하세요 (한국어 ↔ 영어). 마크다운 헤더·불릿·표를 사용해 명확하게 작성하세요.
${fetchedContext ? `\n## 조회된 데이터\n${fetchedContext}` : '\nURL/검색어가 없으면 YouTube URL, @채널핸들, 또는 검색어를 입력해달라고 안내하세요.'}`;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const contents = messages
      .filter((_: any, i: number) => !(i === 0 && messages[0]?.role === 'assistant'))
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    if (contents.length === 0) {
      return new Response(JSON.stringify({ error: 'No user messages' }), { status: 400 });
    }

    const streamResult = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents,
      config: { systemInstruction, maxOutputTokens: 8192, temperature: 0.7 },
    });

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const chunk of streamResult) {
            const t = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (t) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: t })}\n\n`));
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (e: any) {
    console.error('[YouTube Data API]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
