import type { ProjectManifest } from '@pipeline-gen/core';

interface Props {
  manifest: ProjectManifest;
  meta: { owner: string; repo: string; ref: string; analyzedAt: string };
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="w-36 shrink-0 text-[var(--muted)] text-sm">{label}</span>
      <span className="text-[var(--text)] text-sm font-mono">{value}</span>
    </div>
  );
}

export function AnalysisPanel({ manifest, meta }: Props) {
  const project = manifest.projects[0];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[var(--muted)] mb-3">
          {meta.owner}/{meta.repo} @ {meta.ref} · analyzed{' '}
          {new Date(meta.analyzedAt).toLocaleTimeString()}
        </p>
        {manifest.projects.length > 1 && (
          <p className="text-xs text-[var(--accent)] mb-3">
            {manifest.projects.length} projects detected (showing first)
          </p>
        )}
      </div>

      {project ? (
        <div>
          <Row label="Language" value={project.language} />
          <Row label="Framework" value={project.framework} />
          <Row label="Package manager" value={project.packageManager} />
          <Row label="Test runner" value={project.testRunner} />
          <Row label="Build tool" value={project.buildTool} />
          <Row label="Dockerfile" value={project.hasDockerfile ? 'yes' : 'no'} />
          <Row
            label="Deploy targets"
            value={project.deploymentTargets.map((d) => d.type).join(', ') || undefined}
          />
          <Row label="Artifacts" value={project.artifacts.join(', ')} />
          <Row label="Default branch" value={manifest.vcs.defaultBranch} />
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">No projects detected.</p>
      )}
    </div>
  );
}
