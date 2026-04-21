const chokidar = require('chokidar');

function createVaultWatcher(vaultRoot, onChange) {
  let watcher = null;

  function start() {
    if (watcher) {
      return;
    }

    try {
      watcher = chokidar.watch(vaultRoot, {
        ignored: [/(^|[\/\\])\../, '**/node_modules/**'],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      });

      const handleChange = (eventType, filename) => {
        onChange({
          eventType,
          filename: filename || null,
          changedAt: new Date().toISOString(),
        });
      };

      watcher
        .on('add', (path) => handleChange('add', path))
        .on('change', (path) => handleChange('change', path))
        .on('unlink', (path) => handleChange('unlink', path))
        .on('addDir', (path) => handleChange('addDir', path))
        .on('unlinkDir', (path) => handleChange('unlinkDir', path))
        .on('error', (error) => console.warn('[electron] vault watcher error:', error));
    } catch (error) {
      console.warn('[electron] failed to start vault watcher:', error);
    }
  }

  function stop() {
    if (!watcher) {
      return;
    }
    watcher.close();
    watcher = null;
  }

  return { start, stop };
}

module.exports = {
  createVaultWatcher,
};
