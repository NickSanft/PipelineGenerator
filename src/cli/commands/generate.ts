import { Command } from 'commander';
import { analyzeRepo } from '../../analyzers/registry.js';
import { generatePipeline } from '../../generators/registry.js';
import { logger } from '../../utils/logger.js';

export const generateCommand = new Command('generate')
  .description('Generate a CI/CD pipeline configuration for the repository')
  .argument('[path]', 'Path to the repository root', '.')
  .requiredOption('--target <platform>', 'Target platform: github-actions | gitlab-ci')
  .option('--output <path>', 'Override the output file path')
  .option('--dry-run', 'Print what would be generated without writing any files')
  .option('--interactive', 'Walk through generation choices interactively')
  .option(
    '--monorepo-strategy <strategy>',
    'Monorepo strategy: single | per-project | fan-out',
    'auto',
  )
  .action(async (repoPath: string, options) => {
    try {
      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(repoPath);

      logger.info(`Generating pipeline (target: ${options.target})`);
      const pipeline = generatePipeline(manifest);

      // Phase 4 will render to YAML — for now emit the Pipeline model as JSON
      if (options.dryRun) {
        logger.info('Dry run — pipeline that would be generated:');
      }
      console.log(JSON.stringify(pipeline, null, 2));
    } catch (err) {
      logger.error(`Generation failed: ${String(err)}`);
      process.exit(1);
    }
  });
