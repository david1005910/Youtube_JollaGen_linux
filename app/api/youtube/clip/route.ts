import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const maxDuration = 300;

// 허용 출력 디렉토리 (경로 탐색 공격 방지)
const CLIP_OUTPUT_DIR = path.join(process.cwd(), 'public', 'clips');

interface ClipRequest {
  inputPath: string;        // /tmp/tubegen/*.mp4 또는 public/clips/source.mp4
  clips: Array<{
    start:    string | number;  // "00:01:30" 또는 초
    end:      string | number;
    label?:   string;
    subtitle?: string;          // SRT 파일 경로 (선택)
  }>;
  quality?:       'copy' | 'h264' | 'h265' | 'vaapi' | 'cuda' | 'auto';
  crf?:           number;
  threads?:       number;
  subtitleStyle?: 'default' | 'shorts' | 'caption';
}

function safePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const allowed = ['/tmp/tubegen', CLIP_OUTPUT_DIR, path.join(process.cwd(), 'public')];
  if (!allowed.some(dir => resolved.startsWith(dir))) {
    throw new Error(`허용되지 않은 경로: ${inputPath}`);
  }
  return resolved;
}

function runClipper(batchJson: object): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'video_clipper.py');

    // 배치 JSON 임시 파일에 저장
    const tmpDir  = '/tmp/tubegen';
    fs.mkdirSync(tmpDir, { recursive: true });
    const batchFile = path.join(tmpDir, `batch_${Date.now()}.json`);
    fs.writeFileSync(batchFile, JSON.stringify(batchJson));

    const proc = spawn('python3', [scriptPath, '--batch', batchFile]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code) => {
      fs.unlinkSync(batchFile);
      resolve({ ok: code === 0, stdout, stderr });
    });

    proc.on('error', (e) => {
      resolve({ ok: false, stdout, stderr: e.message });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: ClipRequest = await req.json();

    if (!body.inputPath || !Array.isArray(body.clips) || body.clips.length === 0) {
      return Response.json({ error: 'inputPath과 clips 배열이 필요합니다.' }, { status: 400 });
    }

    // 경로 검증
    let safeInput: string;
    try {
      safeInput = safePath(body.inputPath);
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    if (!fs.existsSync(safeInput)) {
      return Response.json({ error: `입력 파일 없음: ${safeInput}` }, { status: 404 });
    }

    // 출력 디렉토리 준비
    fs.mkdirSync(CLIP_OUTPUT_DIR, { recursive: true });

    const timestamp = Date.now();
    const clipsSpec = body.clips.map((clip, i) => {
      const label    = clip.label || `clip_${i + 1}`;
      const safeName = label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 60);
      return {
        input:    safeInput,
        start:    clip.start,
        end:      clip.end,
        output:   path.join(CLIP_OUTPUT_DIR, `${safeName}_${timestamp}.mp4`),
        subtitle: clip.subtitle,
        label,
      };
    });

    const batchJson = {
      options: {
        quality:        body.quality       || 'copy',
        crf:            body.crf           ?? 23,
        threads:        body.threads       ?? 0,
        subtitle_style: body.subtitleStyle || 'default',
      },
      clips: clipsSpec,
    };

    const { ok, stdout, stderr } = await runClipper(batchJson);

    // 생성된 파일 목록 수집
    const outputs = clipsSpec
      .filter(c => fs.existsSync(c.output))
      .map(c => ({
        label:   c.label,
        url:     `/clips/${path.basename(c.output)}`,
        size:    fs.statSync(c.output).size,
      }));

    return Response.json({
      ok,
      outputs,
      total:   body.clips.length,
      success: outputs.length,
      log:     stdout.slice(-2000),
      ...(ok ? {} : { error: stderr.slice(-500) }),
    });

  } catch (e: any) {
    console.error('[Clip API]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
