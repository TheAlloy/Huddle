// Huddle — desktop wrapper (Electron)
// A thin native window around your live web app on Vercel. You update the app by
// deploying to Vercel as usual; the desktop app always shows the latest version.

const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const path = require("path");

// ⚠️ Your live app address (the Vercel URL).
const APP_URL = process.env.HUDDLE_URL || process.env.CADENCE_URL || "https://huddle-orpin.vercel.app";

let win;
let confirmWin = null;
let confirmedClose = false;

// Read a localStorage value from the web app (returns string | null).
async function readLS(key) {
  try { return await win.webContents.executeJavaScript(`window.localStorage.getItem(${JSON.stringify(key)})`, true); }
  catch (_) { return null; }
}

// Styled "have you logged your time?" window (native dialogs can't colour buttons, so we use our own).
function openCloseConfirm() {
  if (confirmWin) { confirmWin.focus(); return; }
  confirmWin = new BrowserWindow({
    width: 420, height: 190, parent: win, modal: true, resizable: false,
    minimizable: false, maximizable: false, frame: false, backgroundColor: "#ffffff", title: "Huddle",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  confirmWin.loadFile(path.join(__dirname, "confirm.html"));
  confirmWin.on("closed", () => { confirmWin = null; });
}

ipcMain.on("huddle-close-choice", (_e, choice) => {
  if (confirmWin) { confirmWin.close(); confirmWin = null; }
  if (choice === "yes") { confirmedClose = true; if (win) win.close(); }
});

ipcMain.on("huddle-retry", () => { if (win) win.loadURL(APP_URL); });

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600,
    title: "Huddle", backgroundColor: "#f1f5f9", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(APP_URL);

  // Keep the window title as "Huddle" regardless of the web page's <title>.
  win.on("page-title-updated", (e) => { e.preventDefault(); win.setTitle("Huddle"); });

  // If the site can't load (no internet), show a friendly offline screen instead of a blank page.
  win.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { win.loadFile(path.join(__dirname, "offline.html")).catch(() => {}); }
  });

  // External links open in the normal browser; same-site links stay in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); const base = new URL(APP_URL); if (u.host === base.host) { win.loadURL(url); return { action: "deny" }; } } catch (_) {}
    shell.openExternal(url); return { action: "deny" };
  });

  // Close confirmation (admin can turn off in Settings → sets huddle_warn_close = "0").
  win.on("close", async (e) => {
    if (confirmedClose) return;
    e.preventDefault();
    const pref = await readLS("huddle_warn_close");
    if (pref === "0") { confirmedClose = true; win.close(); return; }
    openCloseConfirm();
  });

  // Minimize reminder when the tracker isn't running (admin can turn off → huddle_warn_minimize = "0").
  let lastReminder = 0;
  win.on("minimize", async () => {
    const pref = await readLS("huddle_warn_minimize");
    if (pref === "0") return;
    const tracking = await readLS("huddle_tracking");
    if (tracking === "1") return;
    const now = Date.now(); if (now - lastReminder < 4000) return; lastReminder = now;
    dialog.showMessageBox({ type: "info", buttons: ["Dismiss"], defaultId: 0, noLink: true, title: "Huddle",
      message: "Remember to start recording your activity", detail: "Your time tracker isn't running." });
  });

  win.on("closed", () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    // Launch Huddle automatically when the computer starts.
    try { app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false }); } catch (_) {}
    Menu.setApplicationMenu(null);
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
