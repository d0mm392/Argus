param([Parameter(Mandatory=$true)][string]$SdkRoot,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$sdk=(Resolve-Path -LiteralPath $SdkRoot).Path
$outputPath=[IO.Path]::GetFullPath($OutputDirectory)
$repoRoot=Split-Path $PSScriptRoot
if(-not $outputPath.StartsWith($repoRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Output must stay inside isolated repository'}
$dll=Join-Path $sdk 'bin/release/discord_partner_sdk.dll'
$signature=Get-AuthenticodeSignature $dll
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Discord Inc\.'){throw 'Invalid Discord runtime signature'}
$tools='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
if(!(Test-Path -LiteralPath $tools)){throw 'Visual Studio x64 Build Tools missing'}
New-Item -ItemType Directory -Force $outputPath | Out-Null
# Values are local resolved paths, quoted only as batch path arguments; no credentials.
foreach($value in @($sdk,$outputPath,$repoRoot)){if($value -match '[%"\r\n]'){throw 'Unsupported build path'}}
$batch=@(
 '@echo off','setlocal',('call "'+$tools+'" > compiler-env.log'),
 'if errorlevel 1 exit /b %errorlevel%',
 ('cl /nologo /std:c++20 /EHsc /MT /Zs /I "'+$sdk+'\include" "'+$PSScriptRoot+'\discord-social-helper.cpp" > syntax-check.log 2>&1'),
 'if errorlevel 1 exit /b %errorlevel%',
 ('cl /nologo /std:c++20 /EHsc /MT /I "'+$sdk+'\include" "'+$PSScriptRoot+'\discord-social-helper.cpp" /Fe:argus-discord-social.exe /Fo:helper.obj /link "'+$sdk+'\lib\release\discord_partner_sdk.lib" Crypt32.lib > build.log 2>&1'),
 'exit /b %errorlevel%')
[IO.File]::WriteAllLines((Join-Path $outputPath 'compile.cmd'),$batch,[Text.Encoding]::ASCII)
Push-Location $outputPath
try{& cmd.exe /d /c compile.cmd;$buildExit=$LASTEXITCODE}finally{Pop-Location}
if($buildExit -ne 0){Get-Content (Join-Path $outputPath 'syntax-check.log'),(Join-Path $outputPath 'build.log') -Tail 12;throw 'Native helper build failed'}
Copy-Item -LiteralPath $dll -Destination (Join-Path $outputPath 'discord_partner_sdk.dll')
Copy-Item -LiteralPath (Join-Path $sdk 'License-Notices.txt') -Destination (Join-Path $outputPath 'Discord-LICENSE-NOTICES.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE.txt') -Destination (Join-Path $outputPath 'Argus-helper-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Discord-SDK-TERMS.txt') -Destination (Join-Path $outputPath 'Discord-SDK-TERMS.txt')
& (Join-Path $outputPath 'argus-discord-social.exe') --check
if($LASTEXITCODE -ne 0){throw 'Native helper preflight failed'}
