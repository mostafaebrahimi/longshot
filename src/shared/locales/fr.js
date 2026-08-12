/** French. */
export default {
  "lang.name": "Français",

  "app.tagline": "capture de page entière",
  "popup.settings": "Réglages",
  "popup.blocked.title": "{browser} bloque les extensions ici.",
  "popup.blocked.detail": "Ouvrez une page http:// ou https:// normale et réessayez.",
  "popup.blocked.geckoFileTitle": "Firefox bloque les fichiers locaux.",
  "popup.blocked.geckoFileDetail":
    "Firefox n’autorise pas les extensions à lire les pages servies depuis votre disque. Ouvrez la page en http:// ou https://.",
  "popup.blocked.fileTitle": "Les fichiers locaux demandent une autorisation.",
  "popup.blocked.fileDetail":
    "Activez « Autoriser l’accès aux URL de fichier » sur la page de détails de l’extension pour capturer des fichiers de votre disque.",
  "popup.full.title": "Capturer la page entière",
  "popup.full.sub": "Fait défiler la page et assemble tous les écrans",
  "popup.visible.title": "Capturer la zone visible",
  "popup.visible.sub": "Seulement ce qui est à l’écran maintenant",
  "popup.saveAs": "Enregistrer en",
  "popup.openEditor": "Ouvrir l’éditeur après la capture",
  "popup.autoDownload": "Télécharger sans demander",
  "popup.changeShortcuts": "Modifier les raccourcis",
  "popup.allSettings": "Tous les réglages",

  "options.title": "Réglages de Longshot",
  "options.subtitle": "capture de page entière · réglages",
  "options.welcome.title": "Tout est prêt.",
  "options.welcome.body":
    "Ouvrez n’importe quelle page et appuyez sur <kbd id=\"welcome-shortcut\">Alt+Shift+P</kbd>, ou cliquez sur l’icône Longshot dans la barre d’outils. La page défile toute seule, chaque écran est assemblé en une image, et l’éditeur s’ouvre prêt à rogner, annoter et enregistrer.",
  "options.welcome.privacy":
    "Rien n’est envoyé. Les captures sont assemblées dans votre navigateur et n’en sortent que lorsque vous les enregistrez.",

  "options.section.capture": "Capture",
  "options.preScroll.label": "Parcourir la page d’abord",
  "options.preScroll.hint":
    "Fait un passage rapide pour que les images différées apparaissent. Plus lent, mais bien moins de trous.",
  "options.hideFixed.label": "Masquer les en-têtes fixes et les barres flottantes",
  "options.hideFixed.hint":
    "Évite que les barres de navigation et les bandeaux cookies se répètent sur toute la capture.",
  "options.pageFrame.label": "Conserver le cadre de la page",
  "options.pageFrame.hint":
    "Sur les applications qui font défiler un panneau interne, garde l’en-tête et la barre latérale autour de la capture au lieu du seul panneau.",
  "options.freezeMotion.label": "Mettre les animations en pause",
  "options.freezeMotion.hint":
    "Fige les animations CSS pendant la capture. Laissez désactivé si la page révèle du contenu au défilement.",
  "options.showOverlay.label": "Afficher la progression sur la page",
  "options.showOverlay.hint":
    "Une petite carte dans le coin, avec un bouton d’annulation. Elle n’apparaît jamais dans la capture.",
  "options.settleMs.label": "Attendre après chaque défilement",
  "options.settleMs.hint":
    "Laisse aux pages lentes le temps de se stabiliser avant l’écran suivant.",
  "options.settleMs.value": "{n} ms",

  "options.captureScale.label": "Résolution de capture",
  "options.captureScale.hint": "2× zoome la page : le texte est capturé avec deux fois plus de détail — mais une page responsive peut se réagencer.",
  "options.captureScale.x1": "1× tel qu’affiché",
  "options.captureScale.x2": "2× plus net",
  "options.pdfLossless.label": "Images PDF sans perte",
  "options.pdfLossless.hint": "Garde le texte net au lieu de laisser le JPEG baver autour de chaque lettre. Fichier plus lourd.",

  "options.section.output": "Sortie",
  "options.format.label": "Enregistrer en",
  "options.format.hint": "Le PDF est écrit directement depuis la capture, sans boîte d’impression.",
  "options.jpegQuality.label": "Qualité JPG",
  "options.jpegQuality.hint": "Plus bas, plus le fichier est petit et les artefacts visibles.",
  "options.pdfPageMode.label": "Pages du PDF",
  "options.pdfPageMode.hint":
    "Une longue page garde la capture intacte ; les formats papier la découpent pour l’impression.",
  "options.pdfPageMode.single": "Une longue page",
  "options.pdfPageMode.a4": "Pages A4",
  "options.pdfPageMode.letter": "Pages Letter",
  "options.scale.label": "Échelle de l’image",
  "options.scale.hint": "Réduit le fichier enregistré. À 100%, chaque pixel capturé est conservé.",
  "options.filename.label": "Nom du fichier",
  "options.filename.insert": "Insérer {token}",
  "options.openEditor.label": "Ouvrir l’éditeur après la capture",
  "options.openEditor.hint":
    "Désactivez pour enregistrer directement dans vos téléchargements et rester sur la page.",
  "options.autoDownload.label": "Télécharger sans demander",
  "options.autoDownload.hint":
    "Passe la boîte « Enregistrer sous » et écrit directement dans vos téléchargements.",
  "options.copyOnCapture.label": "Copier aussi dans le presse-papiers",
  "options.copyOnCapture.hint": "Met un PNG dans le presse-papiers dès la fin de la capture.",

  "options.section.interface": "Interface",
  "options.language.label": "Langue",
  "options.language.hint": "S’applique au menu, aux réglages et à l’éditeur.",
  "options.theme.label": "Thème",
  "options.theme.system": "Système",
  "options.theme.dark": "Sombre",
  "options.theme.light": "Clair",
  "options.shortcuts.label": "Raccourcis clavier",
  "options.shortcuts.none": "Aucun raccourci attribué pour l’instant.",
  "options.shortcuts.change": "Modifier les raccourcis",

  "options.section.privacy": "Confidentialité",
  "options.privacy.body":
    "Longshot fonctionne entièrement sur votre machine. Pas de serveurs, pas de comptes, pas de statistiques. Les captures sont assemblées dans l’onglet de l’éditeur et y restent jusqu’à ce que vous les enregistriez ou les copiiez. Vos réglages se synchronisent via votre propre profil {browser}.",
  "options.privacy.activeTab":
    "L’extension ne peut lire une page qu’après que vous y avez lancé une capture — par l’icône de la barre d’outils, un raccourci ou le menu contextuel.",
  "options.filename.preview": "Enregistré sous {name}",
  "options.saved": "Enregistré",
  "options.reset": "Réinitialiser tous les réglages",
  "options.resetDone": "Réglages réinitialisés",

  "editor.filename.tip": "Nom du fichier",
  "editor.filename.hint":
    "Le nom sous lequel c’est enregistré. Modifiez-le ici, ou définissez un modèle dans les réglages.",
  "editor.zoomOut": "Dézoomer",
  "editor.zoomOut.hint": "L’affichage ici seulement. Sans effet sur le fichier enregistré.",
  "editor.zoomIn": "Zoomer",
  "editor.zoomIn.hint":
    "Approchez pour placer une marque au pixel près. Maintenez Espace pour vous déplacer.",
  "editor.zoomReset": "Taille réelle",
  "editor.zoomReset.hint": "Retour à 100 % : un pixel d’image par pixel d’écran.",
  "editor.zoomFit": "Ajuster à la fenêtre",
  "editor.zoomFit.hint": "Voir toute la capture d’un coup.",
  "editor.zoomFit.label": "Ajuster",
  "editor.copy": "Copier",
  "editor.copy.hint":
    "Met l’image finie dans le presse-papiers, prête à coller dans une discussion ou un ticket.",
  "editor.save": "Enregistrer",
  "editor.save.hint": "Écrit l’image dans vos téléchargements, au format choisi à côté.",
  "editor.saveFormat": "Enregistrer en {format}",
  "editor.settings": "Réglages",
  "editor.settings.hint": "Comportement de capture, noms de fichiers, qualité et thème.",
  "editor.format.png.hint":
    "Sans perte, texte net, fichier plus gros. Le bon choix par défaut pour une capture.",
  "editor.format.jpeg.hint": "Fichier plus léger, texte un peu mou. Bien pour une page très imagée.",
  "editor.format.pdf.hint":
    "Une longue page, ou découpée en feuilles A4 ou Letter — au choix dans les réglages.",
  "editor.undo": "Annuler",
  "editor.undo.hint": "Revient en arrière sur chaque marque, rognage et changement de couleur.",
  "editor.redo": "Rétablir",
  "editor.redo.hint": "Remet ce que vous venez d’annuler.",
  "editor.delete": "Supprimer",
  "editor.delete.hint": "Efface la marque sélectionnée. Sélectionnez-en une avec V d’abord.",
  "editor.size": "Taille",
  "editor.size.hint":
    "Épaisseur, taille du texte ou force du flou, selon l’outil. Modifie aussi la marque sélectionnée.",
  "editor.colour": "Couleur",
  "editor.colour.hint": "Couleur de la prochaine marque — et de celle sélectionnée, s’il y en a une.",
  "editor.crop": "Rogner",
  "editor.crop.apply": "Appliquer",
  "editor.crop.apply.tip": "Appliquer le rognage",
  "editor.crop.apply.hint":
    "Rogne au rectangle tracé. Les pixels sont gardés — Réinitialiser les ramène.",
  "editor.crop.reset": "Réinitialiser",
  "editor.crop.reset.tip": "Annuler le rognage",
  "editor.crop.reset.hint": "Retour à la capture entière, quel que soit le nombre de rognages.",
  "editor.crop.needRect": "Tracez d’abord un rectangle sur la capture",

  "editor.menu.image": "Capture",
  "editor.menu.copyImage": "Copier l’image",
  "editor.menu.duplicate": "Dupliquer",
  "editor.menu.front": "Mettre au premier plan",
  "editor.menu.back": "Mettre à l’arrière-plan",
  "editor.menu.editText": "Modifier le texte",

  "editor.size.width": "Épaisseur",
  "editor.size.text": "Taille du texte",
  "editor.size.blur": "Flou",
  "editor.size.cell": "Cellule",

  "editor.tools": "Outils",
  "editor.tool.select": "Sélectionner et déplacer",
  "editor.tool.select.hint":
    "Reprenez une marque déjà tracée : déplacez-la, redimensionnez-la par ses poignées, ou changez sa couleur.",
  "editor.tool.crop": "Rogner",
  "editor.tool.crop.hint":
    "Coupez les bords. Tracez un rectangle, puis Entrée. Rien n’est jeté — réinitialisez quand vous voulez.",
  "editor.tool.arrow": "Flèche",
  "editor.tool.arrow.hint": "Montrez ce dont vous parlez. Maintenez Maj pour garder la flèche droite.",
  "editor.tool.line": "Ligne",
  "editor.tool.line.hint": "Une simple ligne, pour souligner ou relier. Maintenez Maj pour l’aligner.",
  "editor.tool.rect": "Rectangle",
  "editor.tool.rect.hint": "Encadrez une zone. Maintenez Maj pour un carré parfait.",
  "editor.tool.ellipse": "Ellipse",
  "editor.tool.ellipse.hint": "Entourez quelque chose sans le couvrir. Maintenez Maj pour un cercle.",
  "editor.tool.pen": "Main levée",
  "editor.tool.pen.hint": "Dessinez comme au stylo : coches, cercles, gribouillis.",
  "editor.tool.text": "Texte",
  "editor.tool.text.hint":
    "Cliquez à l’endroit de l’étiquette et écrivez. La taille se règle dans la barre au-dessus.",
  "editor.tool.step": "Étape numérotée",
  "editor.tool.step.hint":
    "Posez des pastilles 1, 2, 3 pour guider quelqu’un pas à pas. Elles se numérotent seules.",
  "editor.tool.highlight": "Surligner",
  "editor.tool.highlight.hint":
    "Passez de la couleur sur une zone comme au surligneur. Le texte reste lisible dessous.",
  "editor.tool.blur": "Flouter",
  "editor.tool.blur.hint":
    "Adoucit une zone jusqu’à la rendre illisible. Augmentez le rayon pour un flou plus fort.",
  "editor.tool.pixelate": "Pixelliser",
  "editor.tool.pixelate.hint":
    "Casse la zone en blocs — l’aspect habituel d’un nom ou d’un visage masqué.",
  "editor.tool.redact": "Caviarder",
  "editor.tool.redact.hint":
    "Couvre la zone entièrement. Rien ne transparaît : à utiliser pour tout ce qui est sensible.",

  "editor.progress.title": "Capture de la page",
  "editor.progress.waiting": "en attente de la première tuile",
  "editor.progress.tile": "tuile {done} / {total}",
  "editor.progress.cancel": "Annuler",
  "editor.progress.stopping": "Arrêt…",
  "editor.failure.title": "Capture interrompue",
  "editor.failure.close": "Fermer cet onglet",
  "editor.dims": "{w} × {h} px",
  "editor.dims.cropped": "{w} × {h} px · rognée",
  "editor.status.ready": "Prêt",
  "editor.status.captured": "{w} × {h} px capturés",
  "editor.status.truncated":
    "La page dépassait ce qu’une image peut contenir — tout ce qui tient a été capturé.",
  "editor.status.scaleDeclined": "Capturée en 1× : cette page a besoin de plus de largeur que le zoom ne lui en laisse.",
  "editor.copied": "Copié dans le presse-papiers",
  "editor.copyFailed": "Copie impossible : {error}",
  "editor.saved": "{name} enregistré · {size}",
  "editor.saveFailed": "Enregistrement impossible : {error}",
  "editor.lostCapture":
    "Cet onglet a perdu la trace de sa capture. Relancez-en une depuis la barre d’outils.",
  "editor.stoppedEarly": "La capture s’est arrêtée avant la fin.",
  "editor.noPixels": "Aucun pixel n’est revenu de cette page.",
  "editor.hints":
    "{v} sélection {c} rognage {a} flèche {t} texte {b} flou {space} déplacer {ctrl}+{s} enregistrer",

  "capture.title": "Capture de la page",
  "capture.cancel": "Annuler",
  "capture.stopping": "Arrêt…",
  "capture.tile": "tuile {done} / {total}",
  "menu.full": "Capturer la page entière",
  "menu.visible": "Capturer la zone visible",
  "action.title": "Longshot — capturer cette page",
  "action.busy": "Une capture est déjà en cours",
  "error.restricted":
    "{browser} bloque les extensions sur cette page. Essayez sur un site http:// ou https:// normal.",
  "error.noVisibleArea": "Cette page n’a aucune zone visible à capturer.",
  "error.interrupted": "La capture a été interrompue.",
  "error.cancelled": "Capture annulée.",
  "error.unknownMessage": "Message inconnu.",
  "error.couldNotRead": "Impossible de lire cette page.",
  "error.notActive": "La page n’était plus l’onglet actif, la capture s’est donc arrêtée.",
  "error.refused": "{browser} a refusé de prendre une capture de cet onglet.",
  "error.hostPermission":
    "{browser} n’autorise pas les extensions à lire {host}. Ouvrez la page sur un site normal et réessayez.",
  "error.reloaded": "La page s’est rechargée pendant la capture. Rechargez-la et réessayez.",
  "error.editorTimeout": "L’onglet de l’éditeur ne s’est pas ouvert à temps.",
  "error.tooLarge": "L’image est trop grande pour être encodée.",
};
