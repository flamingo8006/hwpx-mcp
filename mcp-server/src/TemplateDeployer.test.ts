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
    fs.writeFileSync(path.join(assetsDir, '업무추진비_집행내역서.hwpx'), 'B');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed.sort()).toEqual(['공문서_프레임.hwpx', '업무추진비_집행내역서.hwpx']);
    expect(r.skipped).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(fs.readFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'utf8')).toBe('A');
    expect(fs.readFileSync(path.join(targetDir, '업무추진비_집행내역서.hwpx'), 'utf8')).toBe('B');
  });

  it('never overwrites an existing template (copy-if-missing)', () => {
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'NEW');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'USER-EDITED');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual([]);
    expect(r.skipped).toEqual(['공문서_프레임.hwpx']);
    expect(fs.readFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'utf8')).toBe('USER-EDITED');
  });

  it('deploys only the missing one when some already exist', () => {
    fs.writeFileSync(path.join(assetsDir, '공문서_프레임.hwpx'), 'A');
    fs.writeFileSync(path.join(assetsDir, '업무추진비_집행내역서.hwpx'), 'B');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '공문서_프레임.hwpx'), 'A');

    const r = deployBundledTemplates({ assetsDir, targetDir });

    expect(r.deployed).toEqual(['업무추진비_집행내역서.hwpx']);
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
