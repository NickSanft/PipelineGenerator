import { codeToHtml } from 'shiki';

/**
 * Server-side YAML syntax highlighting using Shiki.
 * Returns an HTML string with inline styles — zero client JS.
 */
export async function highlightYaml(yaml: string): Promise<string> {
  return codeToHtml(yaml, {
    lang: 'yaml',
    theme: 'github-dark-dimmed',
  });
}
