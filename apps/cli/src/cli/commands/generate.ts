import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  analyzeRepo,
  generatePipeline,
  makeDecisions,
  getRenderer,
  loadPlugins,
  printManifestSummary,
  printDecisions,
  printOutputPath,
  logger,
} from '@pipeline-gen/core';
import type { GeneratorOptions, SupportedPlatform } from '@pipeline-gen/core';
import { runInteractivePrompts } from '../interactive.js';

const SUPPORTED_PLATFORMS: SupportedPlatform[] = ['github-actions', 'gitlab-ci'];

export const generateCommand = new Command('generate')
  .description('Generate a CI/CD pipeline configuration for the repository')
  .argument('[path]', 'Path to the repository root', '.')
  .requiredOption(
    '--target <platform>',
    `Target platform: ${SUPPORTED_PLATFORMS.join(' | ')}`,
  )
  .option('--output <path>', 'Override the output file path')
  .option('--dry-run', 'Print what would be generated without writing any files')
  .option('--interactive', 'Walk through generation choices interactively')
  .option('--coverage-threshold <number>', 'Minimum test coverage percentage (0–100)')
  .option('--skip-docker-push', 'Skip the Docker build/push stage even if a Dockerfile is present')
  .option(
    '--monorepo-strategy <strategy>',
    'Monorepo strategy: single | per-project | fan-out',
    'auto',
  )
  .action(async (repoPath: string, opts) => {
    const platform = opts.target as SupportedPlatform;

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      logger.error(`Unknown platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
      process.exit(1);
    }

    try {
      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(repoPath);

      // ── Build options ──────────────────────────────────────────────────────
      let options: GeneratorOptions = {
        coverageThreshold: opts.coverageThreshold !== undefined
          ? Number(opts.coverageThreshold)
          : undefined,
        skipDockerPush: opts.skipDockerPush ?? false,
      };

      // Interactive mode — prompts may override flag-derived options
      if (opts.interactive) {
        console.log();
        const result = await runInteractivePrompts(manifest, platform);
        options = result.options;
      }

      // ── Load plugins ───────────────────────────────────────────────────────
      const { plugins, rc } = await loadPlugins(repoPath);
      if (plugins.length > 0) {
        logger.info(`Loaded plugins: ${plugins.map((p) => p.name).join(', ')}`);
      }
      // rc.target overrides --target if not explicitly provided on CLI
      const effectivePlatform = (opts.target !== undefined ? platform : rc?.target ?? platform) as SupportedPlatform;

      // ── Generate ───────────────────────────────────────────────────────────
      logger.info(`Generating pipeline (target: ${effectivePlatform})`);
      const pipeline = generatePipeline(manifest, options, plugins);

      const renderer = getRenderer(effectivePlatform);
      const yaml = renderer.render(pipeline);
      const outputPath = opts.output
        ? resolve(opts.output)
        : resolve(repoPath, renderer.outputPath(pipeline));

      // ── Dry run ────────────────────────────────────────────────────────────
      if (opts.dryRun) {
        printManifestSummary(manifest);
        printDecisions(makeDecisions(manifest, options));
        printOutputPath(outputPath);
        console.log(yaml);
        return;
      }

      // ── Write file ─────────────────────────────────────────────────────────
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, yaml, 'utf-8');
      logger.success(`Generated: ${outputPath}`);
    } catch (err) {
      logger.error(`Generation failed: ${String(err)}`);
      process.exit(1);
    }
  });
