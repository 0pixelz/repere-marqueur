# Repère-marqueur

Tape un code de couleur (ex. `BV312`) ou un nom (ex. `Cerulean`) : l'app encercle en rouge le marqueur sur la photo de la trousse.

## Fonctionnement

1. La photo est découpée en 12 zones qui se chevauchent, pour que les étiquettes soient assez grosses à lire.
2. Chaque zone est envoyée à l'API Claude (vision), qui renvoie les codes lus et leur position.
3. Le résultat est gardé dans le navigateur : l'analyse se fait une seule fois par photo, la recherche est ensuite instantanée.
4. Si un code n'a pas été lu, le bouton « Chercher directement sur la photo » relance une recherche ciblée sur ce code.

## Onglets

- **Trouver** : recherche par code ou par nom, gros plan et cercle rouge sur la photo.
- **Idées** : décris un sujet (« un nuage ») ou une couleur de départ ; Claude choisit 3 à 7 marqueurs de ta trousse, du plus clair au plus foncé, et l'app les montre sur la photo.
- **Trousse** : changer la photo, lancer l'analyse, voir toutes les couleurs lues.

Sur iPhone : Safari → Partager → « Sur l'écran d'accueil » pour l'ouvrir comme une app.

## Fichiers

- `index.html` : toute l'interface (aucune dépendance, aucun build).
- `api/claude.js` : fonction serverless Vercel qui appelle l'API Claude. La clé reste côté serveur.
- `trousse.jpg` : photo par défaut.
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

Une analyse complète fait 12 appels avec image. Une recherche ciblée en fait 12 autres, plus courts. Une demande dans Idées fait un seul appel, sans image.
