import { join } from 'node:path';
import type { Analyzer } from './base.js';
import type { ProjectDescriptor, Language, ArtifactType } from '../types/manifest.js';
import type { FileSystem } from '../utils/fs-adapter.js';

// ── Framework detection ───────────────────────────────────────────────────────

const FRAMEWORK_DEPS: Record<string, string> = {
  'spring-boot': 'spring-boot',
  'spring-boot-starter': 'spring-boot',
  'quarkus-core': 'quarkus',
  'io.quarkus': 'quarkus',
  'micronaut-core': 'micronaut',
  'io.micronaut': 'micronaut',
  'ktor-server': 'ktor',
  'io.ktor': 'ktor',
  'jakarta.ws.rs': 'jakarta-ee',
  'javax.ws.rs': 'jakarta-ee',
};

function detectFrameworkFromDeps(deps: string[]): string | undefined {
  for (const dep of deps) {
    for (const [key, framework] of Object.entries(FRAMEWORK_DEPS)) {
      if (dep.includes(key)) return framework;
    }
  }
  return undefined;
}

// ── pom.xml parsing ───────────────────────────────────────────────────────────

interface PomInfo {
  name?: string;
  groupId?: string;
  artifactId?: string;
  packaging?: string;
  dependencies: string[];
  plugins: string[];
  hasKotlinPlugin: boolean;
}

function parsePom(content: string): PomInfo {
  const tag = (xml: string, t: string): string | undefined =>
    xml.match(new RegExp(`<${t}[^>]*>([^<]+)<\/${t}>`))?.[1]?.trim();

  const allTags = (xml: string, t: string): string[] => {
    const re = new RegExp(`<${t}[^>]*>([^<]+)<\/${t}>`, 'g');
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
    return results;
  };

  // Only look at top-level <groupId> / <artifactId> (before first <dependencies>)
  const headerSection = content.slice(0, content.indexOf('<dependencies>') > -1
    ? content.indexOf('<dependencies>')
    : content.length);

  return {
    name: tag(headerSection, 'name') ?? tag(headerSection, 'artifactId'),
    groupId: tag(headerSection, 'groupId'),
    artifactId: tag(headerSection, 'artifactId'),
    packaging: tag(content, 'packaging'),
    dependencies: allTags(content, 'artifactId'),
    plugins: allTags(content, 'artifactId'),
    hasKotlinPlugin: content.includes('kotlin-maven-plugin') || content.includes('kotlin-stdlib'),
  };
}

// ── build.gradle parsing ──────────────────────────────────────────────────────

interface GradleInfo {
  name?: string;
  dependencies: string[];
  hasKotlinPlugin: boolean;
  isKotlinDsl: boolean;
}

function parseGradle(content: string, isKts: boolean): GradleInfo {
  const deps: string[] = [];

  // Match quoted dep strings: 'group:artifact:version' or "group:artifact:version"
  const depRe = /["']([a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+)[^"']*["']/g;
  let m: RegExpExecArray | null;
  while ((m = depRe.exec(content)) !== null) deps.push(m[1]);

  // Also match Kotlin DSL style: implementation("group:artifact:version")
  const kotlinDepRe = /(?:implementation|api|compileOnly|runtimeOnly)\("([^"]+)"\)/g;
  while ((m = kotlinDepRe.exec(content)) !== null) deps.push(m[1]);

  const hasKotlinPlugin =
    content.includes('kotlin("jvm")') ||
    content.includes("id 'org.jetbrains.kotlin") ||
    content.includes('id("org.jetbrains.kotlin') ||
    content.includes('kotlin-stdlib');

  return { dependencies: deps, hasKotlinPlugin, isKotlinDsl: isKts };
}

// ── Analyzer ──────────────────────────────────────────────────────────────────

export class JavaAnalyzer implements Analyzer {
  readonly name = 'java';

