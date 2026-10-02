const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("huddle", {
  choose: (v) => ipcRenderer.send("huddle-close-choice", v),
  retry: () => ipcRenderer.send("huddle-retry"),
  // Bring the main Huddle window to the front (e.g. after Stop & log in the
  // floating timer) — a page can't raise its own window on Windows.
  focusMain: () => ipcRenderer.send("huddle-focus-main"),
});
