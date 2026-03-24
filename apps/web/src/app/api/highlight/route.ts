import { NextRequest, NextResponse } from 'next/server';
import { highlightYaml } from '@/lib/highlight';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || typeof (body as { yaml?: unknown }).yaml !== 'string') {
    return NextResponse.json({ error: 'Missing yaml field' }, { status: 400 });
  }

  const html = await highlightYaml((body as { yaml: string }).yaml);
  return NextResponse.json({ html });
}
