# SB Manifest Windows Installer UX

This folder now includes a simple **Control Panel UI** for users.

## What users get

- Start/Stop local agent
- Install/Reconnect browser extension
- Remove extension files
- One-click health check

## Health check confirms

- Extension files exist (`manifest.json`, `content.js`)
- Agent process is running (`SBManifestAgent.exe`)
- Agent API responds on `http://localhost:17321/health`

If all three are OK, the setup is working.

## User flow

1. Run installer (or portable scripts).
2. Open **SB Manifest Control Panel**.
3. Click **Install / Reconnect Extension**.
4. In Chrome/Edge extensions page:
   - Enable Developer mode
   - Load unpacked from extension folder shown by control panel
5. Click **Run Health Check**.
6. Open Steam game page and verify **Add to SB Manifest** button appears.
