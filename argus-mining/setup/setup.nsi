; Setup für Argus Mining: installiert für den angemeldeten Benutzer (ohne Administratorrechte) nach %LOCALAPPDATA%\Programs\Argus Mining,
; legt Startmenü- und Desktop-Verknüpfung an, auf Wunsch den Autostart, und trägt sich unter „Apps“ zum Deinstallieren ein.
; Einstellungen, Report und Protokoll bleiben in %APPDATA%\Argus Mining (werden von 1.x übernommen, beim Deinstallieren nicht gelöscht).
; Bauen: makensis -DVERSION=1.5.0 -DSRC=<Ordner mit Argus-Mining.exe> setup.nsi
Unicode true
Target amd64-unicode
!include "MUI2.nsh"
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
Name "Argus Mining ${VERSION}"
OutFile "${SRC}\Argus-Mining-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Argus Mining"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "Argus-Mining.ico"
!define MUI_UNICON "Argus-Mining.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Argus-Mining.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Argus Mining jetzt starten"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArgusMining"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Argus Mining"
VIAddVersionKey "FileDescription" "Argus Mining Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"

Section "Argus Mining (erforderlich)" SecMain
  SectionIn RO
  ; laufendes Argus Mining beenden (auch eine ältere Version, die noch vom Desktop oder aus dem ZIP läuft)
  nsExec::Exec 'taskkill /F /IM Argus-Mining.exe'
  Sleep 1500
  SetOutPath "$INSTDIR"
  File "${SRC}\Argus-Mining.exe"
  File "Argus-Mining.ico"
  File /oname=LIESMICH.md "${SRC}\LIESMICH.md"
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  CreateDirectory "$SMPROGRAMS\Argus Mining"
  CreateShortcut "$SMPROGRAMS\Argus Mining\Argus Mining.lnk" "$INSTDIR\Argus-Mining.exe" "" "$INSTDIR\Argus-Mining.ico"
  CreateShortcut "$SMPROGRAMS\Argus Mining\Argus Mining deinstallieren.lnk" "$INSTDIR\Deinstallieren.exe"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "Argus Mining"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "Argus"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\Argus-Mining.ico"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Deinstallieren.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Verknüpfung auf dem Desktop" SecDesk
  CreateShortcut "$DESKTOP\Argus Mining.lnk" "$INSTDIR\Argus-Mining.exe" "" "$INSTDIR\Argus-Mining.ico"
SectionEnd

; gleiche Datei wie der Schalter „Mit Windows starten“ in den Einstellungen, damit beides zusammenpasst
Section "Mit Windows starten (empfohlen)" SecAuto
  FileOpen $0 "$SMSTARTUP\Argus Mining.cmd" w
  FileWrite $0 '@echo off$\r$\nstart "Argus Mining" /min "$INSTDIR\Argus-Mining.exe" --no-browser$\r$\n'
  FileClose $0
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM Argus-Mining.exe'
  Sleep 1500
  Delete "$SMSTARTUP\Argus Mining.cmd"
  Delete "$DESKTOP\Argus Mining.lnk"
  RMDir /r "$SMPROGRAMS\Argus Mining"
  Delete "$INSTDIR\Argus-Mining.exe"
  Delete "$INSTDIR\Argus-Mining.ico"
  Delete "$INSTDIR\LIESMICH.md"
  Delete "$INSTDIR\Deinstallieren.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST}"
SectionEnd
