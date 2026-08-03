const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("huddle", {
  choose: (v) => ipcRenderer.send("huddle-close-choice", v),
  retry: () => ipcRenderer.send("huddle-retry"),
});
