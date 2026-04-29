const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');

const DEFAULT_NOTEBOOK_NAME = 'Notes';
const TRASH_DIR_NAME = '.trash';
const NOTEBOOK_META_NAME = '.notebook.yml';
const FOLDER_META_NAME = '.folder.yml';
const INTERNAL_DIRS = new Set([TRASH_DIR_NAME, '.nova', '_assets', '_templates']);

function nowIso() {
  return new Date().toISOString();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeContent(value) {
  return stripHtml(value).slice(0, 140);
}

function normalizeLegacyApiPath(rawValue) {
  if (typeof rawValue !== 'string') {
    return rawValue;
  }

  let value = rawValue.trim();
  if (!value) {
    return value;
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  value = value.replace(/\\/g, '/');

  if (/^file:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const pathname = decodeURIComponent(parsed.pathname || '');
      const fileApiMatch = pathname.match(/^\/?[A-Za-z]:\/api(\/.*)?$/i);
      if (fileApiMatch) {
        return `/api${fileApiMatch[1] || ''}`;
      }
      return value;
    } catch {
      value = value.replace(/^file:\/\/\/?/i, '/');
    }
  }

  const driveApiMatch = value.match(/^\/?[A-Za-z]:\/api(\/.*)?$/i);
  if (driveApiMatch) {
    return `/api${driveApiMatch[1] || ''}`;
  }

  const relativeApiMatch = value.match(/^\/?api(\/.*)?$/i);
  if (relativeApiMatch) {
    return `/api${relativeApiMatch[1] || ''}`;
  }

  return value;
}

const HTML_URL_ATTR_PATTERN = /(\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi;
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

function sanitizeLegacyApiUrlsInHtml(value) {
  if (typeof value !== 'string' || !value) {
    return value || '';
  }

  const normalizedHtml = value.replace(HTML_URL_ATTR_PATTERN, (full, prefix, quote, rawUrl) => {
    const normalized = normalizeLegacyApiPath(rawUrl);
    if (!normalized || normalized === rawUrl) {
      return full;
    }
    return `${prefix}${quote}${normalized}${quote}`;
  });

  return normalizedHtml.replace(CSS_URL_PATTERN, (full, quote, rawUrl) => {
    const normalized = normalizeLegacyApiPath(rawUrl);
    if (!normalized || normalized === rawUrl) {
      return full;
    }
    return `url(${quote}${normalized}${quote})`;
  });
}

function sanitizeStickers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }
    const next = { ...item };
    if (typeof next.url === 'string') {
      next.url = normalizeLegacyApiPath(next.url);
    }
    return next;
  });
}

function sanitizeStickyNotes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }
    const next = { ...item };
    if (typeof next.content === 'string') {
      next.content = sanitizeLegacyApiUrlsInHtml(next.content);
    }
    return next;
  });
}

const NOTE_LINK_PATTERNS = [
  /data-id="(\d+)"/g,
  /data-wiki-id="(\d+)"/g,
];

function extractLinkedNoteIds(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  const ids = new Set();
  for (const pattern of NOTE_LINK_PATTERNS) {
    for (const match of value.matchAll(pattern)) {
      const nextId = Number(match[1]);
      if (Number.isFinite(nextId)) {
        ids.add(nextId);
      }
    }
  }
  return Array.from(ids);
}

function looksLikeSerializedNoteFile(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.startsWith('---\n') && value.includes('\n---\n');
}

function looksLikeCanvasContent(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.nodes) &&
      (Array.isArray(parsed.edges) || (parsed.version && parsed.viewport))
    );
  } catch {
    return false;
  }
}

function normalizeTitle(value, fallback = 'Untitled') {
  const normalizedFallback = String(fallback || 'Untitled').trim() || 'Untitled';
  if (typeof value !== 'string') {
    return normalizedFallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return normalizedFallback;
  }

  if (
    trimmed.length > 200 ||
    trimmed.includes('\n') ||
    trimmed.includes('\r') ||
    looksLikeSerializedNoteFile(trimmed) ||
    looksLikeCanvasContent(trimmed)
  ) {
    return normalizedFallback;
  }

  return trimmed;
}

function sanitizeFilename(value) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();
  return cleaned || 'Untitled';
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isMissingPathError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value === 'null') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    value.startsWith('[') ||
    value.startsWith('{')
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // Fall back to the legacy parser below.
    }
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === '[]') {
    return [];
  }
  if (value === '{}') {
    return {};
  }
  return value;
}

function countIndent(line) {
  return line.length - line.trimStart().length;
}

