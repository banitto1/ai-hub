$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopExe = Join-Path $appRoot 'win-app\AI Hub.exe'
if (Test-Path -LiteralPath $desktopExe) {
    Start-Process -FilePath $desktopExe -WorkingDirectory $appRoot
} else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Desktop build is missing. Run pnpm desktop:package.', 'AI Hub') | Out-Null
}
