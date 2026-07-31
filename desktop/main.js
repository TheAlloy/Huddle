// Cadence — desktop wrapper (Electron)
// This is a thin native window around your existing web app hosted on Vercel.
// You update the app the same way you do now (deploy to Vercel); the desktop app
// always shows the latest version.

const { app, BrowserWindow, shell, dialog, Menu } = require("electron");

// ─────────────────────────────────────────────────────────────────────────────
//  ⚠️  EDIT THIS ONE LINE: put your live app address here (the Vercel URL).
//  Example: "https://studio-schedule.vercel.app"
const APP_URL = process.env.CADENCE_URL || "https://REPLACE-WITH-YOUR-CADENCE-APP.vercel.app";
// ─────────────────────────────────────────────────────────────────────────────

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Cadence",
    backgroundColor: "#f1f5f9",
    autoHideMenuBar: true, // hide the default File/Edit menu bar (Windows/Linux)
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(APP_URL);

  // Open target=_blank / external http links in the user's normal browser,
  // but keep the tracker window (/tracker) inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      const base = new URL(APP_URL);
      if (u.host === base.host) { win.loadURL(url); return { action: "deny" }; }
    } catch (_) {}
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Native "have you logged your hours?" confirmation when closing the app.
  let confirmedClose = false;
  win.on("close", (e) => {
    if (confirmedClose) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["No – Cancel", "Yes"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "Cadence",
      message: "Are you sure you want to leave?",
      detail: "Have you logged all of your hours for today?",
    });
    if (choice === 1) { confirmedClose = true; win.close(); }
  });

  win.on("closed", () => { win = null; });
}

// Only allow one copy of the app to run at a time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // no default menu
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
