// Sets up Constants to Run Application
const {app, BrowserWindow, Menu} = require('electron');
const url = require('url');
const path = require('path');

let mainWindow;

// Checks if Application is Ready
app.on('ready', () => {

  // Sets a new Window to load
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resize: false,
    icon: __dirname + "/icons/icon.png",
    backgroundColor: '#212121',
    show: false,
    webPreferences: {
      webSecurity: false,
      enableRemoteModule: true,
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  
  // Waits till Window is fully loaded to Show Application
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  });

  // Sets Window path to index.html
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: "file:",
    slashes: true
  }));

  // Returns null to Prevent Application Menu
  Menu.setApplicationMenu(null);

  // Checks if Application is closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  })

})
