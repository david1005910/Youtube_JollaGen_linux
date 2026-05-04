import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const maxDuration = 300;

const DOWNLOAD_DIR = '/tmp/tubegen';

function sanitizeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ['youtube.com', 'youtu.be', 'www.youtube.com'].some(h => u.hostname.endsWith(h));
  } catch { return false; }
}

function runYtDlp(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const proc = spawn('yt-dlp', args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => resolve({ ok: code === 0, stdout, stderr }));
    proc.on('error', e => resolve({ ok: false, stdout, stderr: e.message }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { url, quality = 'best[height<=1080]' } = await req.json();

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'url이 필요합니다.' }, { status: 400 });
    }
    if (!sanitizeUrl(url)) {
      return Response.json({ error: 'YouTube URL만 허용됩니다.' }, { status: 400 });
    }

    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    // 파일명 사전 조회
    const infoResult = await runYtDlp([
      '--print', '%(id)s|||%(title)s|||%(duration)s',
      '--no-playlist', url,
    ]);
    if (!infoResult.ok) {
      return Response.json({ error: `영상 정보 조회 실패: ${infoResult.stderr.slice(-300)}` }, { status: 500 });
    }

    const parts = infoResult.stdout.trim().split('|||');
    const videoId = parts[0]?.trim() || 'unknown';
    const title   = parts[1]?.trim() || videoId;
    const duration = Number(parts[2]?.trim() || 0);

    const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 60).replace(/\s+/g, '_');
    const outputPath = path.join(DOWNLOAD_DIR, `${videoId}_${safeName}.mp4`);

    // 이미 다운로드됐으면 바로 반환
    if (fs.existsSync(outputPath)) {
      return Response.json({
        ok: true, cached: true,
        path: outputPath, title, videoId, duration,
      });
    }

    const dlResult = await runYtDlp([
      '-f', quality,
      '--merge-output-format', 'mp4',
      '--write-sub', '--write-auto-sub',
      '--sub-lang', 'ko,en',
      '--convert-subs', 'srt',
      '-o', outputPath,
      '--no-playlist',
      url,
    ]);

    if (!dlResult.ok || !fs.existsSync(outputPath)) {
      return Response.json({
        error: `다운로드 실패: ${dlResult.stderr.slice(-400)}`,
      }, { status: 500 });
    }

    const size = fs.statSync(outputPath).size;

    // 자막 파일 찾기
    const srtFiles = fs.readdirSync(DOWNLOAD_DIR)
      .filter(f => f.startsWith(videoId) && f.endsWith('.srt'))
      .map(f => path.join(DOWNLOAD_DIR, f));

    return Response.json({
      ok: true, cached: false,
      path: outputPath, title, videoId, duration, size,
      srtFiles,
    });

  } catch (e: any) {
    console.error('[Download API]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