function parseYamlLines(lines, startIndex, indent) {
  let index = startIndex;
  while (index < lines.length && (!lines[index].trim() || lines[index].trim() === '---')) {
    index += 1;
  }

  if (index >= lines.length || countIndent(lines[index]) < indent) {
    return { value: {}, index };
  }

  const currentLine = lines[index].trimStart();
  const isArray = currentLine.startsWith('- ');

  if (isArray) {
    const items = [];
    while (index < lines.length) {
      const rawLine = lines[index];
      if (!rawLine.trim()) {
        index += 1;
        continue;
      }
      const lineIndent = countIndent(rawLine);
      if (lineIndent < indent) {
        break;
      }
      if (lineIndent !== indent || !rawLine.trimStart().startsWith('- ')) {
        break;
      }

      const rest = rawLine.trimStart().slice(2);
      if (!rest) {
        const nested = parseYamlLines(lines, index + 1, indent + 2);
        items.push(nested.value);
        index = nested.index;
        continue;
      }

      if (rest.includes(':')) {
        const colonIndex = rest.indexOf(':');
        const key = rest.slice(0, colonIndex).trim();
        const tail = rest.slice(colonIndex + 1).trim();
        const item = {};
        if (tail) {
          item[key] = parseScalar(tail);
          index += 1;
        } else {
          const nested = parseYamlLines(lines, index + 1, indent + 4);
          item[key] = nested.value;
          index = nested.index;
        }

        while (index < lines.length) {
          const extraLine = lines[index];
          if (!extraLine.trim()) {
            index += 1;
            continue;
          }
          const extraIndent = countIndent(extraLine);
          if (extraIndent < indent + 2) {
            break;
          }
          if (extraIndent === indent && extraLine.trimStart().startsWith('- ')) {
            break;
          }

          const trimmed = extraLine.trimStart();
          if (trimmed.startsWith('- ')) {
            break;
          }

          const extraColonIndex = trimmed.indexOf(':');
          const extraKey = trimmed.slice(0, extraColonIndex).trim();
          const extraTail = trimmed.slice(extraColonIndex + 1).trim();
          if (extraTail) {
            item[extraKey] = parseScalar(extraTail);
            index += 1;
          } else {
            const nested = parseYamlLines(lines, index + 1, extraIndent + 2);
            item[extraKey] = nested.value;
            index = nested.index;
          }
        }

        items.push(item);
        continue;
      }

      items.push(parseScalar(rest));
      index += 1;
    }

    return { value: items, index };
  }

  const object = {};
  while (index < lines.length) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      index += 1;
      continue;
    }
    const lineIndent = countIndent(rawLine);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent !== indent) {
      break;
    }

    const trimmed = rawLine.trimStart();
    if (trimmed.startsWith('- ')) {
      break;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      index += 1;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const tail = trimmed.slice(colonIndex + 1).trim();
    if (tail) {
      object[key] = parseScalar(tail);
      index += 1;
      continue;
    }

    const nested = parseYamlLines(lines, index + 1, indent + 2);
    object[key] = nested.value;
    index = nested.index;
  }

  return { value: object, index };
}

function parseYamlLike(text) {
  try {
    return YAML.parse(text) || {};
  } catch {
    const { value } = parseYamlLines(text.replace(/\r\n/g, '\n').split('\n'), 0, 0);
    return value || {};
  }
}

function formatInlineValue(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function stringifyYamlLike(value, indent = 0) {
  if (indent === 0) {
    return YAML.stringify(value || {}, {
      indent: 2,
      lineWidth: 0,
    });
  }

  const spaces = ' '.repeat(indent);

  if (Array.isArray(value) || (value && typeof value === 'object' && indent > 0)) {
    return `${spaces}${formatInlineValue(value)}`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return `${spaces}{}`;
    }

    return entries
      .map(([key, item]) => `${spaces}${key}: ${formatInlineValue(item)}`)
      .join('\n');
  }

  return `${spaces}${formatInlineValue(value)}`;
}

function splitFrontmatter(raw) {
  if (!raw.startsWith('---\n')) {
    return { meta: {}, body: raw };
  }

  const separatorIndex = raw.indexOf('\n---\n', 4);
  if (separatorIndex === -1) {
    return { meta: {}, body: raw };
  }

  const metaText = raw.slice(4, separatorIndex);
  const body = raw.slice(separatorIndex + 5).replace(/^\n/, '');
  return {
    meta: parseYamlLike(metaText) || {},
    body,
  };
}

function serializeFrontmatter(meta, body) {
  return `---\n${stringifyYamlLike(meta).trimEnd()}\n---\n\n${body || ''}`;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const renameLocks = new Map();
const noteMutationLocks = new Map();
const RETRYABLE_RENAME_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
const RETRYABLE_FILE_WRITE_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

async function withLock(lockMap, lockKey, operation) {
  const normalizedKey = String(lockKey || 'unknown');
  const previous = lockMap.get(normalizedKey) || Promise.resolve();
  let releaseLock;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });

  lockMap.set(normalizedKey, current);
  await previous.catch(() => {});

  try {
    return await operation();
  } finally {
    releaseLock();
    if (lockMap.get(normalizedKey) === current) {
      lockMap.delete(normalizedKey);
    }
  }
}

async function withRenameLock(lockKey, operation) {
  return withLock(renameLocks, path.resolve(lockKey), operation);
}

async function withNoteMutationLock(noteId, notePath, operation) {
  const normalizedKey = Number.isFinite(noteId)
    ? `note:${noteId}`
    : `path:${path.resolve(String(notePath || 'unknown'))}`;
  return withLock(noteMutationLocks, normalizedKey, operation);
}

async function writeFileWithRetry(targetPath, content, options = {}) {
  const {
    maxRetries = 8,
    initialDelayMs = 40,
    maxDelayMs = 400,
  } = options;

  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      await fs.writeFile(targetPath, content, 'utf8');
      return targetPath;
    } catch (error) {
      if (!RETRYABLE_FILE_WRITE_ERROR_CODES.has(error?.code)) {
        throw error;
      }
      lastError = error;
      const delay = Math.min(initialDelayMs * (attempt + 1), maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`Failed to write "${targetPath}" after ${maxRetries} attempts`);
}

