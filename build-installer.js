const winstaller = require('electron-winstaller');
const path = require('path');

async function build() {
  console.log('Building Windows Installer...');
  try {
    await winstaller.createWindowsInstaller({
      appDirectory: path.join(__dirname, 'dist-package', 'CheemaTradersPOS-win32-x64'),
      outputDirectory: path.join(__dirname, 'dist-package', 'installer'),
      authors: 'Cheema Traders',
      exe: 'CheemaTradersPOS.exe',
      setupExe: 'CheemaTradersPOS-Setup.exe',
      noMsi: true,
      description: 'Point of Sale system for Cheema Traders'
    });
    console.log('✅ Installer built successfully in dist-package/installer/');
  } catch (e) {
    console.error('❌ Failed to build installer:', e.message);
  }
}

build();
