# Argus 0.58.28 – Discord-Avatare und einheitliche Namen

- Discord-Konto und Freunde übernehmen ihre Avatar-URLs aus dem nativen SDK. Standardavatare werden angezeigt; bei Ladefehlern erscheint lokal der erste Buchstabe des Namens. Avatar-Wechsel aktualisieren die Liste. Die CSP bleibt unverändert.
- Interne Oberfläche und heutige Komponenten verwenden Argus. Technische Altkennungen für Installation, Profile, Sensor-Aufgabe, Einstellungen und lokale Schnittstellen bleiben gezielt kompatibel; siehe ARGUS-NAMEN-KOMPATIBILITAET.md. Keine Projektdateien wurden gelöscht.
- Ein bestehendes Argus-Profil wird beim Start nicht mehr durch ein älteres Jarvis-Profil überschrieben, wenn der historische Umzugsmarker fehlt.
- Einstellungen werden atomar gespeichert. Unlesbare Einstellungen bleiben gesichert; eine vorhandene lesbare Sicherung wird verwendet.

Windows x64, unsignierter Installer. Persönliche Discord-Freunde benötigen weiterhin die eigene Discord-Anmeldung. Tests verwenden synthetische Konten; eine reale Discord-Anmeldung wurde nicht automatisiert.

Verteilung ausschließlich über source und updates. Stable und das separate Startdiagnosepaket bleiben unverändert.
