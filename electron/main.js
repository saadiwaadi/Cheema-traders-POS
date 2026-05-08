const { app, BrowserWindow } = require("electron");

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
  });

  // Load React app
  mainWindow.loadURL("http://localhost:5173");
});