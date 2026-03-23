import { join } from 'node:path';
import type { Analyzer } from './base.js';
import type { ProjectDescriptor, ArtifactType } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';



interface GoMod {
  module: string;
  goVersion: string;
  requires: Array<{ path: string; version: string; indirect: boolean }>;
}

const FRAMEWORK_DEPS: Record<string, string> = {
  'github.com/gin-gonic/gin': 'gin',
  'github.com/go-chi/chi': 'chi',
  'github.com/labstack/echo': 'echo',
  'github.com/gofiber/fiber': 'fiber',
  'github.com/gorilla/mux': 'gorilla-mux',
  'github.com/beego/beego': 'beego',
};

function parseGoMod(content: string): GoMod {
  const lines = content.split('\n').map((l) => l.trim());

  const moduleMatch = content.match(/^module\s+(\S+)/m);
  const goMatch = content.match(/^go\s+(\S+)/m);

  const requires: GoMod['requires'] = [];
  let inRequireBlock = false;

  for (const line of lines) {
    if (line === 'require (') { inRequireBlock = true; continue; }
    if (inRequireBlock && line === ')') { inRequireBlock = false; continue; }

    const blockEntry = inRequireBlock && line.match(/^(\S+)\s+(\S+)(\s+\/\/ indirect)?$/);
    const inlineEntry = !inRequireBlock && line.match(/^require\s+(\S+)\s+(\S+)/);
    const match = blockEntry || inlineEntry;

    if (match) {
      requires.push({
        path: match[1],
        version: match[2],
        indirect: line.includes('// indirect'),
      });
    }
  }

  return {
    module: moduleMatch?.[1] ?? 'unknown',
    goVersion: goMatch?.[1] ?? 'unknown',
    requires,
  };
}

export class GoAnalyzer implements Analyzer {
  readonly name = 'go';

  async detect(repoRoot: string, fs: FileSystem): Promise<boolean> {
    return fs.fileExists(join(repoRoot, 'go.mod'));
  }

  async analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor> {
    const content = await fs.readTextFile(join(repoRoot, 'go.mod'));
    const goMod = content ? parseGoMod(content) : { module: 'unknown', goVersion: 'unknown', requires: [] };

    const moduleParts = goMod.module.split('/');
    const name = moduleParts[moduleParts.length - 1];

    const framework = this.detectFramework(goMod.requires);
    const isBinary = await this.detectBinary(repoRoot, fs);
    const artifacts: ArtifactType[] = isBinary ? ['binary'] : [];

    return {
      name,
      path: '.',
      language: 'go',
      framework,
      packageManager: 'go modules',
      testRunner: 'go test',
      buildTool: 'go build',
      hasDockerfile: false,
      deploymentTargets: [],
      artifacts,
    };
  }

  private detectFramework(requires: GoMod['requires']): string | undefined {
    for (const req of requires) {
      if (req.indirect) continue;
      for (const [path, framework] of Object.entries(FRAMEWORK_DEPS)) {
        if (req.path.startsWith(path)) return framework;
      }
    }
    return undefined;
  }

  private async detectBinary(repoRoot: string, fs: FileSystem): Promise<boolean> {
    // Has main.go at root or a cmd/ directory with main packages
    if (await fs.fileExists(join(repoRoot, 'main.go'))) return true;
    if (await fs.anyFileExists(repoRoot, ['cmd'])) {
      const mainFiles = await fs.glob('cmd/**/main.go', { cwd: repoRoot });
      return mainFiles.length > 0;
    }
    return false;
  }
}
