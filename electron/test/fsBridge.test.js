const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createFsBridge } = require('../fsBridge');

test('fsBridge creates and updates a markdown note in the local vault', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();

  const created = await bridge.createNote({
    title: 'Bridge Test',
    content: '<p>Hello</p>',
    type: 'note',
    tags: ['one'],
    background_paper: 'grid',
  });

  assert.equal(created.title, 'Bridge Test');
  assert.equal(created.background_paper, 'grid');

  const notePath = path.join(tempRoot, 'Notes', 'Bridge Test.md');
  const raw = await fs.readFile(notePath, 'utf8');
  assert.match(raw, /Bridge Test/);

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    content: '<p>Updated</p>',
    title: 'Bridge Test Renamed',
    rename_file: true,
  });

  assert.equal(updated.title, 'Bridge Test Renamed');
  const renamedPath = path.join(tempRoot, 'Notes', 'Bridge Test Renamed.md');
  const renamedRaw = await fs.readFile(renamedPath, 'utf8');
  assert.match(renamedRaw, /Updated/);
});

test('fsBridge updates note title metadata without renaming file unless explicitly requested', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();

  const created = await bridge.createNote({
    title: 'Untitled',
    content: '<p>Hello</p>',
    type: 'note',
  });

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    file_path: created.file_path,
    title: 'Live Editor Title',
    content: '<p>Hello world</p>',
  });

  assert.equal(updated.title, 'Live Editor Title');
  assert.equal(updated.file_path, created.file_path);

  const originalRaw = await fs.readFile(created.file_path, 'utf8');
  assert.match(originalRaw, /Live Editor Title/);
  await assert.doesNotReject(() => fs.access(created.file_path));
  await assert.rejects(() => fs.access(path.join(tempRoot, 'Notes', 'Live Editor Title.md')));
});

test('fsBridge renames a mismatched markdown file when rename_file is requested even if the title already matches metadata', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();

  const created = await bridge.createNote({
    title: 'Final Title',
    content: '<p>Hello</p>',
    type: 'note',
  });

  const wrongPath = path.join(tempRoot, 'Notes', 'Wrong Name.md');
  await fs.rename(created.file_path, wrongPath);

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    file_path: wrongPath,
    title: 'Final Title',
    rename_file: true,
  });

  const expectedPath = path.join(tempRoot, 'Notes', 'Final Title.md');
  assert.equal(updated.file_path, expectedPath);
  await assert.doesNotReject(() => fs.access(expectedPath));
  await assert.rejects(() => fs.access(wrongPath));
});

test('fsBridge creates folders as real directories', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const folder = await bridge.createFolder({
    title: 'Folder A',
    parent_id: null,
    tags: [],
    type: 'note',
  });

  assert.equal(folder.is_folder, true);
  const folderPath = path.join(tempRoot, 'Notes', 'Folder A');
  const stat = await fs.stat(folderPath);
  assert.equal(stat.isDirectory(), true);
});

test('fsBridge ignores suspicious raw-markdown titles during updates', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Canvas Safe Title',
    content: '{"version":"v1","nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    type: 'canvas',
  });

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    title: `---
id: 10
title: 测试画布
---

{"version":"v1","nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}`,
    content: '{"version":"v1","nodes":[{"id":"text-1"}],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
  });

  assert.equal(updated.title, 'Canvas Safe Title');
  assert.equal(updated.type, 'canvas');

  const expectedPath = path.join(tempRoot, 'Notes', 'Canvas Safe Title.md');
  const raw = await fs.readFile(expectedPath, 'utf8');
  assert.match(raw, /Canvas Safe Title/);
  assert.doesNotMatch(raw, /title: 测试画布\nicon:/);
});

test('fsBridge retries atomic note saves when Windows temporarily blocks the target file', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Canvas Retry',
    content: '{"version":"v1","nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    type: 'canvas',
  });

  const originalRename = fs.rename;
  let blockedAttempts = 0;

  fs.rename = async (sourcePath, targetPath) => {
    if (targetPath === created.file_path && sourcePath.endsWith('.tmp') && blockedAttempts < 2) {
      blockedAttempts += 1;
      const error = new Error('target file is locked');
      error.code = 'EPERM';
      throw error;
    }
    return originalRename(sourcePath, targetPath);
  };

  try {
    const updated = await bridge.updateNote(created.id, {
      id: created.id,
      file_path: created.file_path,
      content: '{"version":"v1","nodes":[{"id":"media-1"}],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    });

    assert.equal(blockedAttempts, 2);
    assert.equal(updated.type, 'canvas');

    const raw = await fs.readFile(created.file_path, 'utf8');
    assert.match(raw, /media-1/);
  } finally {
    fs.rename = originalRename;
  }
});

