import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DOWNLOAD_DIR = '/tmp/tubegen';

function sanitizeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ['youtube.com', 'youtu.be', 'www.youtube.com'].some(h => u.hostname.endsWith(h));
  } catch { return false; }
}

type SSEMsg = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string };

  if (!url || !sanitizeUrl(url)) {
    return Response.json({ error: '유효한 YouTube URL이 필요합니다.' }, { status: 400 });
  }

  const enc = new TextEncoder();
  const send = (data: SSEMsg) => enc.encode(`data: ${JSON.stringify(data)}\n\n`);

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const stream = new ReadableStream({
    start(ctrl) {
      (async () => {
        try {
          // ── 1. 영상 정보 ─────────────────────────────────────────────────────
          ctrl.enqueue(send({ type: 'progress', pct: 2, msg: '영상 정보 조회 중...' }));

          const info = await new Promise<{ ok: boolean; out: string; err: string }>(res => {
            const p = spawn('yt-dlp', ['--print', '%(id)s|||%(title)s|||%(duration)s', '--no-playlist', url]);
            let out = '', err = '';
            p.stdout.on('data', d => out += d);
            p.stderr.on('data', d => err += d);
            p.on('close', c => res({ ok: c === 0, out, err }));
            p.on('error', e => res({ ok: false, out: '', err: e.message }));
          });

          if (!info.ok) {
            ctrl.enqueue(send({ type: 'error', msg: `정보 조회 실패: ${info.err.slice(-200)}` }));
            ctrl.close(); return;
          }

          const [videoId = 'unknown', title = 'video', durStr = '0'] = info.out.trim().split('|||');
          const duration = Number(durStr.trim());
          const safeName = title.trim().replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 60).replace(/\s+/g, '_');
          const outputPath = path.join(DOWNLOAD_DIR, `${videoId.trim()}_${safeName}.mp4`);

          // ── 2. 캐시 확인 ─────────────────────────────────────────────────────
          if (fs.existsSync(outputPath)) {
            const srtFiles = fs.readdirSync(DOWNLOAD_DIR)
              .filter(f => f.startsWith(videoId.trim()) && f.endsWith('.srt'))
              .map(f => path.join(DOWNLOAD_DIR, f));
            ctrl.enqueue(send({ type: 'done', cached: true, path: outputPath, title: title.trim(), videoId: videoId.trim(), duration, srtFiles }));
            ctrl.close(); return;
          }

          ctrl.enqueue(send({ type: 'progress', pct: 5, msg: `다운로드 시작: ${title.trim()}` }));

          // ── 3. 다운로드 ──────────────────────────────────────────────────────
          await new Promise<void>((resolve, reject) => {
            const p = spawn('yt-dlp', [
              '-f', 'best[height<=1080]',
              '--merge-output-format', 'mp4',
              '--write-sub', '--write-auto-sub',
              '--sub-lang', 'ko,en',
              '--convert-subs', 'srt',
              '--newline',
              '-o', outputPath,
              '--no-playlist',
              url,
            ]);

            p.stdout.on('data', d => {
              const line = d.toString().trim();
              const pct = line.match(/(\d+\.?\d*)%/)?.[1];
              if (pct) {
                ctrl.enqueue(send({ type: 'progress', pct: Math.min(95, 5 + parseFloat(pct) * 0.9), msg: `다운로드 중: ${pct}%` }));
              }
            });
            p.stderr.on('data', () => { /* suppress */ });
            p.on('close', c => c === 0 ? resolve() : reject(new Error(`yt-dlp 오류 코드 ${c}`)));
            p.on('error', reject);
          });

          if (!fs.existsSync(outputPath)) {
            ctrl.enqueue(send({ type: 'error', msg: '다운로드된 파일을 찾을 수 없습니다.' }));
            ctrl.close(); return;
          }

          const size = fs.statSync(outputPath).size;
          const srtFiles = fs.readdirSync(DOWNLOAD_DIR)
            .filter(f => f.startsWith(videoId.trim()) && f.endsWith('.srt'))
            .map(f => path.join(DOWNLOAD_DIR, f));

          ctrl.enqueue(send({ type: 'done', cached: false, path: outputPath, title: title.trim(), videoId: videoId.trim(), duration, size, srtFiles }));

        } catch (e: any) {
          ctrl.enqueue(send({ type: 'error', msg: e?.message ?? String(e) }));
        }
        ctrl.close();
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':   'text/event-stream',
      'Cache-Control':  'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
