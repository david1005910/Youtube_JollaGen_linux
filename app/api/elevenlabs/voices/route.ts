import { NextRequest, NextResponse } from 'next/server';
import { fetchElevenLabsVoices } from '@/services/elevenLabsService';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    // API 키는 서버 환경변수에서 읽음
    const voices = await fetchElevenLabsVoices();
    return NextResponse.json(voices);
  } catch (e: any) {
    console.error('[API] elevenlabs/voices error:', e.message);
    return NextResponse.json([], { status: 200 }); // 실패해도 빈 배열 반환
  }
}
