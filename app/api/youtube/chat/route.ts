import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const SKILL_BASE = path.join(
  process.cwd(),
  '.claude', 'skills', 'claude-youtube-main', 'skills', 'claude-youtube'
);

function readSkillFile(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(SKILL_BASE, relativePath), 'utf-8');
  } catch {
    return '';
  }
}

const SKILL_REFS: Record<string, string[]> = {
  audit:      ['references/algorithm-guide.md', 'references/seo-playbook.md', 'references/analytics-guide.md', 'references/monetization-guide.md'],
  script:     ['references/retention-scripting-guide.md', 'references/algorithm-guide.md'],
  hook:       ['references/retention-scripting-guide.md'],
  seo:        ['references/seo-playbook.md'],
  thumbnail:  ['references/thumbnail-ctr-guide.md'],
  strategy:   ['references/algorithm-guide.md'],
  calendar:   ['references/algorithm-guide.md'],
  shorts:     ['references/shorts-playbook.md'],
  analyze:    ['references/analytics-guide.md', 'references/algorithm-guide.md'],
  repurpose:  ['references/repurposing-guide.md', 'references/shorts-playbook.md'],
  monetize:   ['references/monetization-guide.md'],
  competitor: ['references/seo-playbook.md', 'references/analytics-guide.md'],
  metadata:   ['references/seo-playbook.md'],
  ideate:     ['references/algorithm-guide.md', 'references/seo-playbook.md'],
};

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { skillType, messages } = await req.json();

    if (!skillType || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const skillMd    = readSkillFile('SKILL.md');
    const subSkillMd = readSkillFile(`sub-skills/${skillType}.md`);
    const refs       = (SKILL_REFS[skillType] || [])
      .map(r => `### ${path.basename(r, '.md')}\n${readSkillFile(r)}`)
      .join('\n\n---\n\n');

    const systemInstruction = `You are an expert YouTube creator AI assistant. Respond in the SAME LANGUAGE the user writes in (Korean ↔ English).

# YouTube Creator Skill Framework
${skillMd}

# Active Sub-Skill: ${skillType}
${subSkillMd}

# Reference Materials
${refs}

RULES:
- Be specific and actionable — no generic advice
- Always cite benchmarks from the reference materials when available
- If critical info is missing (channel size, niche, goal), ask before advising
- Format responses with clear headers (##), bullet points, and tables
- Keep responses focused and practical`;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // Build Gemini contents — skip the initial welcome message (index 0, role=assistant)
    const contents = messages
      .filter((_: any, i: number) => !(i === 0 && messages[0]?.role === 'assistant'))
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    if (contents.length === 0) {
      return new Response(JSON.stringify({ error: 'No user messages' }), { status: 400 });
    }

    // Streaming response via SSE
    const streamResult = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    });

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const chunk of streamResult) {
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.error('[YouTube Chat API]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
