import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(process.cwd(), '.env.local');

function readEnvFile(): Record<string, string> {
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      result[key] = value;
    }
    return result;
  } catch { return {}; }
}

function writeEnvFile(vars: Record<string, string>) {
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    let updated = content;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`^(${key}=).*$`, 'm');
      if (regex.test(updated)) {
        updated = updated.replace(regex, `$1${value}`);
      } else {
        updated += `\n${key}=${value}`;
      }
    }
    fs.writeFileSync(ENV_FILE, updated);
  } catch (e: any) {
    throw new Error(`env 파일 쓰기 실패: ${e.message}`);
  }
}

// GET: 현재 키 설정 상태 (값은 마스킹)
export async function GET() {
  const env = readEnvFile();
  return Response.json({
    hasGeminiKey:     Boolean(env.GEMINI_API_KEY),
    hasPaidKey:       Boolean(env.GEMINI_API_KEY_PAID),
    geminiKeyMasked:  env.GEMINI_API_KEY  ? maskKey(env.GEMINI_API_KEY)  : '',
    paidKeyMasked:    env.GEMINI_API_KEY_PAID ? maskKey(env.GEMINI_API_KEY_PAID) : '',
  });
}

// POST: 유료 키 저장
export async function POST(req: NextRequest) {
  try {
    const { paidKey } = await req.json();
    if (!paidKey || typeof paidKey !== 'string') {
      return Response.json({ error: '유효한 키가 필요합니다.' }, { status: 400 });
    }
    if (!paidKey.startsWith('AIza')) {
      return Response.json({ error: 'Gemini API 키는 "AIza"로 시작해야 합니다.' }, { status: 400 });
    }
    writeEnvFile({ GEMINI_API_KEY_PAID: paidKey });

    // 프로세스 환경변수도 즉시 반영 (재시작 없이 적용)
    process.env.GEMINI_API_KEY_PAID = paidKey;

    return Response.json({ ok: true, masked: maskKey(paidKey) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: 유료 키 제거
export async function DELETE() {
  try {
    writeEnvFile({ GEMINI_API_KEY_PAID: '' });
    process.env.GEMINI_API_KEY_PAID = '';
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

function maskKey(key: string) {
  if (key.length <= 8) return '****';
  return key.slice(0, 6) + '****' + key.slice(-4);
}
