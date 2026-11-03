---
created_at: "2026-11-03"
updated_at: "2026-11-03"
application_version: "0.1.0"
---

# Tabs Vault

Extension Manifest V3 en JavaScript, HTML et CSS natifs. Les liens sont stockés dans le profil du navigateur, sans compte ni service externe. Version de développement : 0.1.0.

## Sommaire

- [Développer](#développer)
- [Charger l’extension](#charger-lextension)
- [Utiliser](#utiliser)
- [Tester](#tester)
- [Organisation](#organisation)
- [Limites de validation](#limites-de-validation)

## Développer

Prérequis : Node.js 24 (voir `.nvmrc`) et npm. Commandes Bash depuis la racine du dépôt :

```bash
npm ci
npm run dev
```

Ouvrir la page `library.html` du serveur Vite. Cet aperçu utilise un stockage local séparé, avec un bouton d’ajout de liens de démonstration ; il ne simule pas les captures ni les ouvertures natives. Il n’est pas connecté aux données de l’extension. Les modules métier sont partagés entre les deux modes.

## Charger l’extension

```bash
npm run build
```

Dans le gestionnaire d’extensions du navigateur, activer le mode développeur puis charger le dossier `dist/` comme extension non empaquetée. Après modification, reconstruire puis recharger l’extension et son onglet bibliothèque. Aucun serveur Vite n’est requis pour utiliser le build.

Le manifeste utilise `storage`, `tabs`, `tabGroups` et `contextMenus`. Il exclut la navigation privée et ne demande aucun accès aux sites. Une politique administrateur peut interdire le chargement non empaqueté : utiliser un environnement de développement qui l’autorise, sans contourner la politique.

## Utiliser

- Cliquer sur le bouton de l’extension pour sauvegarder immédiatement l’onglet actif. Le badge et le titre du bouton confirment le résultat.
- Faire un clic droit sur ce bouton pour ouvrir la bibliothèque ou capturer le groupe actif/la fenêtre.
- Résoudre les noms manquants et collisions avant de confirmer une capture. Les URLs non prises en charge sont signalées, sans fermer d’onglet.
- Les boutons « + » des zones tags et groupes de chaque lien ouvrent une recherche de tags/groupes : cocher ajoute, décocher retire. Créer un élément depuis ce panneau l’associe immédiatement ; le panneau reste ouvert pour plusieurs changements. Deux tags sont visibles par ligne, puis « +N » donne accès à la liste complète.
- Les actions secondaires des liens, groupes et tags se trouvent dans leur menu « … ». Les actions de sélection apparaissent dans une barre contextuelle.
- Dans la bibliothèque : rechercher, filtrer par tags ou groupes, modifier un lien et ses appartenances, puis ouvrir un lien ou une sélection. Les listes affichent 100 liens à la fois ; « Afficher les suivants » charge la suite, et « Tout sélectionner » couvre tous les résultats filtrés.
- « Corbeille » masque un lien sans l’effacer. La vue dédiée le réactive avec ses tags et groupes, recréés si nécessaire. « Vider la corbeille » exige une confirmation et est irréversible.
- L’export JSON exclut la corbeille. L’import ajoute, complète et réactive les liens existants ; il demande une destination en cas de groupe homonyme. Exporter régulièrement : une désinstallation peut effacer les données locales.

## Tester

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run test:e2e:extension
```

`npm test` exécute Vitest : logique métier, stockage sérialisé et adaptateur navigateur simulé. `test:e2e` construit puis teste la vraie interface via Playwright sur un serveur local, avec stockage d’aperçu. `test:e2e:extension` est distinct et exige un navigateur autorisant le chargement réel d’une extension ; il vérifie le chargement Manifest V3 et la communication avec le worker.

Pour utiliser un Chromium déjà installé (Bash) :

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Les parcours suivent les identifiants BDD de la [stratégie de test](docs/strategie-tests.md). Les actions utilisateur sont modélisées par les Page Objects de `tests/e2e/pages/` ; aucun framework BDD n’est utilisé. Les tests utilisent uniquement des URLs fictives et des profils isolés.

## Organisation

- `src/domain/` : règles de liens, groupes, tags, corbeille, export/import et recherche.
- `src/storage/` : écritures séquentielles et contrôle des révisions.
- `src/browser/` : captures et ouvertures via les API Chromium.
- `src/background/` : worker, action, menus et validation des messages.
- `src/library/` : interface DOM native et client de messages.
- [Documents de conception](docs/README.md) : exigences, architecture et scénarios.

## Limites de validation

La validation réelle sur Chrome, Edge, Brave et Opera est à effectuer par l’utilisateur. L’aperçu Playwright ne valide ni les boutons natifs ni les Tab Islands. Le regroupement utilise les groupes natifs dans la fenêtre courante, avec ouverture dans une nouvelle fenêtre si l’API est indisponible. Un échec après ouverture ne duplique pas les onglets ; le bilan distingue les échecs à réessayer.

Le pilotage des Tab Islands et la lecture de leurs noms dans Opera restent à vérifier. Le [rapport de compatibilité](docs/verification-compatibilite.md) distingue les sources officielles, les observations et les contrôles encore nécessaires.
