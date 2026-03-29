#define MyAppName "SB Manifest Installer"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "SPIN0ZAi"
#define MyAppURL "https://github.com/SPIN0ZAi/Project_cairo"
#define MyExeName "SBManifestAgent.exe"

[Setup]
AppId={{A6D6EA88-7A96-43D8-9A99-D663E9341BA4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\SB Manifest Installer
DefaultGroupName=SB Manifest Installer
OutputDir=.
OutputBaseFilename=SBManifestSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "bin\SBManifestAgent.exe"; DestDir: "{app}\agent"; Flags: ignoreversion
Source: "..\agent\.env.example"; DestDir: "{app}\agent"; DestName: ".env"; Flags: onlyifdoesntexist
Source: "payload\extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "install-extension.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "control-panel.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SB Manifest Agent"; Filename: "{app}\agent\SBManifestAgent.exe"
Name: "{group}\Install Browser Extension"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-extension.ps1"" -ExtensionPath ""{app}\extension"""
Name: "{group}\SB Manifest Control Panel"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\control-panel.ps1"" -ExtensionPath ""{app}\extension"" -AgentExe ""{app}\agent\SBManifestAgent.exe"""
Name: "{userstartup}\SB Manifest Agent"; Filename: "{app}\agent\SBManifestAgent.exe"

[Run]
Filename: "{app}\agent\SBManifestAgent.exe"; Description: "Start SB local agent now"; Flags: nowait postinstall skipifsilent
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\control-panel.ps1"" -ExtensionPath ""{app}\extension"" -AgentExe ""{app}\agent\SBManifestAgent.exe"""; Description: "Open SB setup control panel"; Flags: postinstall skipifsilent
