import { Command } from 'commander';
import { analyzeRepo } from '../../analyzers/registry.js';
import { logger } from '../../utils/logger.js';

export const analyzeCommand = new Command('analyze')
  .description('Analyze a repository and print the project manifest as JSON')
  .argument('[path]', 'Path to the repository root', '.')
  .action(async (repoPath: string) => {
    try {
      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(repoPath);
      console.log(JSON.stringify(manifest, null, 2));
    } catch (err) {
      logger.error(`Analysis failed: ${String(err)}`);
      process.exit(1);
    }
  });
