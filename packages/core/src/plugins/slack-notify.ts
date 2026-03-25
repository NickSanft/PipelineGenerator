import type { Pipeline, Step } from '../types/pipeline.js';
import type { Plugin } from './base.js';

export interface SlackNotifyConfig {
  /** Slack channel to post to (e.g. "#deploys") */
  channel: string;
  /** Also notify on success (default: false — failure only) */
  onSuccess?: boolean;
}

const SLACK_ACTION_SHA = 'b0082d7e816d9ead4fb7f8e63c03b53e7c59e672'; // slackapi/slack-github-action@v2.0.0

/**
 * Slack Notification plugin — appends Slack notification steps to every job
 * in the last stage (typically the deploy stage).
 *
 * Uses `slackapi/slack-github-action` with the Slack Bot Token method.
 * Expects `SLACK_BOT_TOKEN` to be set as a repository secret.
 */
export function createSlackNotifyPlugin(config: SlackNotifyConfig): Plugin {
  return {
    name: 'slack-notify',
    description: 'Adds Slack notifications to the deploy/final stage',
    hooks: {
      afterGenerate(pipeline: Pipeline): Pipeline {
        if (pipeline.stages.length === 0) return pipeline;

        const failureStep: Step = {
          name: 'Notify Slack on failure',
          type: 'action',
          action: 'slackapi/slack-github-action',
          actionVersion: SLACK_ACTION_SHA,
          condition: 'failure()',
          env: { SLACK_BOT_TOKEN: '${{ secrets.SLACK_BOT_TOKEN }}' },
          with: {
            channel: config.channel,
            text: ':x: *${{ github.workflow }}* failed on `${{ github.ref_name }}` — <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View run>',
          },
        };

        const successStep: Step = {
          name: 'Notify Slack on success',
          type: 'action',
          action: 'slackapi/slack-github-action',
          actionVersion: SLACK_ACTION_SHA,
          condition: 'success()',
          env: { SLACK_BOT_TOKEN: '${{ secrets.SLACK_BOT_TOKEN }}' },
          with: {
            channel: config.channel,
            text: ':white_check_mark: *${{ github.workflow }}* succeeded on `${{ github.ref_name }}`',
          },
        };

        const stepsToAdd: Step[] = config.onSuccess
          ? [failureStep, successStep]
          : [failureStep];

        const lastIdx = pipeline.stages.length - 1;
        const updatedStages = pipeline.stages.map((stage, idx) => {
          if (idx !== lastIdx) return stage;
          return {
            ...stage,
            jobs: stage.jobs.map((job) => ({
              ...job,
              steps: [...job.steps, ...stepsToAdd],
            })),
          };
        });

        return { ...pipeline, stages: updatedStages };
      },
    },
  };
}
