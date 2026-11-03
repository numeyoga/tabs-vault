---
created_at: "2026-11-03"
updated_at: "2026-11-03"
application_version: "0.1.0"
---

# Vérification des spécifications et de la compatibilité

Rapport du 3 novembre 2026. Les premières sections conservent les observations réalisées avant implémentation et distinguent vérification documentaire et essai d’API. La dernière section décrit les contrôles de la version de développement 0.1.0.

## Sommaire

- [Décisions fonctionnelles](#décisions-fonctionnelles)
- [Sources officielles](#sources-officielles)
- [Essai dans cet environnement](#essai-dans-cet-environnement)
- [Conséquences pour la réalisation](#conséquences-pour-la-réalisation)
- [Implémentation 0.1.0](#implémentation-010)

## Décisions fonctionnelles

Les derniers points soumis à l’utilisateur sont confirmés : menu contextuel pour capturer groupe/fenêtre ; recherche par titre, URL et tags avec filtres combinables et tri par date décroissante ; navigation privée exclue ; refus d’une modification vers une URL existante ; import réactivant une URL locale en corbeille. Les documents ont été mis à jour en conséquence.

Contrôles documentaires : métadonnées, liens relatifs, ancres, identifiants BDD et absence des anciennes questions résolues. Ces contrôles ne prouvent pas le comportement d’une future implémentation.

## Sources officielles

Pages consultées avec succès par HTTPS le 2026-11-03 :

| Source | Constat | Limite |
| --- | --- | --- |
| [Chrome : tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) | API disponible depuis Chrome 89 ; permission `tabGroups` ; lecture et modification des groupes. Regroupement et lecture des membres relèvent de `tabs`. | Ne démontre pas le comportement des autres navigateurs Chromium. |
| [Opera : API d’extensions](https://help.opera.com/en/extensions/apis/) | La page décrit les API communes avec Chrome et liste `Tabs`, mais ne liste pas `tabGroups`. | Page portant une date de modification de 2024 ; l’absence d’entrée ne prouve pas l’absence de l’API dans Opera actuel. |
| [Opera : Tab Islands](https://www.opera.com/features/tab-islands) | Fonction de regroupement avec noms et couleurs, création automatique ou manuelle, renommage depuis l’interface. | La page ne décrit pas de contrat d’API d’extension pour créer, lire ou renommer ces îlots. |

Conclusion documentaire : l’intégration aux groupes Chrome est documentée. Le contrôle des Tab Islands d’Opera par `chrome.tabGroups` reste non confirmé. Ne pas annoncer leur support natif sur cette seule base.

## Essai dans cet environnement

Chromium 155.0.8059.79 est installé sous Linux Debian 13. Chrome, Edge, Brave et Opera ne sont pas installés. Aucune validation produit sur ces quatre navigateurs n’est donc revendiquée.

Une extension Manifest V3 temporaire, extérieure au dépôt, est utilisée pour sonder la création d’un groupe de deux onglets, son titre, son ordre, sa fenêtre, le stockage local et la création d’un menu d’action. Elle possède une permission HTTP de boucle locale uniquement pour transmettre le résultat au processus de test ; cette permission n’appartient pas au manifeste prévu de Tabs Vault.

Résultat : **bloqué avant exécution des assertions**. Le chargement par les options de ligne de commande n’a pas chargé l’extension. Un chargement explicite par le protocole de débogage Chromium (`Extensions.loadUnpacked`) a ensuite retourné :

```text
Loading of unpacked extensions is disabled by the administrator.
```

Aucune restriction administrateur n’a été modifiée. Aucun test de groupe, stockage ou menu de la sonde ne peut être déclaré réussi. Pour exécuter les tests d’extension, il faut un navigateur/environnement de test autorisant explicitement le chargement d’extensions non empaquetées.

Le contrôle documentaire a réussi sur les cinq fichiers : métadonnées, 39 liens locaux et leurs ancres, ainsi que 19 identifiants de scénarios BDD distincts. `git diff --check` ne signale aucune erreur de whitespace. Aucun rendu Markdown visuel ni test applicatif n’a été exécuté.

## Conséquences pour la réalisation

- Garder un adaptateur de capacités et vérifier les appels réels, pas seulement la présence de propriétés.
- Avec groupes natifs fonctionnels : ouvrir dans la fenêtre courante et réappliquer le nom.
- Sans groupes natifs : ouvrir le lot dans une nouvelle fenêtre conformément au besoin confirmé.
- La capture d’un groupe nommé nécessite aussi la lecture de son identité et de son titre ; si Opera ne l’expose pas, cette fonction doit être signalée indisponible. Le repli de réouverture ne résout pas la capture d’un îlot inaccessible.
- Tester Opera réel avant de décider d’une variante de manifeste ou d’annoncer le support des Tab Islands. La compatibilité Edge et Brave exige aussi des essais réels.
- Les tests Vitest et Playwright de l’application sont maintenant disponibles ; voir la section suivante. La sonde d’API n’est ni un test du produit ni une validation de ses scénarios BDD.

## Implémentation 0.1.0

Version de développement définie dans `package.json` et `public/manifest.json`, sans framework runtime ni dépendance de production. Construction Vite avec fichiers statiques et worker module. Le manifeste exclut la navigation privée, n’expose aucun popup et ne demande aucun accès aux sites. L’inspection des sources ne trouve ni appel réseau, ni injection `innerHTML`, ni `eval`.

Contrôles exécutés le 2026-11-03 :

- **38 tests Vitest réussis**, aucun ignoré : domaine, corbeille et restauration, import/export, révisions, quotas simulés, messages du worker et API navigateur simulées.
- **10 parcours Playwright réussis**, aucun ignoré : interface compilée avec stockage d’aperçu, actions via Page Objects, import avec collisions, rendu de texte hostile, corbeille et réactivation après rechargement.
- Import de **5 000 liens**, affichage initial limité à 100 lignes et recherche sous le seuil de **300 ms** dans le parcours dédié, sur Chromium 155.0.8059.79 / Linux de cet environnement. La mesure porte sur recherche et mise à jour DOM synchrones, sans latence du protocole Playwright ; les résultats ne préjugent pas des performances d’autres machines.
- **Build de production réussi** ; sortie chargeable dans `dist/`. Tests de logique et d’interface distincts de la validation native.

La suite séparée `npm run test:e2e:extension` est fournie pour un environnement autorisant les extensions non empaquetées ; elle n’est pas déclarée réussie ici. Le blocage administrateur observé précédemment demeure une limite connue. La validation réelle Chrome, Edge, Brave et Opera est confiée à l’utilisateur, conformément à sa demande. Aucun résultat de la suite d’aperçu n’est présenté comme une preuve de fonctionnement des boutons, permissions ou Tab Islands natifs.

Complément du 2026-11-03 — organisation rapide : **41 tests Vitest** et **13 parcours Playwright d’interface** réussis, aucun ignoré. Les nouveaux scénarios couvrent création/association atomique, bascule, persistance, cinq tags compactés, clavier, fermeture extérieure et erreur de stockage sans fausse association. Build réussi. La validation native reste distincte.

Refonte visuelle claire du 2026-11-03 : navigation latérale, menus d’actions compacts, monogrammes SVG locaux, pastilles distinctes pour tags/groupes et boutons « + » assortis. **41 tests Vitest et 14 parcours Playwright réussis** ; contrôle mobile à 390 px sans débordement, accès clavier et ordre contextuel des sections. Build réussi et rendu inspecté sur une capture avec données fictives. Validation native des navigateurs inchangée.
