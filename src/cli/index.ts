#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { generateCommand } from './commands/generate.js';
import { diffCommand } from './commands/diff.js';
import { setVerbose } from '../utils/logger.js';

const program = new Command();

program
  .name('pipeline-gen')
  .description('Analyze your repo. Generate your pipeline. Ship with confidence.')
  .version('0.1.0')
  .option('--verbose', 'Enable verbose/debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

program.addCommand(analyzeCommand);
program.addCommand(generateCommand);
program.addCommand(diffCommand);

program.parse();
