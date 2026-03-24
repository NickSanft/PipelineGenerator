import { NextRequest, NextResponse } from 'next/server';
import {
  GitHubFileSystem,
  analyzeRepo,
  generatePipeline,
  getRenderer,
  parseGitHubUrl,
} from '@pipeline-gen/core';
import { checkRateLimit } from '@/lib/rate-limiter';
import { cacheGet, cacheSet } from '@/lib/cache';
import { AnalyzeRequestSchema } from '@/types/api';
import type { AnalyzeResponse, AnalyzeErrorResponse } from '@/types/api';

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function outputPath(owner: string, repo: string, platform: string): string {
  const slug = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (platform === 'github-actions') {
    return `.github/workflows/${slug}.yml`;
  }
  return '.gitlab-ci.yml';
}

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse | AnalyzeErrorResponse>> {
  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  const { url, platform, token } = parsed.data;

  // Rate limit
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429 },
    );
  }

  // Parse GitHub URL
  let repoInfo: ReturnType<typeof parseGitHubUrl>;
  try {
    repoInfo = parseGitHubUrl(url);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  const { owner, repo, ref, subdir } = repoInfo;
  const cacheKey = `${owner}/${repo}@${ref}/${subdir}?platform=${platform}`;

  // Check cache
  const cached = cacheGet<AnalyzeResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Resolve the effective token (user-supplied or server-side env)
  const effectiveToken = token ?? process.env['GITHUB_TOKEN'];

  try {
    // Fetch VCS info (default branch)
    const vcsInfo = await GitHubFileSystem.fetchVCSInfo(owner, repo, effectiveToken);

    // Build FileSystem adapter (pass subdir so path normalisation works)
    const ghfs = new GitHubFileSystem(owner, repo, ref, effectiveToken, subdir);
    const repoRoot = subdir ? `/${subdir}` : '/';

    // Analyse + generate
    const manifest = await analyzeRepo(repoRoot, ghfs, vcsInfo);
    const pipeline = generatePipeline(manifest);
    const renderer = getRenderer(platform);
    const yaml = renderer.render(pipeline);

    const result: AnalyzeResponse = {
      manifest,
      pipeline,
      yaml,
      outputPath: outputPath(owner, repo, platform),
      meta: {
        owner,
        repo,
        ref,
        analyzedAt: new Date().toISOString(),
      },
    };

    cacheSet(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[analyze]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
