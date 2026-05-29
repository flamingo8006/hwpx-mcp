import * as fs from 'fs';
import * as path from 'path';
import { collectUserPaths } from './UserPaths';

export interface TemplateDeployResult {
  /** Absolute target directory templates are deployed into. */
  targetDir: string;
  /** Filenames newly copied (were missing). */
  deployed: string[];
  /** Filenames left untouched (already present — never overwritten). */
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
 * Copy templates bundled inside the `.mcpb` extension into the user's
 * templates folder on first run, so a one-click install also lands the
 * document templates the skill expects — without a separate installer step.
 *
 * Design:
 * - Copy-if-missing only. An existing file is never overwritten, so a user's
 *   customised template survives. (Trade-off: existing users won't pick up
 *   template content updates this way — bump filename or handle separately.)
 * - Never throws. A locked-down FS must not break server startup; problems are
 *   collected into `errors` and logged by the caller.
 * - Logs go to stderr only — stdout is the MCP stdio protocol channel.
 */
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
    const dest = path.join(targetDir, name);
    try {
      // COPYFILE_EXCL makes "copy only if missing" atomic — no check-then-copy
      // race that could clobber a file appearing between the two steps.
      fs.copyFileSync(path.join(assetsDir, name), dest, fs.constants.COPYFILE_EXCL);
      result.deployed.push(name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        result.skipped.push(name);
      } else {
        result.errors.push(`copy ${name}: ${(err as Error).message}`);
      }
    }
  }

  return result;
}