async function atomicReplace(sourcePath, targetPath, options = {}) {
  const normalizedOptions = typeof options === 'number' ? { maxRetries: options } : options || {};
  const {
    maxRetries = 10,
    initialDelayMs = 40,
    maxDelayMs = 400,
    fallbackContent,
  } = normalizedOptions;

  return withRenameLock(targetPath, async () => {
    let lastError;
    let renamed = false;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        await fs.rename(sourcePath, targetPath);
        renamed = true;
        break;
      } catch (error) {
        if (!RETRYABLE_RENAME_ERROR_CODES.has(error?.code)) {
          throw error;
        }
        lastError = error;
        const delay = Math.min(initialDelayMs * (attempt + 1), maxDelayMs);
        await sleep(delay);
      }
    }

    if (renamed) {
      return targetPath;
    }

    if (fallbackContent === undefined) {
      try {
        await fs.unlink(sourcePath);
      } catch {
        // ignore cleanup failure for temp file
      }
      throw lastError || new Error(`Failed to rename "${sourcePath}" to "${targetPath}" after ${maxRetries} attempts`);
    }

    try {
      await writeFileWithRetry(targetPath, fallbackContent, {
        maxRetries,
        initialDelayMs,
        maxDelayMs,
      });
      return targetPath;
    } finally {
      try {
        await fs.unlink(sourcePath);
      } catch {
        // ignore cleanup failure for temp file
      }
    }
  });
}

