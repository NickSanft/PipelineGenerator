import { z } from 'zod';
import type { ProjectManifest, Pipeline } from '@pipeline-gen/core';

export const AnalyzeRequestSchema = z.object({
  url: z.string().url(),
  platform: z.enum(['github-actions', 'gitlab-ci']),
  token: z.string().optional(),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export interface AnalyzeResponse {
  manifest: ProjectManifest;
  pipeline: Pipeline;
  yaml: string;
  outputPath: string;
  meta: {
    owner: string;
    repo: string;
    ref: string;
    analyzedAt: string;
  };
}

export interface AnalyzeErrorResponse {
  error: string;
}
