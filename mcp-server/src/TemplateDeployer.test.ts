import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deployBundledTemplates } from './TemplateDeployer';

let tmp: string;
let assetsDir: string;
let targetDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-deploy-'));
  assetsDir = path.join(tmp, 'assets');
  targetDir = path.join(tmp, 'Documents', 'skills', 'templates');
  fs.mkdirSync(assetsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('deployBundledTemplates', () => {
  it('copies templates that are missing in the target', () => {
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'A');
    fs.writeFileSync(path.join(assetsDir, '업무추진비류_집행내역서_서식.hwpx'), 'B');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed.sort()).toEqual(['공문서_프레임.hwpx', '업무추진비류_집행내역서_서식.hwpx']);
    expect(r.skipped).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(fs.readFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'utf8')).toBe('A');
    expect(fs.readFileSync(path.join(targetDir, '업무추진비류_집행내역서_서식.hwpx'), 'utf8')).toBe('B');
  });

  it('refreshes an existing template when the bundled content differs', () => {
    // Simulates a template update shipped in a new .mcpb reaching an install
    // that already has the old (same-named) file.
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'NEW');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'OLD');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual(['공문서_프레임.hwpx']);
    expect(r.skipped).toEqual([]);
    expect(fs.readFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'utf8')).toBe('NEW');
  });

  it('skips an existing template with identical content (idempotent)', () => {
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'SAME');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'SAME');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual([]);
    expect(r.skipped).toEqual(['공문서_프레임.hwpx']);
    expect(r.errors).toEqual([]);
  });

  it('deploys only the missing one when some already exist', () => {
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'A');
    fs.writeFileSync(path.join(assetsDir, '업무추진비류_집행내역서_서식.hwpx'), 'B');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'A');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual(['업무추진비류_집행내역서_서식.hwpx']);
    expect(r.skipped).toEqual(['공문서_프레임.hwpx']);
  });

  it('ignores non-.hwpx files in assets', () => {
    fs.writeFileSync(path.join(assetsDir, 'README.txt'), 'x');
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'A');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual(['공문서_프레임.hwpx']);
    expect(fs.existsSync(path.join(targetDir, 'README.txt'))).toBe(false);
  });

  it('is a no-op (no throw) when the assets dir is absent', () => {
    const r = deployBundledTemplates({
      assetsDir: path.join(tmp, 'does-not-exist'),
      targetDir,
    });

    expect(r.deployed).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});
