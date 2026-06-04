import * as fs from 'fs';
import * as path from 'path';
import { collectUserPaths } from './UserPaths';

export interface TemplateDeployResult {
  /** Absolute target directory templates are deployed into. */
  targetDir: string;
  /** Filenames copied — newly created, or refreshed because the bundled
   *  content differed from the existing file. */
  deployed: string[];
  /** Filenames left untouched (already present with identical content). */
  skipped: string[];
  /** Non-fatal problems (e.g. permission denied). Deploy never throws. */
  errors: string[];
}

export interface DeployBundledTemplatesOptions {
  /**
   * Directory holding the bundled .hwpx templates. Defaults to the `assets/`
   * folder next to the server bundle (`<bundle>/assets`). In a `.mcpb` install
   * the compiled entry lives at `<ext>/server/index.js`, so assets resolve to
   * `<ext>/assets`. In a plain npm install this folder does not exist (npm only
   * ships `dist/`), so deploy is a silent no-op there.
   */
  assetsDir?: string;
  /** Override the deploy target (used in tests). Defaults to the user's
   *  Documents/skills/templates via collectUserPaths(). */
  targetDir?: string;
}

/**
 * Copy templates bundled inside the `.mcpb` extension into the user's templates
 * folder, so a one-click install also lands the document templates the skill
 * expects — without a separate installer step. Runs on every server start (see
 * caller), which makes it the update channel too.
 *
 * Design:
 * - Refresh-if-changed. A missing file is created; an existing file is
 *   overwritten only when the bundled content differs (compared byte-for-byte),
 *   so shipping a new `.mcpb` propagates template updates to installs that
 *   already have the old (same-named) file on the next start, while identical
 *   files are left untouched (idempotent, no churn). These are read-only form
 *   templates (users fill them and save the result elsewhere), so refreshing
 *   the canonical copy is the intended behaviour, not data loss.
 * - Scoped to the bundled filenames only. The loop iterates the *bundle's*
 *   templates, never the target folder, so a file the user created under any
 *   other name is never read, overwritten, or removed — only these managed
 *   template(s) are refreshed. (An in-place edit to a managed template is
 *   intentionally replaced; to customise, copy it to a new filename.)
 * - Never throws. A locked-down FS must not break server startup; problems are
 *   collected into `errors` and logged by the caller.
 * - Logs go to stderr only — stdout is the MCP stdio protocol channel.
 */
/** True when both paths hold byte-identical content (cheap size check first). */
function sameContent(a: string, b: string): boolean {
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) return false;
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

export function deployBundledTemplates(
  opts: DeployBundledTemplatesOptions = {},
): TemplateDeployResult {
  const assetsDir = opts.assetsDir ?? path.resolve(__dirname, '..', 'assets');
  const targetDir = opts.targetDir ?? collectUserPaths().templates_dir;

  const result: TemplateDeployResult = {
    targetDir,
    deployed: [],
    skipped: [],
    errors: [],
  };

  let entries: string[];
  try {
    entries = fs
      .readdirSync(assetsDir)
      .filter((name) => name.toLowerCase().endsWith('.hwpx'));
  } catch {
    // No bundled assets (e.g. npm install, or assets dir absent) → no-op.
    return result;
  }

  if (entries.length === 0) return result;

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    result.errors.push(`mkdir ${targetDir}: ${(err as Error).message}`);
    return result;
  }

  for (const name of entries) {
    const src = path.join(assetsDir, name);
    const dest = path.join(targetDir, name);
    try {
      // Skip only when the existing file already matches the bundle; otherwise
      // create it (missing) or refresh it (content changed), so a template
      // update shipped in a new .mcpb reaches installs that still hold the old
      // same-named file.
      if (fs.existsSync(dest) && sameContent(src, dest)) {
        result.skipped.push(name);
        continue;
      }
      // Atomic refresh: copy to a temp file in the same dir, then rename over
      // the destination. A same-dir rename is atomic, so a crash mid-copy can
      // never leave a half-written template, and it replaces a symlink entry
      // instead of writing through it. Clean the temp up if the rename fails.
      const tmp = `${dest}.tmp-${process.pid}`;
      fs.copyFileSync(src, tmp);
      try {
        fs.renameSync(tmp, dest);
      } catch (err) {
        try { fs.unlinkSync(tmp); } catch { /* best-effort cleanup */ }
        throw err;
      }
      result.deployed.push(name);
    } catch (err) {
      result.errors.push(`copy ${name}: ${(err as Error).message}`);
    }
  }

  return result;
}
