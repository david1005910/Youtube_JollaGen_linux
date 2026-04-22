import { NextRequest, NextResponse } from 'next/server';
import { findTrendingTopics } from '@/services/geminiService';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { category, usedTopics } = await req.json();
    const result = await findTrendingTopics(category, usedTopics ?? []);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[API] gemini/trends error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
