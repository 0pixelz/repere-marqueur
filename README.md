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

- **Trouver** : recherche par code ou par nom dans toutes les trousses, gros plan et cercle rouge sur la photo. **Pipette** : on touche une couleur sur une image de référence et l'app donne les marqueurs les plus proches.
- **Assistant** : une conversation. Demande un sujet ou un fade ; Claude choisit dans les trousses et la réponse montre les marqueurs encerclés. Avec une photo de dessin jointe : pastilles numérotées sur le dessin, aperçu rempli, et enregistrement en projet.
- **Fade** : on entre le code du marqueur qu'on a en main ; l'app propose les plus clairs et les plus foncés à sortir (même famille, même saturation si possible) et les encercle sur la photo. Aucun appel à Claude.
- **Tons** : tous les marqueurs rangés par niveau de luminosité (ou de saturation), avec filtre par famille.
- **Guide** : décodeur de code, règles pour un fade, fades possibles, et ce qui manque (références absentes et trous dans les fades).
- **Trousse** : plusieurs trousses (une photo et une analyse chacune), capuchons à vérifier avec suggestions de code, nuancier réel, marqueurs à racheter, projets et palettes, toutes les couleurs lues.

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

Une analyse complète fait 12 appels avec image. Une recherche ciblée en fait 12 autres, plus courts. Chaque message à l'assistant fait un seul appel (avec l'image du dessin si elle est jointe). La lecture d'un nuancier fait 12 appels. La pipette, l'aperçu rempli, les couleurs manquantes et les suggestions de code ne font aucun appel.
