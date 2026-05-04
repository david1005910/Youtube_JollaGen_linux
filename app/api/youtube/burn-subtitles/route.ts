import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const maxDuration = 300;

const ALLOWED_DIRS = ['/tmp/tubegen', path.join(process.cwd(), 'public')];
const OUTPUT_DIR   = path.join(process.cwd(), 'public', 'clips');

interface SrtLine { index: number; startStr: string; endStr: string; text: string; }

interface BurnRequest {
  videoPath: string;
  srtEntries: SrtLine[];
  outputName?: string;
  style?: {
    fontSize?: number;
    fontColor?: string;     // hex without #
    bgColor?: string;       // hex without #
    bgOpacity?: number;     // 0-255
    position?: 'bottom' | 'center' | 'top';
    bold?: boolean;
  };
}

function safePath(p: string): string {
  const r = path.resolve(p);
  if (!ALLOWED_DIRS.some(d => r.startsWith(d))) throw new Error('허용되지 않은 경로');
  return r;
}

function runFFmpeg(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise(resolve => {
    const p = spawn('ffmpeg', args);
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', c => resolve({ ok: c === 0, stderr }));
    p.on('error', e => resolve({ ok: false, stderr: e.message }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: BurnRequest = await req.json();

    let videoPath: string;
    try { videoPath = safePath(body.videoPath); }
    catch { return Response.json({ error: '잘못된 영상 경로' }, { status: 400 }); }

    if (!fs.existsSync(videoPath)) {
      return Response.json({ error: '영상 파일이 존재하지 않습니다.' }, { status: 404 });
    }
    if (!Array.isArray(body.srtEntries) || body.srtEntries.length === 0) {
      return Response.json({ error: 'srtEntries 배열이 필요합니다.' }, { status: 400 });
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 임시 SRT 파일 생성
    const tmpSrt = `/tmp/tubegen/burn_${Date.now()}.srt`;
    const srtContent = body.srtEntries.map(e =>
      `${e.index}\n${e.startStr} --> ${e.endStr}\n${e.text}\n`
    ).join('\n');
    fs.writeFileSync(tmpSrt, srtContent, 'utf-8');

    const outName = (body.outputName || `burned_${Date.now()}.mp4`)
      .replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const outputPath = path.join(OUTPUT_DIR, outName);

    // ASS force_style 빌드 (FFmpeg libass 스타일)
    const s = body.style ?? {};
    const fontSize  = s.fontSize  ?? 28;
    const fontColor = (s.fontColor ?? 'ffffff').padStart(6, '0');
    const bgColor   = (s.bgColor   ?? '000000').padStart(6, '0');
    const bgOpacity = (s.bgOpacity ?? 160).toString(16).padStart(2, '0');
    const alignment = s.position === 'top' ? 8 : s.position === 'center' ? 5 : 2;

    // ASS 색상 형식: &HAABBGGRR (alpha, blue, green, red)
    const assTextColor = `&H00${fontColor.slice(4, 6)}${fontColor.slice(2, 4)}${fontColor.slice(0, 2)}&`;
    const assBackColor = `&H${bgOpacity}${bgColor.slice(4, 6)}${bgColor.slice(2, 4)}${bgColor.slice(0, 2)}&`;

    const forceStyle = [
      `Fontsize=${fontSize}`,
      `Bold=${s.bold ? '1' : '0'}`,
      `PrimaryColour=${assTextColor}`,
      `BackColour=${assBackColor}`,
      `BorderStyle=4`,       // opaque box background
      `Outline=0`,
      `Shadow=0`,
      `Alignment=${alignment}`,
      `MarginV=30`,
    ].join(',');

    // FFmpeg 서브타이틀 필터 — 경로의 특수문자 이스케이프
    const escapedSrt = tmpSrt.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
    const vf = `subtitles='${escapedSrt}':force_style='${forceStyle}'`;

    const { ok, stderr } = await runFFmpeg([
      '-y', '-i', videoPath,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'copy',
      outputPath,
    ]);

    fs.existsSync(tmpSrt) && fs.unlinkSync(tmpSrt);

    if (!ok || !fs.existsSync(outputPath)) {
      return Response.json({ error: `FFmpeg 실패: ${stderr.slice(-500)}` }, { status: 500 });
    }

    return Response.json({
      ok: true,
      url: `/clips/${path.basename(outputPath)}`,
      size: fs.statSync(outputPath).size,
    });

  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
