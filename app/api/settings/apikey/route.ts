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
    let content = '';
    try { content = fs.readFileSync(ENV_FILE, 'utf-8'); } catch {}
    let updated = content;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`^(${key}=).*$`, 'm');
      if (regex.test(updated)) {
        updated = updated.replace(regex, `$1${value}`);
      } else {
        updated += (updated.endsWith('\n') || !updated ? '' : '\n') + `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(ENV_FILE, updated);
  } catch (e: any) {
    throw new Error(`env 파일 쓰기 실패: ${e.message}`);
  }
}

function maskKey(key: string) {
  if (key.length <= 8) return '****';
  return key.slice(0, 6) + '****' + key.slice(-4);
}

// GET: 현재 키 설정 상태 (값은 마스킹)
export async function GET() {
  const env = readEnvFile();
  const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  const openaiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  return Response.json({
    hasAnthropicKey:    Boolean(anthropicKey),
    anthropicKeyMasked: anthropicKey ? maskKey(anthropicKey) : '',
    hasGeminiKey:       Boolean(geminiKey),
    geminiKeyMasked:    geminiKey ? maskKey(geminiKey) : '',
    hasOpenaiKey:       Boolean(openaiKey),
    openaiKeyMasked:    openaiKey ? maskKey(openaiKey) : '',
  });
}

// POST: API 키 저장 (즉시 반영)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Record<string, string> = {};

    if (body.anthropicKey !== undefined) {
      const key = String(body.anthropicKey).trim();
      if (key && !key.startsWith('sk-ant-')) {
        return Response.json({ error: 'Anthropic 키는 "sk-ant-"로 시작해야 합니다.' }, { status: 400 });
      }
      updates.ANTHROPIC_API_KEY = key;
      process.env.ANTHROPIC_API_KEY = key;
    }

    if (body.geminiKey !== undefined) {
      const key = String(body.geminiKey).trim();
      if (key && !key.startsWith('AIza')) {
        return Response.json({ error: 'Gemini API 키는 "AIza"로 시작해야 합니다.' }, { status: 400 });
      }
      updates.GEMINI_API_KEY = key;
      process.env.GEMINI_API_KEY = key;
    }

    if (body.openaiKey !== undefined) {
      const key = String(body.openaiKey).trim();
      if (key && !key.startsWith('sk-')) {
        return Response.json({ error: 'OpenAI API 키는 "sk-"로 시작해야 합니다.' }, { status: 400 });
      }
      updates.OPENAI_API_KEY = key;
      process.env.OPENAI_API_KEY = key;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: '저장할 키가 없습니다.' }, { status: 400 });
    }

    writeEnvFile(updates);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
