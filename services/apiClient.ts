/**
 * 클라이언트 사이드 API 래퍼
 * - 브라우저에서 /api/* 라우트를 호출
 * - AI API 키는 서버 환경변수에서 관리 (클라이언트에 노출 안 됨)
 */

import type { ScriptScene, ReferenceImages } from '@/types';
import type { ElevenLabsResult, ElevenLabsVoice } from '@/services/elevenLabsService';
import type { ElevenLabsModelId, ImageModelId } from '@/config';
import { getGeminiStylePrompt, getSelectedImageModel } from '@/services/imageConfig';

function parseApiError(raw: unknown): string {
  // raw는 문자열 JSON이거나 객체일 수 있음
  const toMsg = (v: unknown): string => {
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return toMsg(parsed);
      } catch {
        return v;
      }
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return toMsg(o.message ?? o.error ?? o.detail ?? JSON.stringify(v));
    }
    return String(v ?? '알 수 없는 오류');
  };

  const msg = toMsg(raw);

  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('rate limit')) {
    return 'API 할당량 초과. 잠시 후 다시 시도해주세요. (Gemini 무료 플랜 한도)';
  }
  if (msg.includes('SAFETY') || msg.includes('safety') || msg.includes('blocked')) {
    return '이미지 안전 필터에 걸렸습니다. 다시 시도해주세요.';
  }
  if (msg.includes('payment_required') || msg.includes('paid_plan')) {
    return 'ElevenLabs 유료 플랜이 필요합니다.';
  }
  if (msg.includes('missing_permissions') || msg.includes('permission')) {
    return 'API 키 권한이 부족합니다. 키 설정을 확인해주세요.';
  }
  // 너무 긴 메시지는 앞부분만
  return msg.length > 120 ? msg.slice(0, 120) + '...' : msg;
}

async function apiFetch<T>(url: string, body?: object): Promise<T> {
  const res = await fetch(url, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parseApiError(err.error ?? err));
  }
  return res.json() as Promise<T>;
}

// ─── Gemini ────────────────────────────────────────────────────────────────

export const findTrendingTopics = async (
  category: string,
  usedTopics: string[]
): Promise<any[]> => {
  return apiFetch('/api/gemini/trends', { category, usedTopics });
};

export const generateScript = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext?: string | null
): Promise<ScriptScene[]> => {
  return apiFetch('/api/gemini/script', { topic, hasReferenceImage, sourceContext });
};

export const generateScriptChunked = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext: string,
  chunkSize: number = 2500,
  onProgress?: (message: string) => void
): Promise<ScriptScene[]> => {
  // HTTP는 mid-response 콜백을 지원하지 않으므로 제네릭 메시지 사용
  onProgress?.('스토리보드 생성 중... (대본이 길어 시간이 걸릴 수 있습니다)');
  return apiFetch('/api/gemini/script-chunked', { topic, hasReferenceImage, sourceContext, chunkSize });
};

export const generateAudioForScene = async (text: string): Promise<string | null> => {
  const { audioData } = await apiFetch<{ audioData: string | null }>('/api/gemini/audio', { text });
  return audioData;
};

export const generateMotionPrompt = async (
  narration: string,
  visualPrompt: string
): Promise<string> => {
  const { motionPrompt } = await apiFetch<{ motionPrompt: string }>(
    '/api/gemini/motion',
    { narration, visualPrompt }
  );
  return motionPrompt;
};

/**
 * 이미지 생성 - 선택된 모델에 따라 적합한 API 엔드포인트로 라우팅
 */
export const generateImage = async (
  scene: ScriptScene,
  referenceImages: ReferenceImages
): Promise<string | null> => {
  const modelId = getSelectedImageModel();
  const stylePrompt = getGeminiStylePrompt();

  if (modelId === 'dall-e-3') {
    const { imageData } = await apiFetch<{ imageData: string | null }>(
      '/api/openai/image',
      { prompt: scene.visualPrompt, stylePrompt }
    );
    return imageData;
  }

  if (modelId.startsWith('fal-')) {
    const { imageData } = await apiFetch<{ imageData: string | null }>(
      '/api/fal/image',
      { prompt: scene.visualPrompt, stylePrompt, modelId }
    );
    return imageData;
  }

  // 기본: Gemini (참조 이미지 지원) — 모델 ID 전달
  const { imageData } = await apiFetch<{ imageData: string | null }>(
    '/api/gemini/image',
    { scene, referenceImages, stylePrompt, imageModelId: modelId }
  );
  return imageData;
};

// ─── ElevenLabs ────────────────────────────────────────────────────────────

export const generateAudioWithElevenLabs = async (
  text: string,
  _apiKey?: string,           // 서버에서 env var 사용 (무시됨)
  voiceId?: string,
  modelId?: ElevenLabsModelId
): Promise<ElevenLabsResult> => {
  return apiFetch('/api/elevenlabs/tts', { text, voiceId, modelId });
};

export const fetchElevenLabsVoices = async (
  _apiKey?: string            // 서버에서 env var 사용 (무시됨)
): Promise<ElevenLabsVoice[]> => {
  return apiFetch<ElevenLabsVoice[]>('/api/elevenlabs/voices');
};

// ─── FAL (PixVerse) ────────────────────────────────────────────────────────

export const generateVideoFromImage = async (
  imageBase64: string,
  motionPrompt: string,
  _apiKey?: string            // 서버에서 env var 사용 (무시됨)
): Promise<string | null> => {
  const { videoUrl } = await apiFetch<{ videoUrl: string | null }>(
    '/api/fal/video',
    { imageBase64, motionPrompt }
  );
  return videoUrl;
};
