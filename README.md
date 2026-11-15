# Repère-marqueur

Tape un code de couleur (ex. `BV312`) ou un nom (ex. `Cerulean`) : l'app encercle en rouge le marqueur sur la photo de la trousse.

## Fonctionnement

1. La photo est découpée en 12 zones qui se chevauchent, pour que les étiquettes soient assez grosses à lire.
2. Chaque zone est envoyée à l'API Claude (vision), qui renvoie les codes lus et leur position.
3. Le résultat est gardé sur l'appareil : l'analyse se fait une seule fois par photo, la recherche est ensuite instantanée.
4. Si un code n'a pas été lu, le bouton « Chercher directement sur la photo » relance une recherche ciblée sur ce code.

## Première ouverture

L'app demande une photo de la trousse (appareil photo ou photothèque), puis l'analyse toute seule. La photo et les codes lus restent sur l'appareil de chaque personne (IndexedDB et localStorage) : il n'y a ni compte ni photo partagée.

## Onglets

- **Trouver** : recherche par code ou par nom, gros plan et cercle rouge sur la photo.
- **Assistant** : une conversation. Demande un sujet (« un nuage ») ou un fade à partir d'un code ; Claude choisit 3 à 7 marqueurs de ta trousse et la réponse les montre encerclés en rouge sur la photo. On peut joindre une photo de son dessin pour avoir des suggestions zone par zone.
- **Guide** : décodeur de code (famille, saturation, luminosité), règles pour un fade, et la liste des fades possibles avec les marqueurs de la trousse.
- **Trousse** : changer la photo, lancer l'analyse, voir toutes les couleurs lues. Les capuchons vus mais non lus (reflet, flou) sont signalés ; tu tapes leur code à la main. On y retrouve aussi les palettes enregistrées et la liste des marqueurs vides à racheter.

Sur iPhone : Safari → Partager → « Sur l'écran d'accueil » pour l'ouvrir comme une app.

## Fichiers

- `index.html` : toute l'interface (aucune dépendance, aucun build).
- `api/claude.js` : fonction serverless Vercel qui appelle l'API Claude. La clé reste côté serveur.
- `ohuhu-codes.js` : les 320 codes et noms de la gamme Honolulu (nouveaux codes), pour vérifier les codes lus.
- `manifest.json`, `icon-*.png` : installation sur l'écran d'accueil.

## Déploiement sur Vercel

1. Importer ce dépôt dans Vercel (preset « Other », aucun build).
2. Ajouter la variable d'environnement `ANTHROPIC_API_KEY`.
3. Facultatif : `CLAUDE_MODEL` pour changer de modèle (défaut : `claude-sonnet-5-5`).

## En local

```bash
npm i -g vercel
vercel dev
```

## Coût

Une analyse complète fait 12 appels avec image. Une recherche ciblée en fait 12 autres, plus courts. Chaque message à l'assistant fait un seul appel, sans image.
