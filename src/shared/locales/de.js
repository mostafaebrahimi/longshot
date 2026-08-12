/** German. */
export default {
  "lang.name": "Deutsch",

  "app.tagline": "Aufnahme der ganzen Seite",
  "popup.settings": "Einstellungen",
  "popup.blocked.title": "{browser} blockiert Erweiterungen hier.",
  "popup.blocked.detail": "Öffne eine normale http://- oder https://-Seite und versuche es erneut.",
  "popup.blocked.geckoFileTitle": "Firefox blockiert lokale Dateien.",
  "popup.blocked.geckoFileDetail":
    "Firefox lässt Erweiterungen keine Seiten von der Festplatte lesen. Öffne die Seite über http:// oder https://.",
  "popup.blocked.fileTitle": "Lokale Dateien brauchen eine Freigabe.",
  "popup.blocked.fileDetail":
    "Aktiviere „Zugriff auf Datei-URLs zulassen“ auf der Detailseite der Erweiterung, um Dateien von der Festplatte aufzunehmen.",
  "popup.full.title": "Ganze Seite aufnehmen",
  "popup.full.sub": "Scrollt die Seite und fügt alle Ansichten zusammen",
  "popup.visible.title": "Sichtbaren Bereich aufnehmen",
  "popup.visible.sub": "Nur das, was gerade zu sehen ist",
  "popup.saveAs": "Speichern als",
  "popup.openEditor": "Editor nach der Aufnahme öffnen",
  "popup.autoDownload": "Ohne Nachfrage herunterladen",
  "popup.changeShortcuts": "Tastenkürzel ändern",
  "popup.allSettings": "Alle Einstellungen",

  "options.title": "Longshot-Einstellungen",
  "options.subtitle": "Aufnahme der ganzen Seite · Einstellungen",
  "options.welcome.title": "Alles bereit.",
  "options.welcome.body":
    "Öffne eine beliebige Seite und drücke <kbd id=\"welcome-shortcut\">Alt+Shift+P</kbd>, oder klicke auf das Longshot-Symbol in der Leiste. Die Seite scrollt von selbst, jede Ansicht wird zu einem Bild zusammengefügt, und der Editor öffnet sich bereit zum Zuschneiden, Beschriften und Speichern.",
  "options.welcome.privacy":
    "Nichts wird hochgeladen. Aufnahmen entstehen in deinem Browser und verlassen ihn erst, wenn du sie speicherst.",

  "options.section.capture": "Aufnahme",
  "options.preScroll.label": "Seite vorher einmal durchscrollen",
  "options.preScroll.hint":
    "Ein schneller Durchlauf, damit nachgeladene Bilder im Bild sind. Langsamer, dafür kaum leere Stellen.",
  "options.hideFixed.label": "Klebende Kopfzeilen und schwebende Leisten ausblenden",
  "options.hideFixed.hint":
    "Verhindert, dass Navigationsleisten und Cookie-Banner sich durch das ganze Bild ziehen.",
  "options.pageFrame.label": "Seitenrahmen behalten",
  "options.pageFrame.hint":
    "Bei Anwendungen, die eine innere Fläche scrollen, bleiben Kopfzeile und Seitenleiste im Bild, statt nur die Fläche aufzunehmen.",
  "options.freezeMotion.label": "Animationen anhalten",
  "options.freezeMotion.hint":
    "Friert CSS-Animationen während der Aufnahme ein. Lass es aus, wenn eine Seite Inhalte beim Scrollen einblendet.",
  "options.showOverlay.label": "Fortschritt auf der Seite anzeigen",
  "options.showOverlay.hint":
    "Eine kleine Karte in der Ecke mit Abbrechen-Knopf. Sie erscheint nie im Bild.",
  "options.settleMs.label": "Nach jedem Scrollen warten",
  "options.settleMs.hint": "Gibt langsamen Seiten mehr Zeit, bevor die nächste Ansicht kommt.",
  "options.settleMs.value": "{n} ms",

  "options.captureScale.label": "Aufnahmeauflösung",
  "options.captureScale.hint": "2× zoomt die Seite, Text wird also mit doppelt so vielen Punkten aufgenommen — eine responsive Seite kann sich dabei anders anordnen.",
  "options.captureScale.x1": "1× wie angezeigt",
  "options.captureScale.x2": "2× schärfer",
  "options.pdfLossless.label": "Verlustfreie PDF-Bilder",
  "options.pdfLossless.hint": "Hält den Text scharf, statt JPEG um jeden Buchstaben ringen zu lassen. Größere Datei.",

  "options.section.output": "Ausgabe",
  "options.format.label": "Speichern als",
  "options.format.hint": "Das PDF entsteht direkt aus der Aufnahme — ohne Druckdialog.",
  "options.jpegQuality.label": "JPG-Qualität",
  "options.jpegQuality.hint": "Niedriger heißt kleinere Datei und mehr Kompressionsartefakte.",
  "options.pdfPageMode.label": "PDF-Seiten",
  "options.pdfPageMode.hint":
    "Eine lange Seite lässt die Aufnahme unversehrt; Papierformate schneiden sie zum Drucken.",
  "options.pdfPageMode.single": "Eine lange Seite",
  "options.pdfPageMode.a4": "A4-Seiten",
  "options.pdfPageMode.letter": "Letter-Seiten",
  "options.scale.label": "Bildskalierung",
  "options.scale.hint": "Verkleinert die Datei. Bei 100 % bleibt jedes Pixel erhalten.",
  "options.filename.label": "Dateiname",
  "options.filename.insert": "{token} einfügen",
  "options.openEditor.label": "Editor nach der Aufnahme öffnen",
  "options.openEditor.hint":
    "Aus, um die Datei direkt in den Download-Ordner zu legen und auf der Seite zu bleiben.",
  "options.autoDownload.label": "Ohne Nachfrage herunterladen",
  "options.autoDownload.hint":
    "Überspringt den Dialog „Speichern unter“ und schreibt direkt in den Download-Ordner.",
  "options.copyOnCapture.label": "Auch in die Zwischenablage kopieren",
  "options.copyOnCapture.hint": "Legt ein PNG in die Zwischenablage, sobald die Aufnahme fertig ist.",

  "options.section.interface": "Oberfläche",
  "options.language.label": "Sprache",
  "options.language.hint": "Gilt für das Menü, die Einstellungen und den Editor.",
  "options.theme.label": "Design",
  "options.theme.system": "System",
  "options.theme.dark": "Dunkel",
  "options.theme.light": "Hell",
  "options.shortcuts.label": "Tastenkürzel",
  "options.shortcuts.none": "Noch keine Kürzel vergeben.",
  "options.shortcuts.change": "Tastenkürzel ändern",

  "options.section.privacy": "Datenschutz",
  "options.privacy.body":
    "Longshot arbeitet vollständig auf deinem Rechner. Keine Server, keine Konten, keine Analyse. Aufnahmen entstehen im Editor-Tab und bleiben dort, bis du sie speicherst oder kopierst. Deine Einstellungen laufen über dein eigenes {browser}-Profil.",
  "options.privacy.activeTab":
    "Die Erweiterung darf eine Seite erst lesen, nachdem du dort eine Aufnahme startest — über das Symbol, ein Tastenkürzel oder das Kontextmenü.",
  "options.filename.preview": "Wird gespeichert als {name}",
  "options.saved": "Gespeichert",
  "options.reset": "Alle Einstellungen zurücksetzen",
  "options.resetDone": "Einstellungen zurückgesetzt",

  "editor.filename.tip": "Dateiname",
  "editor.filename.hint":
    "Der Name zum Speichern. Hier ändern, oder in den Einstellungen eine Vorlage festlegen.",
  "editor.zoomOut": "Verkleinern",
  "editor.zoomOut.hint": "Nur die Ansicht hier. Auf die gespeicherte Datei hat es keinen Einfluss.",
  "editor.zoomIn": "Vergrößern",
  "editor.zoomIn.hint":
    "Näher heran, um eine Markierung genau zu setzen. Leertaste halten zum Verschieben.",
  "editor.zoomReset": "Originalgröße",
  "editor.zoomReset.hint": "Zurück auf 100 %, ein Bildpunkt je Bildschirmpunkt.",
  "editor.zoomFit": "An Fenster anpassen",
  "editor.zoomFit.hint": "Die ganze Aufnahme auf einmal zeigen.",
  "editor.zoomFit.label": "Anpassen",
  "editor.copy": "Kopieren",
  "editor.copy.hint":
    "Legt das fertige Bild in die Zwischenablage, bereit für Chat oder Ticket.",
  "editor.save": "Speichern",
  "editor.save.hint": "Schreibt das Bild im daneben gewählten Format in die Downloads.",
  "editor.saveFormat": "{format} speichern",
  "editor.settings": "Einstellungen",
  "editor.settings.hint": "Aufnahmeverhalten, Dateinamen, Ausgabequalität und Design.",
  "editor.format.png.hint":
    "Verlustfrei, scharfer Text, größere Datei. Die richtige Voreinstellung für Screenshots.",
  "editor.format.jpeg.hint": "Kleinere Datei, etwas weicherer Text. Gut für bildlastige Seiten.",
  "editor.format.pdf.hint":
    "Eine lange Seite oder in A4- bzw. Letter-Blätter geschnitten — wählbar in den Einstellungen.",
  "editor.undo": "Rückgängig",
  "editor.undo.hint": "Geht Schritt für Schritt durch jede Markierung, jeden Schnitt, jede Farbe.",
  "editor.redo": "Wiederholen",
  "editor.redo.hint": "Holt zurück, was du gerade rückgängig gemacht hast.",
  "editor.delete": "Löschen",
  "editor.delete.hint": "Entfernt die gewählte Markierung. Wähle zuerst eine mit V aus.",
  "editor.size": "Größe",
  "editor.size.hint":
    "Strichstärke, Textgröße oder Unschärfe, je nach Werkzeug. Ändert auch die gewählte Markierung.",
  "editor.colour": "Farbe",
  "editor.colour.hint": "Farbe für die nächste Markierung — und für die gewählte, falls es eine gibt.",
  "editor.crop": "Zuschneiden",
  "editor.crop.apply": "Anwenden",
  "editor.crop.apply.tip": "Zuschnitt anwenden",
  "editor.crop.apply.hint":
    "Schneidet auf das gezogene Rechteck. Die Pixel bleiben erhalten — Zurücksetzen holt sie wieder.",
  "editor.crop.reset": "Zurücksetzen",
  "editor.crop.reset.tip": "Zuschnitt aufheben",
  "editor.crop.reset.hint": "Zurück zur ganzen Aufnahme, egal wie oft du zugeschnitten hast.",
  "editor.crop.needRect": "Zieh zuerst ein Rechteck über die Aufnahme",

  "editor.menu.image": "Aufnahme",
  "editor.menu.copyImage": "Bild kopieren",
  "editor.menu.duplicate": "Duplizieren",
  "editor.menu.front": "In den Vordergrund",
  "editor.menu.back": "In den Hintergrund",
  "editor.menu.editText": "Text bearbeiten",

  "editor.size.width": "Stärke",
  "editor.size.text": "Textgröße",
  "editor.size.blur": "Unschärfe",
  "editor.size.cell": "Raster",

  "editor.tools": "Werkzeuge",
  "editor.tool.select": "Auswählen und verschieben",
  "editor.tool.select.hint":
    "Nimm eine vorhandene Markierung auf — verschiebe sie, ändere ihre Größe an den Griffen oder ihre Farbe.",
  "editor.tool.crop": "Zuschneiden",
  "editor.tool.crop.hint":
    "Ränder abschneiden. Rechteck ziehen, dann Enter. Nichts geht verloren — jederzeit zurücksetzbar.",
  "editor.tool.arrow": "Pfeil",
  "editor.tool.arrow.hint": "Zeig auf das, worüber du sprichst. Shift halten für eine gerade Linie.",
  "editor.tool.line": "Linie",
  "editor.tool.line.hint": "Eine schlichte Linie zum Unterstreichen oder Verbinden. Shift hält sie gerade.",
  "editor.tool.rect": "Rechteck",
  "editor.tool.rect.hint": "Rahme einen Bereich ein. Shift halten für ein perfektes Quadrat.",
  "editor.tool.ellipse": "Ellipse",
  "editor.tool.ellipse.hint": "Umkreise etwas, ohne es zu verdecken. Shift halten für einen Kreis.",
  "editor.tool.pen": "Freihand",
  "editor.tool.pen.hint": "Zeichne wie mit dem Stift — Haken, Kreise, Gekritzel.",
  "editor.tool.text": "Text",
  "editor.tool.text.hint":
    "Klick dorthin, wo die Beschriftung hin soll, und tippe. Größe stellst du oben ein.",
  "editor.tool.step": "Nummerierter Schritt",
  "editor.tool.step.hint":
    "Setze 1-, 2-, 3-Marken, um jemanden durch einen Ablauf zu führen. Sie zählen von selbst weiter.",
  "editor.tool.highlight": "Hervorheben",
  "editor.tool.highlight.hint":
    "Zieh Farbe über einen Bereich wie mit dem Textmarker. Der Text bleibt lesbar.",
  "editor.tool.blur": "Weichzeichnen",
  "editor.tool.blur.hint":
    "Macht einen Bereich unlesbar. Größerer Radius, stärkere Unschärfe.",
  "editor.tool.pixelate": "Verpixeln",
  "editor.tool.pixelate.hint":
    "Zerlegt den Bereich in Blöcke — der vertraute Look für einen verdeckten Namen oder ein Gesicht.",
  "editor.tool.redact": "Schwärzen",
  "editor.tool.redact.hint":
    "Deckt den Bereich vollständig ab. Nichts scheint durch — nimm das für alles Heikle.",

  "editor.progress.title": "Seite wird aufgenommen",
  "editor.progress.waiting": "warte auf die erste Kachel",
  "editor.progress.tile": "Kachel {done} / {total}",
  "editor.progress.cancel": "Abbrechen",
  "editor.progress.stopping": "Wird beendet …",
  "editor.failure.title": "Aufnahme gestoppt",
  "editor.failure.close": "Diesen Tab schließen",
  "editor.dims": "{w} × {h} px",
  "editor.dims.cropped": "{w} × {h} px · zugeschnitten",
  "editor.status.ready": "Bereit",
  "editor.status.captured": "{w} × {h} px aufgenommen",
  "editor.status.truncated":
    "Die Seite war höher, als ein Bild fassen kann — aufgenommen wurde, was hineinpasst.",
  "editor.status.scaleDeclined": "Mit 1× aufgenommen: diese Seite braucht mehr Breite, als das Zoomen ihr lässt.",
  "editor.copied": "In die Zwischenablage kopiert",
  "editor.copyFailed": "Kopieren fehlgeschlagen: {error}",
  "editor.saved": "{name} gespeichert · {size}",
  "editor.saveFailed": "Speichern fehlgeschlagen: {error}",
  "editor.lostCapture":
    "Dieser Tab hat seine Aufnahme verloren. Starte eine neue über die Symbolleiste.",
  "editor.stoppedEarly": "Die Aufnahme wurde vorzeitig beendet.",
  "editor.noPixels": "Von dieser Seite kamen keine Bildpunkte zurück.",
  "editor.hints":
    "{v} Auswahl {c} Zuschnitt {a} Pfeil {t} Text {b} Unschärfe {space} Verschieben {ctrl}+{s} Speichern",

  "capture.title": "Seite wird aufgenommen",
  "capture.cancel": "Abbrechen",
  "capture.stopping": "Wird beendet …",
  "capture.tile": "Kachel {done} / {total}",
  "menu.full": "Ganze Seite aufnehmen",
  "menu.visible": "Sichtbaren Bereich aufnehmen",
  "action.title": "Longshot — diese Seite aufnehmen",
  "action.busy": "Es läuft bereits eine Aufnahme",
  "error.restricted":
    "{browser} blockiert Erweiterungen auf dieser Seite. Versuch es auf einer normalen http://- oder https://-Seite.",
  "error.noVisibleArea": "Diese Seite hat keinen sichtbaren Bereich zum Aufnehmen.",
  "error.interrupted": "Die Aufnahme wurde unterbrochen.",
  "error.cancelled": "Aufnahme abgebrochen.",
  "error.unknownMessage": "Unbekannte Nachricht.",
  "error.couldNotRead": "Diese Seite konnte nicht gelesen werden.",
  "error.notActive": "Die Seite war nicht mehr der aktive Tab, daher wurde die Aufnahme beendet.",
  "error.refused": "{browser} hat eine Aufnahme dieses Tabs verweigert.",
  "error.hostPermission":
    "{browser} erlaubt Erweiterungen nicht, {host} zu lesen. Öffne die Seite auf einer normalen Website und versuch es erneut.",
  "error.reloaded": "Die Seite wurde während der Aufnahme neu geladen. Lade sie neu und versuch es erneut.",
  "error.editorTimeout": "Der Editor-Tab hat sich nicht rechtzeitig geöffnet.",
  "error.tooLarge": "Das Bild ist zu groß zum Kodieren.",
};
