import { NextRequest } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export const maxDuration = 300;

// 동적 import — 서버 사이드에서만 사용
async function getRemotionModules() {
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  return { bundle, renderMedia, selectComposition };
}

// 번들 캐시 (warm: 10분 유효)
let cachedBundle: { location: string; ts: number } | null = null;
const BUNDLE_TTL_MS = 10 * 60 * 1000;

async function getBundle(): Promise<string> {
  if (cachedBundle && Date.now() - cachedBundle.ts < BUNDLE_TTL_MS) {
    return cachedBundle.location;
  }
  const { bundle } = await getRemotionModules();
  const entryPoint = path.join(process.cwd(), 'remotion', 'index.ts');
  const location = await bundle({ entryPoint });
  cachedBundle = { location, ts: Date.now() };
  return location;
}

// base64 → 임시 파일 저장 후 경로 반환
function saveTempFile(base64: string, ext: string, tmpDir: string): string {
  const data = base64.startsWith('data:')
    ? base64.split(',')[1]
    : base64;
  const filePath = path.join(tmpDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  return filePath;
}

export async function POST(req: NextRequest) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remotion-'));
  const tempFiles: string[] = [];

  try {
    const body = await req.json();
    const { scenes, fps = 30, width = 1280, height = 720 } = body;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return Response.json({ error: 'scenes 배열이 필요합니다.' }, { status: 400 });
    }

    // base64 데이터를 임시 파일로 변환 (Remotion 렌더러는 파일 경로 필요)
    const resolvedScenes = scenes.map((scene: any) => {
      let imageSrc = scene.imageSrc || '';
      let audioSrc = scene.audioSrc || '';

      if (imageSrc.startsWith('data:')) {
        const ext = imageSrc.includes('png') ? 'png' : 'jpg';
        const p = saveTempFile(imageSrc, ext, tmpDir);
        tempFiles.push(p);
        imageSrc = p;
      }
      if (audioSrc.startsWith('data:')) {
        const p = saveTempFile(audioSrc, 'mp3', tmpDir);
        tempFiles.push(p);
        audioSrc = p;
      }

      return { ...scene, imageSrc, audioSrc };
    });

    const inputProps = { scenes: resolvedScenes, fps, width, height };
    const totalFrames = resolvedScenes.reduce((s: number, sc: any) => s + sc.durationInFrames, 0);

    const { renderMedia, selectComposition } = await getRemotionModules();
    const bundleLocation = await getBundle();

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'StoryboardVideo',
      inputProps,
    });

    const outputPath = path.join(tmpDir, `render_${Date.now()}.mp4`);
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
    });

    const videoBuffer = fs.readFileSync(outputPath);
    const base64Video = videoBuffer.toString('base64');

    return Response.json({ ok: true, videoBase64: base64Video, totalFrames, fps });

  } catch (e: any) {
    console.error('[Render API]', e);
    return Response.json({ error: e.message }, { status: 500 });
  } finally {
    // 임시 파일 정리
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
