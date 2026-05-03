import type { GeneratedAsset } from '../types';
import type { RemotionVideoProps, RemotionScene, RemotionSubtitle } from '../remotion/types';

const FPS = 30;
const DEFAULT_SCENE_DURATION_S = 4;

function toSrc(base64: string, mimeHint: 'image' | 'audio'): string {
  if (!base64) return '';
  if (base64.startsWith('data:') || base64.startsWith('http') || base64.startsWith('/')) {
    return base64;
  }
  const mime = mimeHint === 'image' ? 'image/png' : 'audio/mpeg';
  return `data:${mime};base64,${base64}`;
}

function durationToFrames(durationSec: number | null): number {
  const d = durationSec && durationSec > 0 ? durationSec : DEFAULT_SCENE_DURATION_S;
  return Math.round(d * FPS);
}

function buildSubtitles(asset: GeneratedAsset): RemotionSubtitle[] {
  const sub = asset.subtitleData;
  if (!sub) return [];

  // AI 의미 단위 청크 우선, 없으면 단어 기반
  const chunks = sub.meaningChunks && sub.meaningChunks.length > 0
    ? sub.meaningChunks.map(c => ({ text: c.text, startTime: c.startTime, endTime: c.endTime }))
    : (() => {
        const result: Array<{ text: string; startTime: number; endTime: number }> = [];
        const words = sub.words;
        const WORDS_PER_CHUNK = 5;
        for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
          const slice = words.slice(i, i + WORDS_PER_CHUNK);
          if (slice.length === 0) continue;
          result.push({
            text: slice.map(w => w.word).join(' '),
            startTime: slice[0].start,
            endTime: slice[slice.length - 1].end,
          });
        }
        return result;
      })();

  return chunks.map(c => ({
    text: c.text,
    startFrame: Math.round(c.startTime * FPS),
    endFrame: Math.round(c.endTime * FPS),
  }));
}

export function assetsToRemotionProps(
  assets: GeneratedAsset[],
  opts?: { width?: number; height?: number }
): RemotionVideoProps {
  const width = opts?.width ?? 1280;
  const height = opts?.height ?? 720;

  const scenes: RemotionScene[] = assets
    .filter(a => a.status === 'completed' && (a.imageData || a.videoData))
    .map(asset => ({
      imageSrc: asset.imageData ? toSrc(asset.imageData, 'image') : '',
      audioSrc: asset.audioData ? toSrc(asset.audioData, 'audio') : '',
      videoSrc: asset.videoData ?? undefined,
      durationInFrames: durationToFrames(asset.audioDuration),
      subtitles: buildSubtitles(asset),
    }));

  return { scenes, fps: FPS, width, height };
}

export function totalDurationSec(props: RemotionVideoProps): number {
  return props.scenes.reduce((sum, s) => sum + s.durationInFrames / props.fps, 0);
}
