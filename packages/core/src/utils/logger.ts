import chalk from 'chalk';

let verbose = false;

export function setVerbose(enabled: boolean): void {
  verbose = enabled;
}

export const logger = {
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  },
  success(message: string): void {
    console.log(chalk.green('✔'), message);
  },
  warn(message: string): void {
    console.warn(chalk.yellow('⚠'), message);
  },
  error(message: string): void {
    console.error(chalk.red('✖'), message);
  },
  debug(message: string): void {
    if (verbose) {
      console.log(chalk.gray('[debug]'), message);
    }
  },
};
