import { join, basename } from 'node:path';
import type { Analyzer } from './base.js';
import type { ProjectDescriptor, Language, ArtifactType } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';

// ── Project file parsing ───────────────────────────────────────────────────────

interface CsProjInfo {
  name?: string;
  targetFramework?: string;
  sdk?: string;
  dependencies: string[];
}

function parseCsproj(content: string): CsProjInfo {
  const tag = (t: string): string | undefined =>
    content.match(new RegExp(`<${t}[^>]*>([^<]+)</${t}>`))?.[ 1]?.trim();

  const sdkMatch = content.match(/<Project[^>]+Sdk="([^"]+)"/i);
  const sdk = sdkMatch?.[1];

  // TargetFrameworks (multi) or TargetFramework (single) — take first value
  const tfRaw = tag('TargetFrameworks') ?? tag('TargetFramework');
  const targetFramework = tfRaw?.split(';')[0]?.trim();

  const name = tag('AssemblyName') ?? tag('RootNamespace');

  const pkgRe = /<PackageReference[^>]+Include="([^"]+)"/gi;
  const dependencies: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pkgRe.exec(content)) !== null) dependencies.push(m[1]);

  return { name, targetFramework, sdk, dependencies };
}

// ── Framework detection ───────────────────────────────────────────────────────

function detectFramework(sdk: string | undefined, deps: string[]): string | undefined {
  if (sdk?.includes('BlazorWebAssembly') ||
      deps.some((d) => d.startsWith('Microsoft.AspNetCore.Components.WebAssembly'))) {
    return 'blazor';
  }
  if (sdk?.includes('Web')) return 'aspnet';
  if (sdk?.includes('Worker')) return 'worker-service';
  const joined = deps.join(' ');
  if (joined.includes('Microsoft.AspNetCore')) return 'aspnet';
  if (joined.includes('Blazor')) return 'blazor';
  return undefined;
}

// ── Test runner detection ─────────────────────────────────────────────────────

function detectTestRunner(deps: string[]): string | undefined {
  const all = deps.join(' ').toLowerCase();
  if (all.includes('xunit')) return 'xunit';
  if (all.includes('nunit')) return 'nunit';
  if (all.includes('mstest') || all.includes('testplatform')) return 'mstest';
  return undefined;
}

// ── .NET version extraction ───────────────────────────────────────────────────

function extractDotnetVersion(targetFramework: string | undefined): string | undefined {
  if (!targetFramework) return undefined;
  // net9.0 → "9.0", net8.0 → "8.0", netcoreapp3.1 → "3.1"
  const m = targetFramework.match(/^net(?:coreapp)?(\d+(?:\.\d+)?)$/);
  return m?.[1];
}

// ── Analyzer ──────────────────────────────────────────────────────────────────

export class CSharpAnalyzer implements Analyzer {
  readonly name = 'csharp';

  async detect(repoRoot: string, fs: FileSystem): Promise<boolean> {
    const slnFiles = await fs.glob('*.sln', { cwd: repoRoot });
    if (slnFiles.length > 0) return true;
    const csprojFiles = await fs.glob('**/*.csproj', { cwd: repoRoot, ignore: ['**/bin/**', '**/obj/**'] });
    if (csprojFiles.length > 0) return true;
    const fsprojFiles = await fs.glob('**/*.fsproj', { cwd: repoRoot, ignore: ['**/bin/**', '**/obj/**'] });
    return fsprojFiles.length > 0;
  }

  async analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor> {
    let name = 'unknown';
    let language: Language = 'csharp';
    let framework: string | undefined;
    let testRunner: string | undefined;
    let dotnetVersion: string | undefined;

    const csprojFiles = await fs.glob('**/*.csproj', { cwd: repoRoot, ignore: ['**/bin/**', '**/obj/**'] });
    const fsprojFiles = await fs.glob('**/*.fsproj', { cwd: repoRoot, ignore: ['**/bin/**', '**/obj/**'] });
    const projectFile = [...csprojFiles, ...fsprojFiles][0];

    if (projectFile) {
      const isFsproj = projectFile.endsWith('.fsproj');
      if (isFsproj) language = 'fsharp';

      const content = await fs.readTextFile(join(repoRoot, projectFile));
      if (content) {
        const info = parseCsproj(content);
        name = info.name ?? basename(projectFile, isFsproj ? '.fsproj' : '.csproj');
        framework = detectFramework(info.sdk, info.dependencies);
        testRunner = detectTestRunner(info.dependencies);
        dotnetVersion = extractDotnetVersion(info.targetFramework);
      }
    }

    // Fallback: infer name from .sln file
    if (name === 'unknown') {
      const slnFiles = await fs.glob('*.sln', { cwd: repoRoot });
      if (slnFiles.length > 0) name = basename(slnFiles[0], '.sln');
    }

    return {
      name,
      path: '.',
      language,
      framework,
      packageManager: 'dotnet',
      testRunner,
      buildTool: 'dotnet',
      hasDockerfile: false,
      deploymentTargets: [],
      artifacts: this.detectArtifacts(language),
      raw: { dotnetVersion },
    };
  }

  private detectArtifacts(language: Language): ArtifactType[] {
    void language; // all .NET projects produce a binary
    return ['binary'];
  }
}
