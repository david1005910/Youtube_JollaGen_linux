import { NextRequest, NextResponse } from 'next/server';
import { generateImageForScene } from '@/services/geminiService';

export const maxDuration = 60;

const FREE_MODEL_ID = 'gemini-2.0-flash-image';
const IMAGE_TIMEOUT_MS = 18000; // 18초 타임아웃 (기존 77초 행 방지)

function isQuotaError(msg: string) {
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('limit: 0') ||
    msg.includes('429') || msg.includes('quota') || msg.includes('exceeded');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`이미지 생성 시간 초과 (${ms / 1000}초) — 이미지 모델을 변경하거나 나중에 시도하세요`)), ms)
    ),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const { scene, referenceImages, stylePrompt, imageModelId } = await req.json();

    let imageData: string | null = null;
    try {
      imageData = await withTimeout(
        generateImageForScene(scene, referenceImages, stylePrompt, imageModelId),
        IMAGE_TIMEOUT_MS
      );
    } catch (e: any) {
      // 할당량 초과 → 무료 모델로 폴백 (같은 모델이 아닐 때)
      if (isQuotaError(e.message) && imageModelId !== FREE_MODEL_ID) {
        console.warn(`[Image API] 할당량 초과(${imageModelId}) → 무료 모델(${FREE_MODEL_ID})로 폴백`);
        imageData = await withTimeout(
          generateImageForScene(scene, referenceImages, stylePrompt, FREE_MODEL_ID),
          IMAGE_TIMEOUT_MS
        );
      } else {
        throw e;
      }
    }

    return NextResponse.json({ imageData });
  } catch (e: any) {
    console.warn('[API] gemini/image error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
