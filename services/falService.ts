
/**
 * fal.ai API 서비스
 * - Veo 3 이미지→영상 변환 (~$0.50/영상, 8초)
 */

import { CONFIG } from '../config';

interface VideoResponse {
  video: {
    url: string;
  };
  seed?: number;
}

/**
 * FAL API 키 가져오기 (환경변수 우선)
 */
export function getFalApiKey(): string | null {
  return process.env.FAL_API_KEY || localStorage.getItem(CONFIG.STORAGE_KEYS.FAL_API_KEY);
}

/**
 * FAL API 키 저장 (localStorage에 백업)
 */
export function setFalApiKey(key: string): void {
  localStorage.setItem(CONFIG.STORAGE_KEYS.FAL_API_KEY, key);
}

/**
 * base64 이미지를 URL로 변환 (fal.ai는 URL 필요)
 */
function base64ToDataUrl(base64: string, mimeType: string = 'image/png'): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * base64를 Uint8Array로 변환 (Node.js / 브라우저 양쪽 호환)
 */
function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    // Node.js 환경 (API Route)
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // 브라우저 환경
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * 이미지를 영상으로 변환 (Google Veo 3)
 *
 * @param imageBase64 - base64 인코딩된 이미지
 * @param motionPrompt - 움직임을 설명하는 프롬프트
 * @param apiKey - FAL API 키 (선택, 없으면 환경변수에서 가져옴)
 * @returns 생성된 영상 URL 또는 null
 */
export async function generateVideoFromImage(
  imageBase64: string,
  motionPrompt: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey || getFalApiKey();

  if (!key) {
    console.warn('[FAL] API 키가 설정되지 않았습니다.');
    return null;
  }

  try {
    // base64를 Blob으로 변환 후 fal.ai에 업로드
    const imageUrl = await uploadImageToFal(imageBase64, key);

    if (!imageUrl) {
      console.warn('[FAL] 이미지 업로드 실패');
      return null;
    }

    console.log(`[FAL] Veo 3 영상 생성 시작: "${motionPrompt.slice(0, 50)}..."`);

    const requestBody = {
      prompt: motionPrompt,
      image_url: imageUrl,
      duration: '8s',
      aspect_ratio: '16:9',
      resolution: '720p',
      generate_audio: false,
      safety_tolerance: '4',
    };

    const response = await fetch('https://fal.run/fal-ai/veo3/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[FAL] Veo3 API 오류 (${response.status}):`, errorText);
      throw new Error(`FAL API 오류: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const result: VideoResponse = await response.json();
    console.log(`[FAL] Veo 3 영상 생성 완료: ${result.video.url}`);

    return result.video.url;

  } catch (error: any) {
    console.warn('[FAL] 영상 생성 실패:', error.message);
    return null;
  }
}

/**
 * base64 이미지를 fal.ai 스토리지에 업로드
 */
async function uploadImageToFal(imageBase64: string, apiKey: string): Promise<string | null> {
  try {
    // base64를 Blob으로 변환 (Node.js / 브라우저 양쪽 호환)
    const bytes = base64ToBytes(imageBase64);
    const blob = new Blob([bytes], { type: 'image/png' });

    // fal.ai 파일 업로드 엔드포인트
    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    const uploadResponse = await fetch('https://fal.run/fal-ai/storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      // 업로드 실패 시 data URL 폴백 시도
      console.warn('[FAL] 파일 업로드 실패, data URL 사용 시도');
      return base64ToDataUrl(imageBase64);
    }

    const uploadResult = await uploadResponse.json();
    return uploadResult.url;

  } catch (error) {
    console.warn('[FAL] 이미지 업로드 실패, data URL 사용');
    return base64ToDataUrl(imageBase64);
  }
}

/**
 * 영상 URL에서 base64 데이터로 변환 (로컬 저장용)
 */
export async function fetchVideoAsBase64(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 여러 이미지를 순차적으로 영상 변환 (rate limit 고려)
 */
export async function batchGenerateVideos(
  assets: Array<{ imageData: string; visualPrompt: string }>,
  apiKey?: string,
  onProgress?: (index: number, total: number) => void
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  const key = apiKey || getFalApiKey();

  for (let i = 0; i < assets.length; i++) {
    onProgress?.(i + 1, assets.length);

    const videoUrl = await generateVideoFromImage(
      assets[i].imageData,
      assets[i].visualPrompt,
      key
    );
    results.push(videoUrl);

    // API rate limit 방지 (1초 대기)
    if (i < assets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
