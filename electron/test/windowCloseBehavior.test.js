const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('main process supports hide-to-background close behavior', () => {
  assert.match(mainSource, /let windowCloseBehavior = 'quit'/);
  assert.match(mainSource, /desktop:window-close-behavior:update/);
  assert.match(mainSource, /windowCloseBehavior === 'hide'/);
  assert.match(mainSource, /mainWindow\.hide\(\)/);
});

test('preload allows renderer to update close button behavior', () => {
  assert.match(preloadSource, /desktop:window-close-behavior:update/);
});
