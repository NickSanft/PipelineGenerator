import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyzeRepo } from '../../analyzers/registry.js';
import { generatePipeline } from '../../generators/registry.js';
import { makeDecisions } from '../../generators/decisions.js';
import type { GeneratorOptions } from '../../generators/options.js';
import { getRenderer, type SupportedPlatform } from '../../renderers/registry.js';
import { runInteractivePrompts } from '../interactive.js';
import { printManifestSummary, printDecisions, printOutputPath } from '../../utils/display.js';
import { logger } from '../../utils/logger.js';

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

      // ── Generate ───────────────────────────────────────────────────────────
      logger.info(`Generating pipeline (target: ${platform})`);
      const pipeline = generatePipeline(manifest, options);

      const renderer = getRenderer(platform);
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
