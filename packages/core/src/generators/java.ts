import type { PipelineGenerator } from './base.js';
import type { ProjectManifest } from '../types/manifest.js';
import type { CacheConfig, Pipeline } from '../types/pipeline.js';
import type { GeneratorOptions } from './options.js';
import { PipelineBuilder } from '../builder/pipeline-builder.js';
import { actionStep, runStep } from '../utils/known-actions.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

type BuildTool = 'mvn' | './gradlew' | 'gradle';

function isMaven(buildTool: string | undefined): boolean {
  return buildTool === 'mvn' || buildTool === './mvnw';
}

function isGradle(buildTool: string | undefined): boolean {
  return buildTool === 'gradle' || buildTool === './gradlew';
}

function testCommand(buildTool: string | undefined, coverageThreshold?: number): string {
  if (isMaven(buildTool)) {
    return coverageThreshold !== undefined
      ? `${buildTool ?? 'mvn'} test -Djacoco.minimum.lineCoverage=${coverageThreshold / 100}`
      : `${buildTool ?? 'mvn'} test`;
  }
  const gradle = buildTool ?? './gradlew';
  return coverageThreshold !== undefined
    ? `${gradle} test jacocoTestCoverageVerification -Pmin.coverage=${coverageThreshold / 100}`
    : `${gradle} test`;
}

function buildCommand(buildTool: string | undefined): string {
  if (isMaven(buildTool)) return `${buildTool ?? 'mvn'} package -DskipTests`;
  return `${(buildTool ?? './gradlew')} build -x test`;
}

function lintCommand(buildTool: string | undefined, isKotlin: boolean): string {
  if (isKotlin) {
    // ktlint via Gradle plugin is most common; fallback to standalone
    return isGradle(buildTool)
      ? `${buildTool ?? './gradlew'} ktlintCheck`
      : 'mvn antrun:run@ktlint';
  }
  return isGradle(buildTool)
    ? `${buildTool ?? './gradlew'} checkstyleMain`
    : `${buildTool ?? 'mvn'} checkstyle:check`;
}

function dependencyAuditCommand(buildTool: string | undefined): string {
  if (isMaven(buildTool)) return `${buildTool ?? 'mvn'} dependency-check:check`;
  return `${buildTool ?? './gradlew'} dependencyCheckAnalyze`;
}

function javaCache(buildTool: string | undefined): CacheConfig {
  if (isMaven(buildTool)) {
    return {
      key: "maven-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}",
      paths: ['~/.m2/repository'],
      restoreKeys: ['maven-${{ runner.os }}-'],
    };
  }
  return {
    key: "gradle-${{ runner.os }}-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}",
    paths: ['~/.gradle/caches', '~/.gradle/wrapper'],
    restoreKeys: ['gradle-${{ runner.os }}-'],
  };
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class JavaGenerator implements PipelineGenerator {
  readonly name = 'java';

  generate(manifest: ProjectManifest, options: GeneratorOptions = {}): Pipeline {
    const project = manifest.projects.find(
      (p) => p.language === 'java' || p.language === 'kotlin',
    );
    if (!project) throw new Error('JavaGenerator: no Java/Kotlin project in manifest');

    const { buildTool, name, language } = project;
    const isKotlin = language === 'kotlin';
    const defaultBranch = manifest.vcs.defaultBranch;
    const javaVersions = ['17', '21'];

    const builder = new PipelineBuilder(`${name} CI`)
      .permissions({ default: 'read-all' })
      .trigger({ type: 'push', branches: [defaultBranch] })
      .trigger({ type: 'pull_request' });

    // ── lint stage ────────────────────────────────────────────────────────────
    builder.stage('lint', (stage) =>
      stage.job('lint', (job) =>
        job
          .runsOn('ubuntu-latest')
          .timeout(10)
          .cache(javaCache(buildTool))
          .step('Checkout', actionStep('Checkout', 'checkout'))
          .step('Scan for secrets', actionStep('Scan for secrets', 'gitleaks', undefined, {
            GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          }))
          .step('Set up Java', actionStep('Set up Java', 'setupJava', {
            'java-version': '21',
            distribution: 'temurin',
          }))
          .step(`${isKotlin ? 'ktlint' : 'Checkstyle'}`, runStep(
            isKotlin ? 'ktlint' : 'Checkstyle',
            lintCommand(buildTool, isKotlin),
          )),
      ),
    );

    // ── test stage ────────────────────────────────────────────────────────────
    builder.stage('test', (stage) =>
      stage
        .dependsOn('lint')
        .job('unit-tests', (job) => {
          job
            .runsOn('ubuntu-latest')
            .timeout(20)
            .matrix({ dimensions: { 'java-version': javaVersions } })
            .cache(javaCache(buildTool))
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step('Set up Java ${{ matrix.java-version }}',
              actionStep('Set up Java ${{ matrix.java-version }}', 'setupJava', {
                'java-version': '${{ matrix.java-version }}',
                distribution: 'temurin',
              }),
            )
            .step('Run tests', runStep('Run tests', testCommand(buildTool, options.coverageThreshold)))
            .step('Dependency audit', runStep('Dependency audit', dependencyAuditCommand(buildTool)));

          return job;
        }),
    );

    // ── build stage ───────────────────────────────────────────────────────────
    builder.stage('build', (stage) =>
      stage
        .dependsOn('test')
        .job('build', (job) =>
          job
            .runsOn('ubuntu-latest')
            .timeout(15)
            .cache(javaCache(buildTool))
            .step('Checkout', actionStep('Checkout', 'checkout'))
            .step('Set up Java', actionStep('Set up Java', 'setupJava', {
              'java-version': '21',
              distribution: 'temurin',
            }))
            .step('Build', runStep('Build', buildCommand(buildTool))),
        ),
    );

    return builder.build();
  }
}
