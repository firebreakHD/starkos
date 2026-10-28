#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const localReferences = (html) =>
  [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value) => !/^(?:[a-z]+:|#|\/\/)/i.test(value));
const rootAbsoluteReferences = (html) =>
  [...html.matchAll(/\b(?:href|src)=["'](\/[^/][^"']*)["']/gi)].map(
    (match) => match[1],
  );

const world = read('dist/index.html');
const stark = read('dist/stark/index.html');

assert.doesNotMatch(world, /\/@vite\/client/, 'dev client leaked into build');
assert.deepEqual(
  rootAbsoluteReferences(world),
  [],
  'WORLD contains root-absolute assets that escape Home Assistant Ingress',
);
assert.deepEqual(
  rootAbsoluteReferences(stark),
  [],
  'STARK contains root-absolute assets that escape Home Assistant Ingress',
);

for (const [document, html] of [
  ['WORLD', world],
  ['STARK', stark],
]) {
  const references = localReferences(html);
  assert.ok(references.length, `${document} has no local assets`);
  for (const reference of references) {
    const pathname = reference.split(/[?#]/, 1)[0];
    const target = path.resolve(
      root,
      'dist',
      document === 'STARK' ? 'stark' : '',
      pathname,
    );
    assert.ok(existsSync(target), `${document} asset is missing: ${reference}`);
  }
}

assert.match(world, /\.\/assets\/[^"']+\.css/, 'WORLD CSS is not relative');
assert.match(world, /\.\/assets\/[^"']+\.js/, 'WORLD module is not relative');
assert.match(stark, /href=["']\.\/stark\.css["']/, 'STARK CSS is not relative');
assert.match(stark, /src=["']\.\/app\.js["']/, 'STARK module is not relative');

console.log('Ingress build assets are relative and present.');
