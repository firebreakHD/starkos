import assert from 'node:assert/strict';
import test from 'node:test';
import { addonEntryUrl } from './auth.js';

test('Home Assistant add-on enters STARK OS and opens WORLD explicitly', () => {
  assert.equal(addonEntryUrl('/', true), '/stark/index.html');
  assert.equal(
    addonEntryUrl('/?ingress=1', true),
    '/stark/index.html?ingress=1',
  );
  assert.equal(addonEntryUrl('/world?embed=1', true), '/index.html?embed=1');
  assert.equal(addonEntryUrl('/stark/', true), '/stark/');
});

test('standalone development keeps the original God\'s Eye root', () => {
  assert.equal(addonEntryUrl('/?embed=1', false), '/?embed=1');
});
