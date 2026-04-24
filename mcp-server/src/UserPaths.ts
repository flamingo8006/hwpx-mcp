import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface UserTemplateInfo {
  filename: string;
  path: string;
  size: number;
}

export interface UserPathsResult {
  os: NodeJS.Platform;
  username: string;
  home: string;
  documents: string;
  downloads: string;
  templates_dir: string;
  templates_dir_exists: boolean;
  templates: UserTemplateInfo[];
}

export interface CollectUserPathsOptions {
  /** Override home directory (used in tests). Defaults to os.homedir(). */
  home?: string;
  /** Override platform (used in tests). Defaults to process.platform. */
  platform?: NodeJS.Platform;
  /** Override username (used in tests). Defaults to os.userInfo().username. */
  username?: string;
}

/**
 * Collect absolute paths on the user's real filesystem that skills commonly
 * need (home, Documents, Downloads, Documents/skills/templates) plus the list
 * of .hwpx templates actually present on disk.
 *
 * This helper is the canonical answer to "where does the user keep their
 * files?" It exists so skills don't have to shell out to `echo $HOME`, which
 * in Claude Desktop runs inside a sandboxed Linux container where $HOME is
 * `/root` and the user's Windows/macOS files are invisible. The MCP server
 * itself runs under the user's real OS account, so `os.homedir()` here
 * reflects the actual user.
 */
export function collectUserPaths(opts: CollectUserPathsOptions = {}): UserPathsResult {
  const home = opts.home ?? os.homedir();
  const platform = opts.platform ?? process.platform;

  let username = opts.username ?? '';
  if (opts.username === undefined) {
    try { username = os.userInfo().username; }
    catch { /* sandboxed / locked-down env */ }
  }

  const documents = path.join(home, 'Documents');
  const downloads = path.join(home, 'Downloads');
  const templatesDir = path.join(documents, 'skills', 'templates');

  const templatesDirExists = (() => {
    try { return fs.statSync(templatesDir).isDirectory(); }
    catch { return false; }
  })();

  const templates: UserTemplateInfo[] = [];
  if (templatesDirExists) {
    try {
      for (const entry of fs.readdirSync(templatesDir)) {
        if (!entry.toLowerCase().endsWith('.hwpx')) continue;
        const full = path.join(templatesDir, entry);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            templates.push({ filename: entry, path: full, size: st.size });
          }
        } catch { /* skip unreadable entry */ }
      }
      templates.sort((a, b) => a.filename.localeCompare(b.filename));
    } catch { /* unreadable dir */ }
  }

  return {
    os: platform,
    username,
    home,
    documents,
    downloads,
    templates_dir: templatesDir,
    templates_dir_exists: templatesDirExists,
    templates,
  };
}