async function writeFileAtomically(targetPath, content) {
  const tmpPath = targetPath + `.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await atomicReplace(tmpPath, targetPath, { fallbackContent: content });
}

async function writeYamlFile(targetPath, data) {
  await writeFileAtomically(targetPath, `${stringifyYamlLike(data).trimEnd()}\n`);
}

async function readYamlFile(targetPath) {
  if (!(await pathExists(targetPath))) {
    return {};
  }
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    return parseYamlLike(raw) || {};
  } catch (error) {
    if (isMissingPathError(error)) {
      return {};
    }
    throw error;
  }
}

async function uniquePath(targetPath) {
  if (!(await pathExists(targetPath))) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  let counter = 2;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name} ${counter}${parsed.ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
    counter += 1;
  }
}

async function safeRename(sourcePath, targetPath) {
  return withRenameLock(targetPath, async () => {
    let resolvedTarget = targetPath;

    if (path.resolve(sourcePath) === path.resolve(resolvedTarget)) {
      return resolvedTarget;
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (path.resolve(sourcePath) !== path.resolve(resolvedTarget) && await pathExists(resolvedTarget)) {
        resolvedTarget = await uniquePath(resolvedTarget);
      }

      try {
        await fs.rename(sourcePath, resolvedTarget);
        return resolvedTarget;
      } catch (error) {
        if (!['EEXIST', 'EPERM', 'ENOTEMPTY', 'EBUSY', 'EACCES'].includes(error?.code)) {
          throw error;
        }

        resolvedTarget = await uniquePath(targetPath);
        await sleep(20 * (attempt + 1));
      }
    }

    try {
      await fs.rename(sourcePath, resolvedTarget);
      return resolvedTarget;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(error?.code)) {
        throw error;
      }

      const sourceStat = await fs.stat(sourcePath);
      if (!sourceStat.isFile()) {
        throw error;
      }

      const fallbackContent = await fs.readFile(sourcePath, 'utf8');
      await writeFileWithRetry(resolvedTarget, fallbackContent);
      await fs.unlink(sourcePath);
      return resolvedTarget;
    }
  });
}

function sortDirents(a, b) {
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
}

function nextAvailableId(usedIds) {
  let candidate = usedIds.size ? Math.max(...usedIds) + 1 : 1;
  while (usedIds.has(candidate)) {
    candidate += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function isPathInsideRoot(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function createFsBridge(options) {
  const vaultRoot = options.vaultRoot;
  const trashRoot = path.join(vaultRoot, TRASH_DIR_NAME);

  let _maxId = 0;
  let _isIdInitialized = false;
  const notePathById = new Map();

  function rememberNotePath(note) {
    if (note && Number.isFinite(Number(note.id)) && note._path) {
      notePathById.set(Number(note.id), note._path);
    }
    return note;
  }

  function forgetNotePath(noteId) {
    notePathById.delete(Number(noteId));
  }

  async function ensureBaseDirs() {
    await ensureDir(vaultRoot);
    await ensureDir(trashRoot);
    await ensureDir(path.join(vaultRoot, '_assets'));
    await ensureDir(path.join(vaultRoot, '_templates'));
    await ensureDefaultNotebook();
  }

  async function initializeMaxId() {
    if (_isIdInitialized) return;
    const ids = new Set();
    await walkForIds(vaultRoot, ids);
    _maxId = ids.size ? Math.max(...ids) : 0;
    _isIdInitialized = true;
  }

  async function ensureStructure() {
    await ensureBaseDirs();
    await repairVaultMetadata();
  }

  async function ensureDefaultNotebook() {
    const notebookDir = path.join(vaultRoot, DEFAULT_NOTEBOOK_NAME);
    await ensureDir(notebookDir);
    const metaPath = path.join(notebookDir, NOTEBOOK_META_NAME);
    if (!(await pathExists(metaPath))) {
      await writeYamlFile(metaPath, {
        id: 1,
        name: DEFAULT_NOTEBOOK_NAME,
        icon: '🗂',
        created_at: nowIso(),
        deleted_at: null,
      });
    }
    return notebookDir;
  }

  async function repairVaultMetadata() {
    const usedIds = new Set();
    const dirents = await fs.readdir(vaultRoot, { withFileTypes: true });

    for (const item of dirents.sort(sortDirents)) {
      if (!item.isDirectory() || INTERNAL_DIRS.has(item.name)) {
        continue;
      }

      await repairNotebook(path.join(vaultRoot, item.name), usedIds);
    }
  }

  async function repairNotebook(notebookDir, usedIds) {
    const metaPath = path.join(notebookDir, NOTEBOOK_META_NAME);
    const currentMeta = await readYamlFile(metaPath);
    const nextMeta = { ...currentMeta };
    let changed = false;
    const currentId = Number(nextMeta.id);

    if (!Number.isFinite(currentId) || usedIds.has(currentId)) {
      nextMeta.id = nextAvailableId(usedIds);
      changed = true;
    } else {
      usedIds.add(currentId);
    }

    const notebookName = path.basename(notebookDir);
    if (nextMeta.name !== notebookName) {
      nextMeta.name = notebookName;
      changed = true;
    }
    if (!nextMeta.icon) {
      nextMeta.icon = '🗂';
      changed = true;
    }
    if (!nextMeta.created_at) {
      nextMeta.created_at = nowIso();
      changed = true;
    }
    if (!hasOwn(nextMeta, 'deleted_at')) {
      nextMeta.deleted_at = null;
      changed = true;
    }

    if (changed || !(await pathExists(metaPath))) {
      await writeYamlFile(metaPath, nextMeta);
    }

    await repairDirectory(notebookDir, usedIds);
  }

  async function repairDirectory(currentDir, usedIds) {
    const dirents = await fs.readdir(currentDir, { withFileTypes: true });

    for (const item of dirents.sort(sortDirents)) {
      if (item.name === NOTEBOOK_META_NAME || item.name === FOLDER_META_NAME) {
        continue;
      }

      const itemPath = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        if (item.name.startsWith('.') || INTERNAL_DIRS.has(item.name)) {
          continue;
        }

        const metaPath = path.join(itemPath, FOLDER_META_NAME);
        const currentMeta = await readYamlFile(metaPath);
        const nextMeta = { ...currentMeta };
        let changed = false;
        const currentId = Number(nextMeta.id);

        if (!Number.isFinite(currentId) || usedIds.has(currentId)) {
          nextMeta.id = nextAvailableId(usedIds);
          changed = true;
        } else {
          usedIds.add(currentId);
        }

        const folderName = path.basename(itemPath);
        const normalizedTitle = normalizeTitle(nextMeta.title, folderName);
        if (nextMeta.title !== normalizedTitle) {
          nextMeta.title = normalizedTitle;
          changed = true;
        }
        if (!nextMeta.icon) {
          nextMeta.icon = '📁';
          changed = true;
        }
        if (!nextMeta.type) {
          nextMeta.type = 'note';
          changed = true;
        }
        if (!Array.isArray(nextMeta.tags)) {
          nextMeta.tags = [];
          changed = true;
        }
        if (!nextMeta.created_at) {
          nextMeta.created_at = nowIso();
          changed = true;
        }
        if (!nextMeta.updated_at) {
          nextMeta.updated_at = nextMeta.created_at;
          changed = true;
        }
        if (!hasOwn(nextMeta, 'deleted_at')) {
          nextMeta.deleted_at = null;
          changed = true;
        }
        if (!hasOwn(nextMeta, 'is_title_manually_edited')) {
          nextMeta.is_title_manually_edited = false;
          changed = true;
        }
        if (!hasOwn(nextMeta, 'sort_key')) {
          nextMeta.sort_key = 'm';
          changed = true;
        }
        if (!hasOwn(nextMeta, 'background_paper')) {
          nextMeta.background_paper = 'none';
          changed = true;
        }
        if (!hasOwn(nextMeta, 'original_rel_path')) {
          nextMeta.original_rel_path = null;
          changed = true;
        }

        if (changed || !(await pathExists(metaPath))) {
          await writeYamlFile(metaPath, nextMeta);
        }

        await repairDirectory(itemPath, usedIds);
        continue;
      }

      if (!item.isFile() || !item.name.endsWith('.md')) {
        continue;
      }

      const raw = await fs.readFile(itemPath, 'utf8');
      const { meta, body } = splitFrontmatter(raw);
      const nextMeta = { ...meta };
      let changed = false;
      const currentId = Number(nextMeta.id);

      if (!Number.isFinite(currentId) || usedIds.has(currentId)) {
        nextMeta.id = nextAvailableId(usedIds);
        changed = true;
      } else {
        usedIds.add(currentId);
      }

      const fileBaseName = path.parse(itemPath).name;
      const normalizedTitle = normalizeTitle(nextMeta.title, fileBaseName);
      if (nextMeta.title !== normalizedTitle) {
        nextMeta.title = normalizedTitle;
        changed = true;
      }

      const inferredType = looksLikeCanvasContent(body)
        ? 'canvas'
        : String(nextMeta.type || 'note');
      if (nextMeta.type !== inferredType) {
        nextMeta.type = inferredType;
        changed = true;
      }
      if (!nextMeta.icon) {
        nextMeta.icon = inferredType === 'canvas' ? '🧩' : '📝';
        changed = true;
      }
      if (!Array.isArray(nextMeta.tags)) {
        nextMeta.tags = [];
        changed = true;
      }
      if (!nextMeta.created_at) {
        nextMeta.created_at = nowIso();
        changed = true;
      }
      if (!nextMeta.updated_at) {
        nextMeta.updated_at = nextMeta.created_at;
        changed = true;
      }
      if (!hasOwn(nextMeta, 'deleted_at')) {
        nextMeta.deleted_at = null;
        changed = true;
      }
      if (!hasOwn(nextMeta, 'summary') || typeof nextMeta.summary !== 'string') {
        nextMeta.summary = summarizeContent(body);
        changed = true;
      }
      if (!hasOwn(nextMeta, 'sort_key')) {
        nextMeta.sort_key = 'm';
        changed = true;
      }
      if (!hasOwn(nextMeta, 'is_title_manually_edited')) {
        nextMeta.is_title_manually_edited = false;
        changed = true;
      }
      if (!hasOwn(nextMeta, 'background_paper')) {
        nextMeta.background_paper = 'none';
        changed = true;
      }
      if (!Array.isArray(nextMeta.stickers)) {
        nextMeta.stickers = [];
        changed = true;
      }
      if (!Array.isArray(nextMeta.sticky_notes)) {
        nextMeta.sticky_notes = [];
        changed = true;
      }
      if (!Array.isArray(nextMeta.properties)) {
        nextMeta.properties = [];
        changed = true;
      }
        const extractedLinks = extractLinkedNoteIds(body);
        if (
          !Array.isArray(nextMeta.links) ||
          JSON.stringify(nextMeta.links.map(Number).filter(Number.isFinite)) !== JSON.stringify(extractedLinks)
        ) {
          nextMeta.links = extractedLinks;
          changed = true;
        }
      if (!hasOwn(nextMeta, 'original_rel_path')) {
        nextMeta.original_rel_path = null;
        changed = true;
      }

      if (changed) {
        await writeFileAtomically(itemPath, serializeFrontmatter(nextMeta, body));
      }
    }
  }

  async function listTopLevelNotebooks() {
    await ensureStructure();
    const dirents = await fs.readdir(vaultRoot, { withFileTypes: true });
    const notebooks = [];
    for (const item of dirents.sort(sortDirents)) {
      if (!item.isDirectory()) {
        continue;
      }
      if (INTERNAL_DIRS.has(item.name)) {
        continue;
      }
      const notebookDir = path.join(vaultRoot, item.name);
      const metaPath = path.join(notebookDir, NOTEBOOK_META_NAME);
      const meta = await readYamlFile(metaPath);
      if (!hasOwn(meta, 'id')) {
        meta.id = await nextNotebookId();
        meta.name = item.name;
        meta.icon = meta.icon || '🗂';
        meta.created_at = meta.created_at || nowIso();
        meta.deleted_at = meta.deleted_at || null;
        await writeYamlFile(metaPath, meta);
      }
      notebooks.push({
        id: Number(meta.id),
        name: String(meta.name || item.name),
        icon: String(meta.icon || '🗂'),
        created_at: String(meta.created_at || nowIso()),
        deleted_at: meta.deleted_at || null,
        path: notebookDir,
      });
    }
    return notebooks;
  }

  async function listNotebooks() {
    const notebooks = await listTopLevelNotebooks();
    return notebooks.map(({ path: _path, ...rest }) => rest);
  }

  async function walkForIds(rootPath, ids) {
    let dirents = [];
    try {
      dirents = await fs.readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if (isMissingPathError(error)) {
        return;
      }
      throw error;
    }
    for (const item of dirents) {
      const itemPath = path.join(rootPath, item.name);
      if (item.isDirectory()) {
        if (item.name.startsWith('.') && item.name !== TRASH_DIR_NAME) {
          continue;
        }
        const folderMetaPath = path.join(itemPath, FOLDER_META_NAME);
        const notebookMetaPath = path.join(itemPath, NOTEBOOK_META_NAME);
        if (await pathExists(folderMetaPath)) {
          const meta = await readYamlFile(folderMetaPath);
          if (hasOwn(meta, 'id')) {
            ids.add(Number(meta.id));
          }
        }
        if (await pathExists(notebookMetaPath)) {
          const meta = await readYamlFile(notebookMetaPath);
          if (hasOwn(meta, 'id')) {
            ids.add(Number(meta.id));
          }
        }
        await walkForIds(itemPath, ids);
        continue;
      }

      if (!item.isFile() || !item.name.endsWith('.md')) {
        continue;
      }

      let raw = '';
      try {
        raw = await fs.readFile(itemPath, 'utf8');
      } catch (error) {
        if (isMissingPathError(error)) {
          continue;
        }
        throw error;
      }
      const { meta } = splitFrontmatter(raw);
      if (hasOwn(meta, 'id')) {
        ids.add(Number(meta.id));
      }
    }
  }

  async function nextNoteId() {
    if (!_isIdInitialized) {
      await initializeMaxId();
    }
    _maxId += 1;
    return _maxId;
  }

  async function nextNotebookId() {
    if (!_isIdInitialized) {
      await initializeMaxId();
    }
    _maxId += 1;
    return _maxId;
  }

  async function parseNoteFile(notePath, notebook, parentId, includeContent) {
    const raw = await fs.readFile(notePath, 'utf8');
    const { meta, body } = splitFrontmatter(raw);
    const sanitizedBody = sanitizeLegacyApiUrlsInHtml(body);
    const noteId = Number(meta.id || (await nextNoteId()));
    const content = includeContent ? sanitizedBody : undefined;
    const noteType = looksLikeCanvasContent(sanitizedBody) ? 'canvas' : String(meta.type || 'note');
    const title = normalizeTitle(meta.title, path.parse(notePath).name);

    return {
      id: noteId,
      title,
      icon: String(meta.icon || '📝'),
      content,
      file_path: notePath,
      type: noteType,
      summary: String(meta.summary || summarizeContent(sanitizedBody)),
      is_title_manually_edited: Boolean(meta.is_title_manually_edited),
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      properties: Array.isArray(meta.properties) ? meta.properties : [],
      sticky_notes: sanitizeStickyNotes(meta.sticky_notes),
      stickers: sanitizeStickers(meta.stickers),
      links: Array.isArray(meta.links) && meta.links.length > 0
        ? meta.links.map(Number).filter(Number.isFinite)
        : extractLinkedNoteIds(sanitizedBody),
      notebook_id: notebook.id,
      parent_id: parentId,
      position: 0,
      sort_key: meta.sort_key || 'm',
      is_folder: false,
      created_at: String(meta.created_at || nowIso()),
      updated_at: String(meta.updated_at || meta.created_at || nowIso()),
      deleted_at: meta.deleted_at || null,
      background_paper: meta.background_paper || 'none',
      _meta: meta,
      _path: notePath,
      _notebookName: notebook.name,
    };
  }

  async function parseFolder(folderPath, notebook, parentId) {
    const meta = await readYamlFile(path.join(folderPath, FOLDER_META_NAME));
    return {
      id: Number(meta.id || (await nextNoteId())),
      title: normalizeTitle(meta.title, path.basename(folderPath)),
      icon: String(meta.icon || '📁'),
      content: undefined,
      file_path: folderPath,
      type: String(meta.type || 'note'),
      summary: '',
      is_title_manually_edited: Boolean(meta.is_title_manually_edited),
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      properties: [],
      sticky_notes: [],
      stickers: [],
      links: [],
      notebook_id: notebook.id,
      parent_id: parentId,
      position: 0,
      sort_key: meta.sort_key || 'm',
      is_folder: true,
      created_at: String(meta.created_at || nowIso()),
      updated_at: String(meta.updated_at || meta.created_at || nowIso()),
      deleted_at: meta.deleted_at || null,
      background_paper: meta.background_paper || 'none',
      _meta: meta,
      _path: folderPath,
      _notebookName: notebook.name,
    };
  }

  async function collectNotes(currentDir, notebook, parentId, includeContent, sink) {
    let dirents = [];
    try {
      dirents = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingPathError(error)) {
        return;
      }
      throw error;
    }
    let position = 0;
    for (const item of dirents.sort(sortDirents)) {
      if (item.name === NOTEBOOK_META_NAME || item.name === FOLDER_META_NAME) {
        continue;
      }

      const itemPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        let folder;
        try {
          folder = await parseFolder(itemPath, notebook, parentId);
        } catch (error) {
          if (isMissingPathError(error)) {
            continue;
          }
          throw error;
        }
        folder.position = position++;
        sink.push(folder);
        await collectNotes(itemPath, notebook, folder.id, includeContent, sink);
        continue;
      }

      if (!item.isFile() || !item.name.endsWith('.md')) {
        continue;
      }

      let note;
      try {
        note = await parseNoteFile(itemPath, notebook, parentId, includeContent);
      } catch (error) {
        if (isMissingPathError(error)) {
          continue;
        }
        throw error;
      }
      note.position = position++;
      sink.push(rememberNotePath(note));
    }
  }

  async function listNotes(options = {}) {
    const includeContent = Boolean(options.includeContent);
    const notebooks = await listTopLevelNotebooks();
    const notes = [];
    for (const notebook of notebooks) {
      await collectNotes(notebook.path, notebook, null, includeContent, notes);
    }
    return notes.map(stripInternalFields);
  }

  async function getNote(noteId) {
    const numericId = Number(noteId);
    const cachedPath = notePathById.get(numericId);
    if (cachedPath) {
      const cachedNote = await findNoteInternalByPath(numericId, cachedPath);
      if (cachedNote && Number(cachedNote.id) === numericId) {
        return stripInternalFields(rememberNotePath(cachedNote));
      }
      forgetNotePath(numericId);
    }

    const notes = await listNotes({ includeContent: true });
    const note = notes.find((item) => item.id === numericId);
    if (!note) {
      throw new Error(`Note ${noteId} not found`);
    }
    return note;
  }

  async function getNotesByPaths(filenames, options = {}) {
    if (!Array.isArray(filenames)) {
      return [];
    }

    const includeContent = options.includeContent !== false;
    const seen = new Set();
    const notes = [];

    for (const filename of filenames) {
      if (typeof filename !== 'string' || !filename.trim()) {
        continue;
      }

      const resolvedPath = path.isAbsolute(filename)
        ? path.resolve(filename)
        : path.resolve(vaultRoot, filename);
      const normalizedPath = resolvedPath.toLowerCase();
      if (seen.has(normalizedPath) || !isPathInsideRoot(vaultRoot, resolvedPath)) {
        continue;
      }
      seen.add(normalizedPath);

      const note = await findNoteInternalByPath(null, resolvedPath, includeContent);
      if (note) {
        notes.push(stripInternalFields(rememberNotePath(note)));
      }
    }

    return notes;
  }

  function stripInternalFields(note) {
    const { _meta, _path, _notebookName, ...rest } = note;
    return rest;
  }

  async function findNoteInternal(noteId) {
    const numericId = Number(noteId);
    const cachedPath = notePathById.get(numericId);
    if (cachedPath) {
      const cachedNote = await findNoteInternalByPath(numericId, cachedPath);
      if (cachedNote && Number(cachedNote.id) === numericId) {
        return rememberNotePath(cachedNote);
      }
      forgetNotePath(numericId);
    }

    const notebooks = await listTopLevelNotebooks();
    const notes = [];
    for (const notebook of notebooks) {
      await collectNotes(notebook.path, notebook, null, true, notes);
    }
    return notes.find((item) => item.id === numericId) || null;
  }

  async function findNoteInternalByPath(noteId, notePath, includeContent = true) {
    if (typeof notePath !== 'string' || !notePath.trim()) {
      return null;
    }

    const resolvedPath = path.resolve(notePath);
    if (!isPathInsideRoot(vaultRoot, resolvedPath)) {
      return null;
    }
    if (!(await pathExists(resolvedPath))) {
      return null;
    }

    const relativePath = path.relative(vaultRoot, resolvedPath);
    const [notebookName] = relativePath.split(path.sep);
    if (!notebookName || INTERNAL_DIRS.has(notebookName) || notebookName.startsWith('.')) {
      return null;
    }
    const notebookDir = path.join(vaultRoot, notebookName);
    const notebookMeta = await readYamlFile(path.join(notebookDir, NOTEBOOK_META_NAME));
    const notebook = {
      id: Number(notebookMeta.id || 1),
      name: String(notebookMeta.name || notebookName),
      icon: String(notebookMeta.icon || '馃梻'),
      created_at: String(notebookMeta.created_at || nowIso()),
      deleted_at: notebookMeta.deleted_at || null,
      path: notebookDir,
    };

    const parentPath = path.dirname(resolvedPath);
    let parentId = null;
    if (path.resolve(parentPath) !== path.resolve(notebook.path)) {
      const parentMeta = await readYamlFile(path.join(parentPath, FOLDER_META_NAME));
      if (hasOwn(parentMeta, 'id')) {
        parentId = Number(parentMeta.id);
      }
    }

    try {
      const stat = await fs.stat(resolvedPath);
      const item = stat.isDirectory()
        ? await parseFolder(resolvedPath, notebook, parentId)
        : await parseNoteFile(resolvedPath, notebook, parentId, includeContent);

      return item;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function resolveParentLocation(parentId) {
    if (parentId === null || parentId === undefined) {
      const notebookDir = await ensureDefaultNotebook();
      const notebook = (await listTopLevelNotebooks()).find((item) => item.path === notebookDir);
      return {
        dir: notebookDir,
        notebookId: notebook ? notebook.id : 1,
        notebookName: notebook ? notebook.name : DEFAULT_NOTEBOOK_NAME,
        parentId: null,
      };
    }

    const parent = await findNoteInternal(parentId);
    if (!parent || !parent.is_folder) {
      throw new Error(`Parent folder ${parentId} not found`);
    }

    return {
      dir: parent._path,
      notebookId: parent.notebook_id,
      notebookName: parent._notebookName || DEFAULT_NOTEBOOK_NAME,
      parentId: parent.id,
    };
  }

  async function writeFolderMeta(folderPath, note) {
    await writeYamlFile(path.join(folderPath, FOLDER_META_NAME), {
      id: note.id,
      uuid: note._meta?.uuid || crypto.randomUUID(),
      title: note.title,
      icon: note.icon,
      type: note.type,
      tags: note.tags || [],
      created_at: note.created_at || nowIso(),
      updated_at: note.updated_at || nowIso(),
      deleted_at: note.deleted_at || null,
      is_title_manually_edited: Boolean(note.is_title_manually_edited),
      sort_key: note.sort_key || 'm',
      background_paper: note.background_paper || 'none',
      original_rel_path: note._meta?.original_rel_path || null,
    });
  }

  async function writeNoteFile(notePath, note) {
    const sanitizedContent = sanitizeLegacyApiUrlsInHtml(note.content || '');
    const sanitizedStickers = sanitizeStickers(note.stickers || []);
    const sanitizedStickyNotes = sanitizeStickyNotes(note.sticky_notes || []);
    const derivedLinks = extractLinkedNoteIds(sanitizedContent);
    const meta = {
      ...(note._meta || {}),
      id: note.id,
      uuid: note._meta?.uuid || crypto.randomUUID(),
      title: note.title,
      icon: note.icon,
      type: note.type || 'note',
      tags: note.tags || [],
      created_at: note.created_at || nowIso(),
      updated_at: note.updated_at || nowIso(),
      deleted_at: note.deleted_at || null,
      summary: summarizeContent(sanitizedContent),
      sort_key: note.sort_key || 'm',
      is_title_manually_edited: Boolean(note.is_title_manually_edited),
      background_paper: note.background_paper || 'none',
      stickers: sanitizedStickers,
      sticky_notes: sanitizedStickyNotes,
      properties: note.properties || [],
      links: derivedLinks,
      original_rel_path: note._meta?.original_rel_path || null,
    };

    await writeFileAtomically(notePath, serializeFrontmatter(meta, sanitizedContent));
    return meta;
  }

  async function createFolder(payload) {
    const location = await resolveParentLocation(payload.parent_id ?? null);
    const title = normalizeTitle(payload.title, 'Untitled Folder');
    const targetDir = await uniquePath(path.join(location.dir, sanitizeFilename(title)));
    const createdAt = nowIso();
    const note = {
      id: await nextNoteId(),
      title,
      icon: '📁',
      type: payload.type || 'note',
      tags: payload.tags || [],
      notebook_id: location.notebookId,
      parent_id: location.parentId,
      is_folder: true,
      position: 0,
      sort_key: 'm',
      is_title_manually_edited: false,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      background_paper: 'none',
      _meta: {},
      _path: targetDir,
      _notebookName: location.notebookName,
    };

    await ensureDir(targetDir);
    await writeFolderMeta(targetDir, note);
    note.file_path = targetDir;
    return stripInternalFields(note);
  }

  async function createNote(payload) {
    const location = await resolveParentLocation(payload.parent_id ?? null);
    const title = normalizeTitle(payload.title, 'Untitled');
    const createdAt = nowIso();
    const targetPath = await uniquePath(path.join(location.dir, `${sanitizeFilename(title)}.md`));
    const noteContent = sanitizeLegacyApiUrlsInHtml(payload.content || '');
    const noteType = looksLikeCanvasContent(noteContent) ? 'canvas' : (payload.type || 'note');

    const note = {
      id: await nextNoteId(),
      title,
      icon: payload.icon || (noteType === 'canvas' ? '🎨' : '📝'),
      content: noteContent,
      type: noteType,
      summary: '',
      is_title_manually_edited: Boolean(payload.is_title_manually_edited),
      tags: payload.tags || [],
      properties: payload.properties || [],
      sticky_notes: sanitizeStickyNotes(payload.sticky_notes || []),
      stickers: sanitizeStickers(payload.stickers || []),
      links: extractLinkedNoteIds(noteContent),
      notebook_id: location.notebookId,
      parent_id: location.parentId,
      position: 0,
      sort_key: payload.sort_key || 'm',
      is_folder: false,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      background_paper: payload.background_paper || 'none',
      _meta: {},
      _path: targetPath,
      _notebookName: location.notebookName,
    };

    note._meta = await writeNoteFile(targetPath, note);
    note.file_path = targetPath;
    note.summary = summarizeContent(note.content);
    rememberNotePath(note);
    return stripInternalFields(note);
  }

  async function updateNote(noteId, payload) {
    return withNoteMutationLock(noteId, payload.file_path, async () => {
      const current = await findNoteInternalByPath(noteId, payload.file_path) || await findNoteInternal(noteId);
      if (!current) {
        throw new Error(`Note ${noteId} not found`);
      }

      const requestedTitle = hasOwn(payload, 'title')
        ? normalizeTitle(payload.title, current.title)
        : current.title;

      let targetPath = current._path;
      let notebookName = current._notebookName;
      let notebookId = current.notebook_id;
      let parentId = current.parent_id;

      if (hasOwn(payload, 'parent_id') && payload.parent_id !== current.parent_id) {
        const location = await resolveParentLocation(payload.parent_id);
        targetPath = await uniquePath(path.join(location.dir, path.basename(targetPath)));
        targetPath = await safeRename(current._path, targetPath);
        notebookName = location.notebookName;
        notebookId = location.notebookId;
        parentId = location.parentId;
      }

      const shouldRenameFile = Boolean(payload.rename_file);
      if (shouldRenameFile) {
        const nextBaseName = sanitizeFilename(requestedTitle);
        const currentBaseName = path.parse(targetPath).name;
        if (nextBaseName !== currentBaseName) {
          targetPath = await safeRename(
            targetPath,
            path.join(path.dirname(targetPath), current.is_folder ? nextBaseName : `${nextBaseName}.md`),
          );
        }
      }

      const updatedContent = hasOwn(payload, 'content')
        ? sanitizeLegacyApiUrlsInHtml(payload.content || '')
        : current.content;
      const requestedType = hasOwn(payload, 'type') ? payload.type : current.type;
      const inferredType = looksLikeCanvasContent(updatedContent) ? 'canvas' : requestedType;

      const updated = {
        ...current,
        title: requestedTitle,
        icon: hasOwn(payload, 'icon') ? payload.icon : current.icon,
        content: updatedContent,
        type: inferredType,
        tags: hasOwn(payload, 'tags') ? payload.tags : current.tags,
        properties: hasOwn(payload, 'properties') ? payload.properties : current.properties,
        sticky_notes: hasOwn(payload, 'sticky_notes')
          ? sanitizeStickyNotes(payload.sticky_notes)
          : current.sticky_notes,
        stickers: hasOwn(payload, 'stickers')
          ? sanitizeStickers(payload.stickers)
          : current.stickers,
        links: hasOwn(payload, 'links')
          ? payload.links
          : extractLinkedNoteIds(updatedContent),
        sort_key: hasOwn(payload, 'sort_key') ? payload.sort_key : current.sort_key,
        background_paper: hasOwn(payload, 'background_paper') ? payload.background_paper : current.background_paper,
        is_title_manually_edited: hasOwn(payload, 'is_title_manually_edited')
          ? payload.is_title_manually_edited
          : current.is_title_manually_edited,
        notebook_id: notebookId,
        parent_id: parentId,
        updated_at: nowIso(),
        _path: targetPath,
        _notebookName: notebookName,
      };

      if (current.is_folder) {
        await writeFolderMeta(targetPath, updated);
      } else {
        updated._meta = await writeNoteFile(targetPath, updated);
        updated.summary = summarizeContent(updated.content);
      }

      updated.file_path = targetPath;
      rememberNotePath(updated);
      return stripInternalFields(updated);
    });
  }

  async function deleteNote(noteId) {
    const current = await findNoteInternal(noteId);
    if (!current) {
      throw new Error(`Note ${noteId} not found`);
    }

    const targetName = current.is_folder
      ? `${sanitizeFilename(current.title)}__folder_${current.id}`
      : `${sanitizeFilename(current.title)}__${current.id}${path.extname(current._path)}`;
    const targetPath = await uniquePath(path.join(trashRoot, targetName));

    await ensureDir(trashRoot);
    await fs.rename(current._path, targetPath);
    forgetNotePath(noteId);

    const deletedAt = nowIso();
    const originalRelPath = path.relative(vaultRoot, current._path);

    if (current.is_folder) {
      await writeFolderMeta(targetPath, {
        ...current,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        _meta: {
          ...(current._meta || {}),
          original_rel_path: originalRelPath,
        },
      });
    } else {
      await writeNoteFile(targetPath, {
        ...current,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        _meta: {
          ...(current._meta || {}),
          original_rel_path: originalRelPath,
        },
      });
    }

    return { status: 'ok' };
  }

  return {
    ensureStructure,
    listNotebooks,
    listNotes,
    getNote,
    getNotesByPaths,
    createNote,
    createFolder,
    updateNote,
    deleteNote,
    ensureBaseDirs,
    repairVaultMetadata,
    initializeMaxId,
  };
}

module.exports = {
  createFsBridge,
  sanitizeFilename,
  splitFrontmatter,
};