test('fsBridge falls back to direct write when atomic rename keeps failing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Canvas Fallback',
    content: '{"version":"v1","nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    type: 'canvas',
  });

  const originalRename = fs.rename;
  const originalWriteFile = fs.writeFile;
  let renameAttempts = 0;
  let directWriteAttempts = 0;

  fs.rename = async (sourcePath, targetPath) => {
    if (targetPath === created.file_path && sourcePath.endsWith('.tmp')) {
      renameAttempts += 1;
      const error = new Error('target file is locked forever');
      error.code = 'EPERM';
      throw error;
    }
    return originalRename(sourcePath, targetPath);
  };

  fs.writeFile = async (targetPath, content, encodingOrOptions) => {
    if (targetPath === created.file_path) {
      directWriteAttempts += 1;
    }
    return originalWriteFile(targetPath, content, encodingOrOptions);
  };

  try {
    const updated = await bridge.updateNote(created.id, {
      id: created.id,
      file_path: created.file_path,
      content: '{"version":"v1","nodes":[{"id":"media-fallback"}],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    });

    assert.equal(updated.type, 'canvas');
    assert.ok(renameAttempts >= 3);
    assert.ok(directWriteAttempts >= 1);

    const raw = await fs.readFile(created.file_path, 'utf8');
    assert.match(raw, /media-fallback/);

    const dirents = await fs.readdir(path.dirname(created.file_path));
    for (const entry of dirents) {
      assert.ok(!entry.endsWith('.tmp'));
    }
  } finally {
    fs.rename = originalRename;
    fs.writeFile = originalWriteFile;
  }
});

test('fsBridge repairs duplicate note ids in an existing vault', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const notesDir = path.join(tempRoot, 'Notes');
  await fs.mkdir(notesDir, { recursive: true });
  await fs.writeFile(
    path.join(notesDir, '.notebook.yml'),
    'id: 1\nname: Notes\nicon: "🗂"\ncreated_at: "2026-04-18T00:00:00.000Z"\ndeleted_at: null\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(notesDir, 'Note A.md'),
    `---
id: 7
title: "Note A"
icon: "📝"
type: "note"
tags: []
created_at: "2026-04-18T00:00:00.000Z"
updated_at: "2026-04-18T00:00:00.000Z"
deleted_at: null
summary: ""
sort_key: "m"
is_title_manually_edited: false
background_paper: "none"
stickers: []
sticky_notes: []
properties: []
links: []
original_rel_path: null
---

<p>A</p>`,
    'utf8',
  );
  await fs.writeFile(
    path.join(notesDir, 'Note B.md'),
    `---
id: 7
title: "Note B"
icon: "📝"
type: "note"
tags: []
created_at: "2026-04-18T00:00:00.000Z"
updated_at: "2026-04-18T00:00:00.000Z"
deleted_at: null
summary: ""
sort_key: "m"
is_title_manually_edited: false
background_paper: "none"
stickers: []
sticky_notes: []
properties: []
links: []
original_rel_path: null
---

<p>B</p>`,
    'utf8',
  );

  const bridge = createFsBridge({ vaultRoot: tempRoot });
  await bridge.ensureStructure();

  const notes = (await bridge.listNotes()).filter((note) => !note.is_folder);
  const ids = notes.map((note) => note.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('fsBridge can target a note directly by file_path without scanning by id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const first = await bridge.createNote({
    title: 'First Note',
    content: '<p>First</p>',
    type: 'note',
  });
  const second = await bridge.createNote({
    title: 'Second Note',
    content: '<p>Second</p>',
    type: 'note',
  });

  const duplicateIdRaw = (await fs.readFile(second.file_path, 'utf8')).replace(
    `id: ${second.id}`,
    `id: ${first.id}`,
  );
  await fs.writeFile(second.file_path, duplicateIdRaw, 'utf8');

  const updated = await bridge.updateNote(first.id, {
    id: first.id,
    file_path: second.file_path,
    title: 'Second Note Renamed',
    content: '<p>Second Updated</p>',
    rename_file: true,
  });

  assert.equal(updated.title, 'Second Note Renamed');
  await assert.rejects(() => fs.access(path.join(tempRoot, 'Notes', 'Second Note.md')));
  const renamedRaw = await fs.readFile(path.join(tempRoot, 'Notes', 'Second Note Renamed.md'), 'utf8');
  assert.match(renamedRaw, /Second Updated/);

  const firstRaw = await fs.readFile(first.file_path, 'utf8');
  assert.match(firstRaw, /First/);
});

test('fsBridge updates a note by file_path even when the cached note id is stale', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Stale Id Note',
    content: '<p>Before</p>',
    type: 'note',
  });

  const rewrittenRaw = (await fs.readFile(created.file_path, 'utf8')).replace(
    `id: ${created.id}`,
    `id: ${created.id + 10}`,
  );
  await fs.writeFile(created.file_path, rewrittenRaw, 'utf8');

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    file_path: created.file_path,
    content: '<p>After</p>',
  });

  assert.equal(updated.id, created.id + 10);
  const raw = await fs.readFile(created.file_path, 'utf8');
  assert.match(raw, /After/);
});

