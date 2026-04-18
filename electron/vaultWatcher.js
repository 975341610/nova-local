const fs = require('node:fs');

function createVaultWatcher(vaultRoot, onChange) {
  let watcher = null;

  function start() {
    if (watcher) {
      return;
    }

    try {
      watcher = fs.watch(vaultRoot, { recursive: true }, (eventType, filename) => {
        onChange({
          eventType,
          filename: filename || null,
          changedAt: new Date().toISOString(),
        });
      });
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
