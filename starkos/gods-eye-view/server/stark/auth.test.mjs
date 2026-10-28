import assert from 'node:assert/strict';
import test from 'node:test';
import { addonEntryRedirect, addonEntryUrl } from './auth.js';

test('Home Assistant add-on enters STARK OS and opens WORLD explicitly', () => {
  assert.equal(addonEntryRedirect('/', true), './stark/');
  assert.equal(addonEntryRedirect('/?ingress=1', true), './stark/');
  assert.equal(addonEntryRedirect('/?world=1', true), null);
  assert.equal(
    addonEntryUrl('/?world=1&embed=1', true),
    '/index.html?world=1&embed=1',
  );
  assert.equal(addonEntryUrl('/world?embed=1', true), '/index.html?embed=1');
  assert.equal(addonEntryUrl('/stark/', true), '/stark/');
});

test("standalone development keeps the original God's Eye root", () => {
  assert.equal(addonEntryUrl('/?embed=1', false), '/?embed=1');
});
