# Argus 0.59.6 – Videos nach Absturz ohne Hardware-Dekodierung

**Behoben**
- Stürzt Argus beim Öffnen eines Videos komplett ab, schaltet es beim nächsten Start die Hardware-Videodekodierung selbst ab. Videos laufen dann über den Prozessor statt über den Grafiktreiber. Bisher passierte das nur, wenn der Grafikprozess allein abstürzte und Argus offen blieb. Ein Hinweis beim Start sagt, was umgestellt wurde.
- Wieder einschalten: Einstellungen › System › Leistung › „Videos mit Hardware-Dekodierung abspielen“.
- Die Blackbox vermerkt den Absturz mit dem Video und die Umstellung, damit er im Diagnose-Paket steht.
