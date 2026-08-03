const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("huddleDialog", {
  choose: (v) => ipcRenderer.send("huddle-close-choice", v),
});