  async detect(repoRoot: string, fs: FileSystem): Promise<boolean> {
    if (await fs.anyFileExists(repoRoot, ['pom.xml', 'build.gradle', 'build.gradle.kts'])) {
      return true;
    }
    // Fallback: any .java or .kt files
    const javaFiles = await fs.glob('**/*.java', { cwd: repoRoot, ignore: ['**/node_modules/**'] });
    if (javaFiles.length > 0) return true;
    const ktFiles = await fs.glob('**/*.kt', { cwd: repoRoot, ignore: ['**/node_modules/**'] });
    return ktFiles.length > 0;
  }

  async analyze(repoRoot: string, fs: FileSystem): Promise<ProjectDescriptor> {
    let name = 'unknown';
    let language: Language = 'java';
    let packageManager = 'maven';
    let buildTool = 'mvn';
    let framework: string | undefined;
    let testRunner: string | undefined;

    const hasPom = await fs.fileExists(join(repoRoot, 'pom.xml'));
    const hasGradle = await fs.fileExists(join(repoRoot, 'build.gradle'));
    const hasGradleKts = await fs.fileExists(join(repoRoot, 'build.gradle.kts'));

    if (hasPom) {
      const content = await fs.readTextFile(join(repoRoot, 'pom.xml'));
      if (content) {
        const pom = parsePom(content);
        name = pom.name ?? pom.artifactId ?? 'unknown';
        framework = detectFrameworkFromDeps(pom.dependencies);
        if (pom.hasKotlinPlugin) language = 'kotlin';
        testRunner = this.detectTestRunner(pom.dependencies);
      }
      packageManager = 'maven';
      buildTool = 'mvn';
    } else if (hasGradle || hasGradleKts) {
      const file = hasGradleKts ? 'build.gradle.kts' : 'build.gradle';
      const content = await fs.readTextFile(join(repoRoot, file));
      if (content) {
        const gradle = parseGradle(content, hasGradleKts);
        framework = detectFrameworkFromDeps(gradle.dependencies);
        if (gradle.hasKotlinPlugin || hasGradleKts) language = 'kotlin';
        testRunner = this.detectTestRunner(gradle.dependencies);
      }
      // Prefer Gradle wrapper if present
      const hasWrapper = await fs.anyFileExists(repoRoot, ['gradlew', 'gradlew.bat']);
      packageManager = 'gradle';
      buildTool = hasWrapper ? './gradlew' : 'gradle';

      // Try to get name from settings.gradle / settings.gradle.kts
      const settingsFile = await fs.readTextFile(join(repoRoot, 'settings.gradle.kts'))
        ?? await fs.readTextFile(join(repoRoot, 'settings.gradle'));
      if (settingsFile) {
        const nameMatch = settingsFile.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
        if (nameMatch) name = nameMatch[1];
      }
    }

    // Fallback language detection: if .kt files exist → kotlin
    if (language === 'java') {
      const ktFiles = await fs.glob('**/*.kt', { cwd: repoRoot, ignore: ['**/build/**', '**/.gradle/**'] });
      if (ktFiles.length > 0) language = 'kotlin';
    }

    const artifacts = this.detectArtifacts(packageManager, name);

    return {
      name,
      path: '.',
      language,
      framework,
      packageManager,
      testRunner,
      buildTool,
      hasDockerfile: false,
      deploymentTargets: [],
      artifacts,
    };
  }

  private detectTestRunner(deps: string[]): string | undefined {
    const all = deps.join(' ').toLowerCase();
    if (all.includes('junit')) return 'junit';
    if (all.includes('testng')) return 'testng';
    return 'junit'; // default assumption for JVM projects
  }

  private detectArtifacts(_packageManager: string, name: string): ArtifactType[] {
    // Most Java/Kotlin projects produce a JAR; we can't reliably distinguish
    // without reading more config, so default to binary (JAR/WAR).
    if (name !== 'unknown') return ['binary'];
    return [];
  }
}
