# Argus 0.59.4 – YouTube: keine Absturzschleife mehr

**Behoben**
- Stürzte Argus beim Öffnen eines YouTube-Videos ab, lud Argus beim nächsten Start (oder beim nächsten Klick auf YouTube) genau dieses Video an derselben Stelle wieder und stürzte erneut ab. YouTube ließ sich dann gar nicht mehr nutzen.
- Jetzt merkt sich Argus vor dem Laden, welches Video gerade startet. Endet Argus dabei unerwartet, wird dieses Video beim nächsten Start nicht wieder geöffnet. YouTube startet dann auf der Startseite und öffnet sich auch nicht von selbst. Ein Hinweis sagt, was passiert ist.
- Stürzt nur die YouTube-Ansicht ab, lädt Argus die YouTube-Startseite statt in eine leere oder schwarze Fläche zu laufen. Stürzt sie innerhalb einer Minute zweimal ab, wird YouTube geschlossen.
- Stürzt der Grafiktreiber ab, während ein Video lädt, spielt Argus Videos ab dem nächsten Start ohne Hardware-Dekodierung ab. Das kostet etwas mehr CPU und lässt sich unter Einstellungen → System → Leistung („Videos mit Hardware-Dekodierung abspielen“) wieder einschalten.
- Ein gesperrtes Video kannst du weiterhin bewusst selbst öffnen. Läuft es 30 Sekunden stabil, ist es wieder freigegeben.

**Fehlerbericht**
- Der Absturz erscheint im Fehlerbericht mit dem Video, bei dem er passierte.
