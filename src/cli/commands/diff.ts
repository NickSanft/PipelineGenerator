import { Command } from 'commander';
import { logger } from '../../utils/logger.js';

export const diffCommand = new Command('diff')
  .description('Compare an existing pipeline config to what would be generated')
  .argument('[path]', 'Path to the repository root', '.')
  .option('--target <platform>', 'Target platform: github-actions | gitlab-ci')
  .action((repoPath: string, options) => {
    logger.info(`Diffing pipeline for: ${repoPath}`);
    if (options.target) {
      logger.info(`Target platform: ${options.target}`);
    }
    console.log('Diff not yet implemented');
  });
