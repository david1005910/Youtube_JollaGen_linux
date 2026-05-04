import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_DIRS = [
  '/tmp/tubegen',
  path.join(process.cwd(), 'public'),
];

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.srt': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path') ?? '';
  if (!filePath) return Response.json({ error: 'path 파라미터 필요' }, { status: 400 });

  const resolved = path.resolve(filePath);
  if (!ALLOWED_DIRS.some(d => resolved.startsWith(d))) {
    return Response.json({ error: '허용되지 않은 경로' }, { status: 403 });
  }
  if (!fs.existsSync(resolved)) {
    return Response.json({ error: '파일 없음' }, { status: 404 });
  }

  const stat = fs.statSync(resolved);
  const ext  = path.extname(resolved).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const size = stat.size;

  const range = req.headers.get('range');
  if (range && (mime.startsWith('video') || mime.startsWith('audio'))) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : size - 1;
    const chunk = end - start + 1;

    return new Response(fs.createReadStream(resolved, { start, end }) as any, {
      status: 206,
      headers: {
        'Content-Range':  `bytes ${start}-${end}/${size}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(chunk),
        'Content-Type':   mime,
        'Cache-Control':  'no-store',
      },
    });
  }

  return new Response(fs.createReadStream(resolved) as any, {
    headers: {
      'Content-Type':   mime,
      'Content-Length': String(size),
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-store',
    },
  });
}
