import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeRepo,
  generatePipeline,
  getRenderer,
  unifiedDiff,
  printDiff,
  logger,
} from '@pipeline-gen/core';
import type { SupportedPlatform } from '@pipeline-gen/core';

const SUPPORTED_PLATFORMS: SupportedPlatform[] = ['github-actions', 'gitlab-ci'];

export const diffCommand = new Command('diff')
  .description('Compare an existing pipeline config to what would be generated')
  .argument('[path]', 'Path to the repository root', '.')
  .requiredOption(
    '--target <platform>',
    `Target platform: ${SUPPORTED_PLATFORMS.join(' | ')}`,
  )
  .option('--output <path>', 'Path to the existing pipeline file (defaults to renderer output path)')
  .option('--coverage-threshold <number>', 'Minimum test coverage percentage (0–100)')
  .action(async (repoPath: string, opts) => {
    const platform = opts.target as SupportedPlatform;

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      logger.error(`Unknown platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
      process.exit(1);
    }

    try {
      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(repoPath);

      const options = {
        coverageThreshold: opts.coverageThreshold !== undefined
          ? Number(opts.coverageThreshold)
          : undefined,
      };

      const pipeline = generatePipeline(manifest, options);
      const renderer = getRenderer(platform);
      const generated = renderer.render(pipeline);

      const existingPath = opts.output
        ? resolve(opts.output)
        : resolve(repoPath, renderer.outputPath(pipeline));

      let existing: string;
      try {
        existing = await readFile(existingPath, 'utf-8');
      } catch {
        logger.warn(`No existing file at ${existingPath} — showing full generated output as new file`);
        existing = '';
      }

      const diff = unifiedDiff(existing, generated, existingPath, 'generated');
      printDiff(diff, existingPath);
    } catch (err) {
      logger.error(`Diff failed: ${String(err)}`);
      process.exit(1);
    }
  });
