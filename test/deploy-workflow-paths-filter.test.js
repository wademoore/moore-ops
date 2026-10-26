import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW_PATH = '.github/workflows/deploy.yml';
const BUILD_STEP = 'Build zip package';

const read = path => readFileSync(`${ROOT}${path}`, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const workflow = () => read(WORKFLOW_PATH);

const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 })
    .toString('utf8').split('\0').filter(Boolean)
    .filter(path => existsSync(`${ROOT}${path}`));

const quoted = raw => raw.trim().replace(/^(['"])(.*)\1$/, '$2');

function triggerBlock(text) {
  const start = text.indexOf('\non:\n');
  assert.notEqual(start, -1, 'workflow has no on: block');
  const rest = text.slice(start + 1);
  const end = rest.slice(3).search(/^\S/m);
  return end === -1 ? rest : rest.slice(0, end + 3);
}

function pushPaths(text) {
  const push = /^ {2}push:\n((?: {4,}.*\n|\n)*)/m.exec(triggerBlock(text) + '\n');
  assert.ok(push, 'workflow has no push trigger');
  const paths = /^ {4}paths:\n((?: {6}- .*\n)+)/m.exec(push[1]);
  assert.ok(paths, 'push trigger has no paths filter');
  return [...paths[1].matchAll(/^ {6}- (.*)$/gm)].map(match => quoted(match[1]));
}

function stepSource(text, name) {
  const marker = `      - name: ${name}\n`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `workflow has no step named ${name}`);
  const rest = text.slice(start + marker.length);
  const next = rest.search(/^ {6}- name:|^ {2}\S/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function zipExcludes(text) {
  const step = stepSource(text, BUILD_STEP);
  assert.match(step, /zip -r function\.zip \.(\s|\\)/, 'build step does not zip the checkout root');
  return [...step.matchAll(/--exclude\s+"([^"]+)"/g)].map(match => match[1]);
}

const escape = char => char.replace(/[.+^${}()|[\]\\]/g, '\\$&');

function zipMatcher(pattern) {
  let source = '';
  for (const char of pattern) source += char === '*' ? '.*' : char === '?' ? '.' : escape(char);
  return new RegExp(`^${source}$`, 's');
}

function filterMatcher(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') { source += '.*'; i += 1; }
    else if (pattern[i] === '*') source += '[^/]*';
    else if (pattern[i] === '?') source += '[^/]';
    else source += escape(pattern[i]);
  }
  return new RegExp(`^${source}$`, 's');
}

function filterIncludes(patterns, path) {
  let included = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (filterMatcher(negated ? pattern.slice(1) : pattern).test(path)) included = !negated;
  }
  return included;
}

function packaged(excludes, files) {
  const matchers = excludes.map(zipMatcher);
  return files.filter(path => !matchers.some(matcher => matcher.test(path)));
}

function executedScripts(text) {
  const seen = new Set();
  const queue = [...text.matchAll(/\bnode\s+(\S+\.(?:m?js|cjs))/g)].map(match => posix.normalize(match[1]));
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    if (!existsSync(`${ROOT}${path}`)) continue;
    const source = read(path);
    const specifiers = [...source.matchAll(/(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)];
    for (const match of specifiers) queue.push(posix.join(dirname(path), match[1]));
  }
  return [...seen];
}

describe('deploy.yml — push paths filter against what the deploy packages and runs', () => {
  const text = workflow();
  const patterns = pushPaths(text);
  const excludes = zipExcludes(text);
  const files = trackedFiles();
  const bundle = packaged(excludes, files);

  it('triggers for every file the zip step packages', () => {
    const missed = bundle.filter(path => !filterIncludes(patterns, path));
    assert.deepEqual(missed, [], 'packaged files outside the push paths filter');
  });

  it('triggers for the workflow file itself', () => {
    assert.ok(filterIncludes(patterns, WORKFLOW_PATH));
  });

  it('triggers for the dependency manifest and lockfile that npm ci reads', () => {
    for (const path of ['package.json', 'package-lock.json']) {
      assert.ok(files.includes(path), `${path} is not tracked`);
      assert.ok(filterIncludes(patterns, path), `${path} is outside the push paths filter`);
    }
  });

  it('triggers for every repository script a step executes, and what it imports', () => {
    const scripts = executedScripts(text);
    assert.ok(scripts.length > 0, 'no executed script found in the workflow');
    const missed = scripts.filter(path => !filterIncludes(patterns, path));
    assert.deepEqual(missed, [], 'executed scripts outside the push paths filter');
  });

  it('uses no repository-local action, whose files the filter would also have to cover', () => {
    assert.doesNotMatch(text, /^\s*(?:- )?uses:\s*\.\//m);
  });

  it('does not trigger for a path the zip step excludes, other than the workflow file', () => {
    const inputs = new Set([WORKFLOW_PATH, 'package.json', 'package-lock.json', ...executedScripts(text)]);
    const probes = excludes.map(pattern => pattern.replaceAll('*', 'x'));
    const unpackaged = [...files.filter(path => !bundle.includes(path)), ...probes];
    const triggering = unpackaged.filter(path => !inputs.has(path) && filterIncludes(patterns, path));
    assert.deepEqual(triggering, [], 'unpackaged paths that still trigger a deploy');
  });

  it('keeps workflow_dispatch as a trigger and does not restrict it with paths', () => {
    assert.match(triggerBlock(text), /^ {2}workflow_dispatch:\s*$/m);
    assert.match(triggerBlock(text), /^ {2}push:\n(?: {4,}.*\n)*? {4}branches:\n {6}- main\n/m);
  });
});

describe('deploy.yml — filter matcher model', () => {
  it('lets a later positive pattern re-include a path an earlier negative removed', () => {
    const patterns = ['**', '!.github/**', '.github/workflows/deploy.yml'];
    assert.equal(filterIncludes(patterns, '.github/workflows/deploy.yml'), true);
    assert.equal(filterIncludes(patterns, '.github/workflows/ci.yml'), false);
    assert.equal(filterIncludes(['**', '.github/workflows/deploy.yml', '!.github/**'], '.github/workflows/deploy.yml'), false);
  });

  it('keeps * inside one path segment and ** across segments', () => {
    assert.equal(filterIncludes(['*.js'], 'a.js'), true);
    assert.equal(filterIncludes(['*.js'], 'dir/a.js'), false);
    assert.equal(filterIncludes(['**.js'], 'dir/a.js'), true);
  });

  it('anchors zip exclude patterns to the whole path, with * crossing separators', () => {
    assert.equal(zipMatcher('test/*').test('test/a/b.js'), true);
    assert.equal(zipMatcher('test/*').test('x/test/a.js'), false);
    assert.equal(zipMatcher('*.log').test('a/b.log'), true);
  });
});
