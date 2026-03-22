import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyzeRepo } from '../../analyzers/registry.js';
import { generatePipeline } from '../../generators/registry.js';
import { getRenderer, type SupportedPlatform } from '../../renderers/registry.js';
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
  .option(
    '--monorepo-strategy <strategy>',
    'Monorepo strategy: single | per-project | fan-out',
    'auto',
  )
  .action(async (repoPath: string, options) => {
    const platform = options.target as SupportedPlatform;

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      logger.error(`Unknown platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
      process.exit(1);
    }

    try {
      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(repoPath);

      logger.info(`Generating pipeline (target: ${platform})`);
      const pipeline = generatePipeline(manifest);

      const renderer = getRenderer(platform);
      const yaml = renderer.render(pipeline);
      const outputPath = options.output
        ? resolve(options.output)
        : resolve(repoPath, renderer.outputPath(pipeline));

      if (options.dryRun) {
        logger.info(`Dry run — would write to: ${outputPath}`);
        console.log(yaml);
        return;
      }

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, yaml, 'utf-8');
      logger.success(`Generated: ${outputPath}`);
    } catch (err) {
      logger.error(`Generation failed: ${String(err)}`);
      process.exit(1);
    }
  });