test('fsBridge falls back cleanly when payload file_path is already missing on disk', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Original Path',
    content: '<p>Hello</p>',
    type: 'note',
  });

  const movedPath = path.join(tempRoot, 'Notes', 'Moved Elsewhere.md');
  await fs.rename(created.file_path, movedPath);

  const updated = await bridge.updateNote(created.id, {
    id: created.id,
    file_path: created.file_path,
    title: 'Recovered By Id',
    content: '<p>Recovered</p>',
    rename_file: true,
  });

  assert.equal(updated.title, 'Recovered By Id');
  await assert.doesNotReject(() => fs.access(updated.file_path));
  const raw = await fs.readFile(updated.file_path, 'utf8');
  assert.match(raw, /Recovered/);
});

test('fsBridge falls back to copy-delete when note rename keeps hitting Windows EPERM', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Rename Fallback',
    content: '<p>Before rename</p>',
    type: 'note',
  });

  const expectedPath = path.join(tempRoot, 'Notes', 'Rename Fallback Final.md');
  const originalRename = fs.rename;

  fs.rename = async (sourcePath, targetPath) => {
    if (sourcePath === created.file_path && targetPath === expectedPath) {
      const error = new Error('rename target is locked');
      error.code = 'EPERM';
      throw error;
    }
    return originalRename(sourcePath, targetPath);
  };

  try {
    const updated = await bridge.updateNote(created.id, {
      id: created.id,
      file_path: created.file_path,
      title: 'Rename Fallback Final',
      rename_file: true,
    });

    assert.equal(updated.file_path, expectedPath);
    await assert.doesNotReject(() => fs.access(expectedPath));
    await assert.rejects(() => fs.access(created.file_path));

    const raw = await fs.readFile(expectedPath, 'utf8');
    assert.match(raw, /Before rename/);
    assert.match(raw, /Rename Fallback Final/);
  } finally {
    fs.rename = originalRename;
  }
});

test('fsBridge serializes concurrent save and rename updates for the same note', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const created = await bridge.createNote({
    title: 'Concurrent Draft',
    content: '<p>Initial</p>',
    type: 'note',
  });

  const [renamed] = await Promise.all([
    bridge.updateNote(created.id, {
      id: created.id,
      file_path: created.file_path,
      title: 'Concurrent Final',
      rename_file: true,
    }),
    bridge.updateNote(created.id, {
      id: created.id,
      file_path: created.file_path,
      content: '<p>After race</p>',
    }),
  ]);

  const expectedPath = path.join(tempRoot, 'Notes', 'Concurrent Final.md');
  assert.equal(renamed.file_path, expectedPath);
  await assert.doesNotReject(() => fs.access(expectedPath));
  await assert.rejects(() => fs.access(created.file_path));

  const reloaded = await bridge.getNote(created.id);
  assert.equal(reloaded.file_path, expectedPath);
  assert.equal(reloaded.title, 'Concurrent Final');
  assert.match(reloaded.content || '', /After race/);
});

test('fsBridge keeps concurrent rename_file updates from colliding on the same target title', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const first = await bridge.createNote({
    title: '未命名笔记 2',
    content: '<p>First</p>',
    type: 'note',
  });
  const second = await bridge.createNote({
    title: '未命名笔记 4',
    content: '<p>Second</p>',
    type: 'note',
  });
  const third = await bridge.createNote({
    title: 'Draft A',
    content: '<p>Third</p>',
    type: 'note',
  });

  const [renamedSecond, renamedThird] = await Promise.all([
    bridge.updateNote(second.id, {
      id: second.id,
      file_path: second.file_path,
      title: '未命名笔记 2',
      rename_file: true,
    }),
    bridge.updateNote(third.id, {
      id: third.id,
      file_path: third.file_path,
      title: '未命名笔记 2',
      rename_file: true,
    }),
  ]);

  assert.notEqual(renamedSecond.file_path, renamedThird.file_path);
  await assert.doesNotReject(() => fs.access(first.file_path));
  await assert.doesNotReject(() => fs.access(renamedSecond.file_path));
  await assert.doesNotReject(() => fs.access(renamedThird.file_path));
});

test('fsBridge persists backlink metadata so links survive restart', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-electron-'));
  const bridge = createFsBridge({ vaultRoot: tempRoot });

  await bridge.ensureStructure();
  const target = await bridge.createNote({
    title: 'Target Note',
    content: '<p>Target</p>',
    type: 'note',
  });

  await bridge.createNote({
    title: 'Source Note',
    content: `<p><span data-id="${target.id}">[[Target Note]]</span></p>`,
    type: 'note',
  });

  const reloadedBridge = createFsBridge({ vaultRoot: tempRoot });
  await reloadedBridge.ensureStructure();

  const notes = await reloadedBridge.listNotes({ includeContent: false });
  const source = notes.find((note) => note.title === 'Source Note');

  assert.deepEqual(source?.links, [target.id]);
});
