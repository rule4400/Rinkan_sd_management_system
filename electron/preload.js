const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serverApi", {
  getInfo: () => ipcRenderer.invoke("get-info"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  copy: (text) => ipcRenderer.invoke("copy", text),
  quit: () => ipcRenderer.invoke("quit"),
  onUpdated: (cb) => ipcRenderer.on("server-updated", cb),
});
