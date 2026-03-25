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
  GitHubFileSystem,
  parseGitHubUrl,
} from '@pipeline-gen/core';
import type { GeneratorOptions, SupportedPlatform, FileSystem } from '@pipeline-gen/core';
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
      // ── Resolve filesystem ─────────────────────────────────────────────────
      let fs: FileSystem | undefined;
      let resolvedPath = repoPath;
      let vcsInfo = undefined;

      if (repoPath.startsWith('https://github.com/') || repoPath.startsWith('http://github.com/')) {
        logger.info(`Fetching repository from GitHub: ${repoPath}`);
        const info = parseGitHubUrl(repoPath);
        const token = process.env.GITHUB_TOKEN;
        fs = new GitHubFileSystem(info.owner, info.repo, info.ref, token, info.subdir);
        vcsInfo = await GitHubFileSystem.fetchVCSInfo(info.owner, info.repo, token);
        resolvedPath = info.subdir ? `/${info.subdir}` : '/';
      }

      logger.info(`Analyzing repository at: ${repoPath}`);
      const manifest = await analyzeRepo(resolvedPath, fs, vcsInfo);

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
      const { plugins, rc } = await loadPlugins(resolvedPath, fs);
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
      const isRemote = fs !== undefined;
      const outputPath = opts.output
        ? resolve(opts.output)
        : isRemote
          ? renderer.outputPath(pipeline)
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
      if (isRemote) {
        logger.info('Remote repository — use --dry-run to preview. Use a local clone to write files.');
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
