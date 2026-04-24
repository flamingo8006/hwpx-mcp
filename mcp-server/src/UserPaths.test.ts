import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { collectUserPaths } from './UserPaths';

describe('collectUserPaths', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'userpaths-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns home / documents / downloads / templates_dir for the given home', () => {
    const r = collectUserPaths({ home: tmpHome, platform: 'win32', username: 'testuser' });
    expect(r.home).toBe(tmpHome);
    expect(r.os).toBe('win32');
    expect(r.username).toBe('testuser');
    expect(r.documents).toBe(path.join(tmpHome, 'Documents'));
    expect(r.downloads).toBe(path.join(tmpHome, 'Downloads'));
    expect(r.templates_dir).toBe(path.join(tmpHome, 'Documents', 'skills', 'templates'));
  });

  it('reports templates_dir_exists=false and templates=[] when the dir is absent', () => {
    const r = collectUserPaths({ home: tmpHome });
    expect(r.templates_dir_exists).toBe(false);
    expect(r.templates).toEqual([]);
  });

  it('lists only .hwpx regular files in the templates dir, sorted locale-aware', () => {
    const tplDir = path.join(tmpHome, 'Documents', 'skills', 'templates');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'bravo.hwpx'),   'b');
    fs.writeFileSync(path.join(tplDir, 'alpha.hwpx'),   'a');
    fs.writeFileSync(path.join(tplDir, 'notes.md'),     'skipped-extension');
    fs.writeFileSync(path.join(tplDir, 'no-ext'),       'skipped-no-extension');
    // Directory that happens to end in .hwpx — must not be listed.
    fs.mkdirSync(path.join(tplDir, 'looks-like-template.hwpx'));

    const r = collectUserPaths({ home: tmpHome });
    expect(r.templates_dir_exists).toBe(true);
    expect(r.templates.map(t => t.filename)).toEqual(['alpha.hwpx', 'bravo.hwpx']);
    expect(r.templates[0].path).toBe(path.join(tplDir, 'alpha.hwpx'));
    expect(r.templates[0].size).toBe(1);
  });

  it('handles Hangul filenames (the common DGIST template)', () => {
    const tplDir = path.join(tmpHome, 'Documents', 'skills', 'templates');
    fs.mkdirSync(tplDir, { recursive: true });
    const hangulName = '공문서_프레임.hwpx';
    fs.writeFileSync(path.join(tplDir, hangulName), 'stub-bytes');

    const r = collectUserPaths({ home: tmpHome });
    const tpl = r.templates.find(t => t.filename === hangulName);
    expect(tpl).toBeDefined();
    expect(tpl!.path).toBe(path.join(tplDir, hangulName));
    expect(tpl!.size).toBe(10);
  });

  it('is case-insensitive about the .hwpx extension', () => {
    const tplDir = path.join(tmpHome, 'Documents', 'skills', 'templates');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'UPPER.HWPX'),  'x');
    fs.writeFileSync(path.join(tplDir, 'mixed.HwpX'),  'y');
    fs.writeFileSync(path.join(tplDir, 'lower.hwpx'),  'z');

    const r = collectUserPaths({ home: tmpHome });
    expect(r.templates.map(t => t.filename).sort()).toEqual(['UPPER.HWPX', 'lower.hwpx', 'mixed.HwpX']);
  });

  it('falls back gracefully when home itself does not exist (no throw)', () => {
    const ghost = path.join(tmpHome, 'does', 'not', 'exist');
    const r = collectUserPaths({ home: ghost });
    expect(r.home).toBe(ghost);
    expect(r.templates_dir_exists).toBe(false);
    expect(r.templates).toEqual([]);
  });

  it('populates username from os.userInfo() when not overridden', () => {
    const r = collectUserPaths({ home: tmpHome });
    // Can't assert the exact value (depends on test host), but it should be
    // a non-empty string on any real CI / dev environment.
    expect(typeof r.username).toBe('string');
  });
});
