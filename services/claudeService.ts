/**
 * Anthropic Claude API 서비스 (서버 사이드 전용)
 * - 스크립트/프롬프트 생성, 트렌드 검색, 자막 분리, 모션 프롬프트
 * - 이미지/TTS는 지원 안 됨 → geminiService 사용
 */

import Anthropic from '@anthropic-ai/sdk';
import { ScriptScene } from '../types';
import { SYSTEM_INSTRUCTIONS, getTrendSearchPrompt, getScriptGenerationPrompt } from './prompts';

const FAST_MODEL  = 'claude-haiku-4-5-20251001';  // 빠른 작업 (트렌드, 자막, 모션)
const SMART_MODEL = 'claude-sonnet-4-6';           // 스크립트 생성

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBracket = cleaned.search(/[\[{]/);
  if (firstBracket === -1) return '[]';

  let depth = 0, inString = false, escapeNext = false, lastValid = -1;
  for (let i = firstBracket; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) { lastValid = i; break; }
    }
  }
  return lastValid !== -1
    ? cleaned.slice(firstBracket, lastValid + 1).trim()
    : cleaned.slice(firstBracket).trim();
}

async function callClaude(
  system: string,
  userPrompt: string,
  model: string = SMART_MODEL,
  maxTokens: number = 8192
): Promise<string> {
  const msg = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

// ── 트렌드 검색 ────────────────────────────────────────────────────────────

export const findTrendingTopics = async (
  category: string,
  usedTopics: string[]
): Promise<any[]> => {
  const prompt = getTrendSearchPrompt(category, usedTopics.join(', '));
  const system = `You are a trend researcher. Return ONLY valid JSON array. No markdown, no explanation.`;
  const text = await callClaude(system, prompt, FAST_MODEL, 1024);
  try {
    const parsed = JSON.parse(cleanJsonResponse(text));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ── 스크립트 생성 ────────────────────────────────────────────────────────────

export const generateScript = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext?: string | null
): Promise<ScriptScene[]> => {
  const system = topic === 'Manual Script Input'
    ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER
    : hasReferenceImage
      ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH
      : SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;

  const userPrompt = getScriptGenerationPrompt(topic, sourceContext);

  const inputLen = (sourceContext || topic).length;
  const estimatedScenes = Math.max(5, Math.ceil(inputLen / 80));
  const maxTokens = Math.min(16000, Math.max(4096, estimatedScenes * 600));

  console.log(`[Claude Script] 입력: ${inputLen}자, 예상 씬: ${estimatedScenes}, maxTokens: ${maxTokens}`);

  const text = await callClaude(system, userPrompt, SMART_MODEL, maxTokens);
  const result = JSON.parse(cleanJsonResponse(text));
  const scenes = Array.isArray(result) ? result : (result.scenes || []);

  console.log(`[Claude Script] 생성된 씬: ${scenes.length}개`);

  return scenes.map((s: any, i: number) => ({
    sceneNumber: s.sceneNumber ?? i + 1,
    narration: s.narration ?? '',
    visualPrompt: s.image_prompt_english ?? s.visualPrompt ?? '',
    analysis: s.analysis ?? {},
  }));
};

// ── 청크 분할 스크립트 생성 ──────────────────────────────────────────────────

export const generateScriptChunked = async (
  topic: string,
  hasReferenceImage: boolean,
  sourceContext: string,
  chunkSize: number = 2500
): Promise<ScriptScene[]> => {
  // 청크 분할
  const chunks: string[] = [];
  const paragraphs = sourceContext.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= chunkSize) {
      current += (current ? '\n\n' : '') + para;
    } else {
      if (current) chunks.push(current.trim());
      current = para;
    }
  }
  if (current) chunks.push(current.trim());

  console.log(`[Claude Script Chunked] ${chunks.length}개 청크 처리 시작`);

  let allScenes: ScriptScene[] = [];
  let sceneOffset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkScenes = await generateScript(topic, hasReferenceImage, chunks[i]);
    // 씬 번호 보정
    const adjusted = chunkScenes.map(s => ({
      ...s,
      sceneNumber: sceneOffset + (s.sceneNumber || 1),
    }));
    allScenes = allScenes.concat(adjusted);
    sceneOffset += chunkScenes.length;
    console.log(`[Claude Script Chunked] 청크 ${i + 1}/${chunks.length} 완료 (총 ${allScenes.length}씬)`);
  }

  return allScenes;
};

// ── 자막 의미 분리 ───────────────────────────────────────────────────────────

export const splitSubtitleByMeaning = async (
  narration: string,
  maxChars: number = 20
): Promise<string[]> => {
  const system = `You are a subtitle editor. Return ONLY a JSON array of strings. No markdown, no explanation.`;
  const prompt = `자막 분리 작업입니다.

## 절대 금지
- 글자 추가/삭제/변경 금지 (맞춤법 교정 포함)
- 청크를 이어붙이면 원문과 완전히 동일해야 함

## 규칙
1. 각 청크는 15~${maxChars}자
2. 의미 단위로 자연스럽게 끊기
3. 쉼표·마침표·조사 뒤에서 끊기

## 원문
${narration}

JSON 배열만 출력. 예: ["청크1", "청크2"]`;

  const text = await callClaude(system, prompt, FAST_MODEL, 1024);
  try {
    const chunks: string[] = JSON.parse(cleanJsonResponse(text));
    // 원문 복원 검증
    if (chunks.join('') !== narration) {
      console.warn('[Claude Subtitle] 원문 불일치 → 폴백');
      return fallbackSplit(narration, maxChars);
    }
    return chunks;
  } catch {
    return fallbackSplit(narration, maxChars);
  }
};

function fallbackSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    const slice = text.slice(start, end);
    const breakAt = slice.search(/[,，。.!? ]\s*$/);
    if (breakAt > 0 && end < text.length) end = start + breakAt + 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

// ── 모션 프롬프트 생성 ──────────────────────────────────────────────────────

export const generateMotionPrompt = async (
  narration: string,
  visualPrompt: string
): Promise<string> => {
  const system = `You are an animation director. Output ONLY the motion prompt in English, no explanation.`;
  const prompt = `Generate a motion prompt for image-to-video AI.

## Rules
1. English only, max 80 words
2. Keep original image style intact — NO style changes
3. Suggest subtle, natural movement based on emotion
4. Camera: slow gentle zoom in
5. Keep movements minimal but expressive

## Narration (Korean): ${narration}
## Visual: ${visualPrompt.slice(0, 300)}

Output ONLY the motion prompt. Example:
"Slow gentle zoom in. Character slightly nods with a warm smile. Subtle breathing. Background static. Original style preserved."`;

  try {
    const text = await callClaude(system, prompt, FAST_MODEL, 256);
    const result = text.trim();
    console.log('[Claude Motion] 생성됨:', result.slice(0, 80));
    return result;
  } catch {
    console.warn('[Claude Motion] 실패 → 기본 프롬프트');
    return `Slow gentle zoom in. Subtle natural movement. Maintain original art style. ${visualPrompt.slice(0, 100)}`;
  }
};
