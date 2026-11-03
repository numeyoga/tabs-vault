---
created_at: "2026-11-03"
updated_at: "2026-11-03"
application_version: "0.1.0"
---

# Stratégie de test et BDD

Stratégie de la version de développement 0.1.0. Les suites Vitest et Playwright sont implémentées ; leurs résultats et limites figurent dans le rapport de vérification.

Statut : décisions principales confirmées le 2026-11-03. Sauvegarde immédiate d’un onglet ; lien unique réutilisable dans plusieurs groupes ; demande utilisateur en cas de groupe existant ou sans nom ; nouvelle fenêtre si les groupes natifs sont indisponibles ; import/export JSON et corbeille persistante inclus. Vitest et Playwright sont retenus, avec tests écrits de manière BDD et Page Object Model, sans framework BDD. Valeurs également confirmées : confirmation au-delà de 20 onglets, import limité à 10 Mio et cible de 5 000 liens. Les derniers points fonctionnels listés ont été confirmés le 2026-11-03 ; voir les [décisions confirmées](README.md#décisions-confirmées). La compatibilité réelle des navigateurs relève des vérifications techniques.

## Sommaire

- [Approche retenue](#approche-retenue)
- [Page Object Model](#page-object-model)
- [Niveaux de test](#niveaux-de-test)
- [Scénarios de comportement](#scénarios-de-comportement)
- [Matrice des navigateurs](#matrice-des-navigateurs)
- [Exécution et livraison](#exécution-et-livraison)

## Approche retenue

Oui au BDD (*Behavior-Driven Development*, développement guidé par les comportements) pour définir les règles visibles avec des exemples « Étant donné / Quand / Alors ». Le BDD sert d’abord à clarifier les attentes, puis à guider des tests automatisés. Il ne remplace pas les tests unitaires ni les vérifications sur les vrais navigateurs.

Les scénarios BDD sont reliés aux tests par leurs identifiants B-xx et F-xx. Les parcours utilisent le Page Object Model (POM) pour exprimer les actions utilisateur. Aucun Cucumber, interpréteur Gherkin ou framework BDD supplémentaire. Vitest et Playwright sont confirmés. Les descriptions BDD sont maintenues en Markdown dans ce document ; les tests JavaScript suivent la même structure Étant donné / Quand / Alors et conservent les mêmes identifiants.

Pour chaque fonctionnalité : discuter les exemples et cas limites, écrire le test qui échoue, implémenter, puis simplifier en conservant les tests. Tester les résultats et les erreurs observables plutôt que la structure interne du DOM ou des fonctions.

## Page Object Model

Les Page Objects encapsulent les sélecteurs et les interactions de chaque interface : `LibraryPage` pour la bibliothèque, `TrashPage` pour la corbeille et `CaptureDialogPage` pour les confirmations de capture. Leurs méthodes expriment des intentions utilisateur : `search`, `selectLinks`, `openGroup`, `renameGroup`, `confirmCapture`. Elles ne modifient pas directement le stockage pour simuler une action utilisateur.

Les tests gardent les préconditions, l’enchaînement métier et les assertions visibles. Les Page Objects exposent des observations lisibles et utilisent en priorité les rôles et noms accessibles. La préparation technique des profils et données est isolée dans les fixtures. Les actions sur la barre du navigateur ou ses groupes natifs relèvent d’un pilote distinct, avec leurs limites d’automatisation documentées ; elles ne sont pas présentées comme des clics DOM dans la bibliothèque.

Exemple illustratif de corps de test JavaScript, indépendant du choix de runner :

```js
// B-02 / F-04 — Réutiliser le nom du groupe capturé.
// Étant donné : fixture contenant un groupe navigateur « Voyage », A puis B.
// Quand : le pilote déclenche la sauvegarde du groupe.
await browserDriver.saveActiveGroup();
await libraryPage.open();
// Alors : observer le résultat depuis l’interface.
const group = await libraryPage.readGroup('Voyage');
assert.equal(group.name, 'Voyage');
assert.deepEqual(group.linkTitles, ['A', 'B']);
```

Cet exemple n’est pas un test exécuté. L’implémentation du pilote doit préciser si elle déclenche un véritable geste navigateur ou teste le handler via les API ; un appel de handler ne valide pas le bouton natif. Chaque test conserve son identifiant BDD dans son nom pour faciliter la traçabilité.

## Niveaux de test

| Niveau | Outil retenu | Vérifications |
| --- | --- | --- |
| Unitaire | Vitest, environnement Node | Identité URL, tags, recherche, ordre, fusion, validation JSON et invariants. |
| Intégration | Vitest avec adaptateur navigateur simulé ; DOM simulé si nécessaire | Commandes, révisions, écritures concurrentes, quotas, messages, migrations, état des formulaires. |
| Parcours réels | Playwright avec extension compilée dans Chromium | Persistance, captures, groupes, ouverture, import/export, navigation clavier et erreurs partielles. |
| Compatibilité | Tests sur les quatre navigateurs réels | Action de barre, menus, permissions, stockage, groupes natifs, repli et redémarrage. |

Les doubles de test simulent des erreurs déterministes, mais ne prouvent pas le fonctionnement de `chrome.storage`, du service worker ou des groupes. Des parcours réels couvrent ces contrats. La suite `test:e2e` valide l’interface compilée avec le stockage d’aperçu, dans des contextes isolés. La suite séparée `test:e2e:extension` utilise un profil temporaire dédié et une extension Manifest V3 chargée dans un contexte persistant ; elle nécessite un navigateur autorisant les extensions non empaquetées. Les deux suites utilisent Chromium sans interface. Le chargement d’extension et les boutons natifs ne sont pas validés par la suite d’aperçu.

Utiliser des pages HTTP servies localement comme onglets de test, pas de sites Internet. L’accès à ces pages résulte de leur navigation explicite ; l’extension n’effectue aucune requête de fond. Les scénarios de lot ne doivent jamais ouvrir des URLs réelles provenant d’un export personnel.

## Scénarios de comportement

Les identifiants F renvoient aux [exigences fonctionnelles](specifications-fonctionnelles.md). Ces exemples définissent les attentes ; leur syntaxe Gherkin n’implique pas l’installation de Cucumber.

```gherkin
# B-01 — F-01, F-03 : capture et doublon
Étant donné une bibliothèque vide et un onglet HTTPS actif
Quand je clique sur le bouton de l’extension
Alors un seul lien conserve son URL, son titre et sa date
Et la confirmation apparaît après l’écriture réussie
Quand je sauvegarde à nouveau cet onglet
Alors aucun deuxième lien n’est créé
Et mes tags et mon titre personnalisé sont préservés

# B-02 — F-04 : nom et ordre d’un groupe
Étant donné un groupe du navigateur nommé "Voyage" contenant A puis B
Et aucun groupe "Voyage" dans la bibliothèque
Quand je sauvegarde ce groupe
Alors la bibliothèque contient le groupe "Voyage" avec A puis B

# B-03 — F-04 : collision de nom
Étant donné un groupe "Voyage" contenant A dans la bibliothèque
Et un groupe du navigateur "Voyage" contenant A puis B
Quand je demande à sauvegarder ce groupe
Alors je dois choisir entre compléter et créer un groupe distinct
Quand je choisis de compléter le groupe existant
Alors il contient A puis B, chacun une seule fois

# B-04 — F-04 : groupe sans nom
Étant donné un groupe du navigateur sans nom
Quand je demande à le sauvegarder
Alors la saisie d’un nom est demandée avant sauvegarde
Quand j’annule
Alors la bibliothèque reste inchangée

# B-05 — F-07, F-09 : recherche et organisation
Étant donné A et B tagués "travail", et A également tagué "urgent"
Quand je filtre sur les tags "travail" et "urgent"
Alors seul A apparaît
Quand je supprime le tag "urgent"
Alors A reste sauvegardé sans ce tag

# B-06 — F-10 : ouverture groupée et repli
Étant donné un groupe sauvegardé "Voyage" contenant A puis B
Quand je le réouvre avec une API de groupes fonctionnelle
Alors A puis B s’ouvrent dans un groupe nommé "Voyage" dans la fenêtre courante
Étant donné la même bibliothèque sans API de groupes utilisable
Quand je demande une ouverture groupée
Alors les liens s’ouvrent dans une nouvelle fenêtre dans l’ordre sauvegardé

# B-07 — F-11 : suppression logique et restauration persistante
Étant donné un lien actif A
Quand je mets A à la corbeille
Alors A disparaît des vues actives et apparaît dans la corbeille
Quand je ferme puis rouvre la bibliothèque
Alors A est toujours dans la corbeille
Quand je réactive A depuis la corbeille
Alors A apparaît dans la bibliothèque et disparaît de la corbeille

# B-08 — F-12, F-13 : portabilité
Étant donné une bibliothèque contenant liens, tags et groupes ordonnés
Quand je l’exporte puis importe le fichier dans une bibliothèque vide
Alors les URLs, titres, dates, tags et appartenances ordonnées sont conservés
Et les identifiants internes sont nouvellement générés

# B-09 — F-13 : import invalide
Étant donné une bibliothèque non vide
Quand j’importe un fichier avec une référence de lien inexistante
Alors l’import est refusé avec une explication
Et les données précédentes sont intactes

# B-10 — F-01 : échec de persistance
Étant donné un stockage qui refuse l’écriture pour dépassement de quota
Quand je sauvegarde un onglet
Alors une erreur explicite est affichée sans confirmation de réussite
Et les données précédentes restent intactes

# B-11 — F-11 : retrait d’un groupe
Étant donné A présent dans les groupes "Voyage" et "À lire"
Quand je retire A du groupe "Voyage"
Alors A reste dans la bibliothèque et dans "À lire"
Et A ne figure plus dans "Voyage"

# B-12 — F-13 : import avec collision
Étant donné un lien A personnalisé et un groupe "Voyage" contenant A
Quand j’importe A et B dans un groupe nommé "Voyage"
Alors le titre existant de A est conservé et ses tags sont complétés
Et un choix entre compléter et créer un groupe distinct est demandé
Quand je choisis de compléter "Voyage"
Alors ce groupe contient A puis B sans doublon

# B-13 — F-03 : identité des URLs
Étant donné un lien sauvegardé "https://example.test/page?q=1#haut"
Quand je sauvegarde "https://example.test/page?q=2#haut"
Et je sauvegarde "https://example.test/page?q=1#bas"
Alors la bibliothèque contient trois liens distincts

# B-14 — F-11 : vider définitivement la corbeille
Étant donné A et B dans la corbeille et C actif
Quand je demande à vider la corbeille et confirme l’effacement définitif
Alors A et B ne sont plus conservés dans le stockage de la bibliothèque
Et les références à A et B sont retirées des groupes
Et C est conservé
Et la corbeille est vide après rechargement


# B-15 — F-11 : recréer l’organisation à la réactivation
Étant donné A avec le tag "urgent" dans le groupe "Voyage"
Quand je mets A à la corbeille
Et je supprime le tag "urgent" et le groupe "Voyage"
Et je réactive A
Alors le tag "urgent" et le groupe "Voyage" sont recréés
Et A retrouve ce tag et son appartenance au groupe

# B-16 — F-03, F-11 : nouvelle sauvegarde d’un lien supprimé
Étant donné A en corbeille avec ses tags et ses groupes sauvegardés
Quand je sauvegarde à nouveau la même URL
Alors A est réactivé avec toute son organisation
Et aucun second lien n’est créé

# B-17 — F-12, F-13 : export actif et import additif
Étant donné A actif et B en corbeille
Quand j’exporte la bibliothèque
Alors le fichier contient A et ne contient ni B ni son contexte de restauration
Quand j’importe ce fichier dans une bibliothèque contenant déjà C actif
Alors A et C sont actifs et aucun état supprimé n’est importé

# B-18 — F-11 : annuler le vidage
Étant donné A dans la corbeille
Quand je demande à vider la corbeille
Et j’annule la confirmation
Alors A reste dans la corbeille

# B-19 — F-13 : import d’une URL locale supprimée
Étant donné A dans la corbeille
Quand j’importe un fichier contenant la même URL active et confirme l’import
Alors A est réactivé sans doublon avec son organisation restaurée
Et les tags importés complètent ses tags


# B-20 — F-14 : organisation rapide
Étant donné un lien actif et un groupe existant
Quand j’ouvre le panneau « + » et crée un tag
Alors le tag est créé et associé au lien en une seule écriture
Et le panneau reste ouvert
Quand je sélectionne le groupe existant puis le sélectionne à nouveau
Alors l’association au groupe est ajoutée puis retirée
Et les autres associations sont conservées
Quand je crée un groupe depuis le panneau puis recharge la bibliothèque
Alors le groupe et son association au lien sont conservés

# B-21 — F-14 : tags compacts et clavier
Étant donné un lien portant cinq tags
Alors deux tags et une pastille « +3 » sont visibles dans la ligne
Quand j’active cette pastille au clavier
Alors les cinq tags sont accessibles
Quand j’appuie sur Échap
Alors le panneau se ferme et le focus revient au déclencheur

```

Cas complémentaires obligatoires : groupe distinct en cas de collision ; fenêtre avec plusieurs groupes et URLs refusées ; fragment et paramètres d’URL conservés ; URL modifiée vers un doublon refusée ; tags Unicode ; corbeille persistante après redémarrage du navigateur ; échec d’écriture lors de la purge ; confirmation au-delà de 20 onglets ; URL hostile affichée comme texte ; import d’une version future ou supérieur à 10 Mio ; saturation effective du quota ; deux commandes simultanées ; conflit de révision ; worker arrêté puis relancé ; absence de réponse après écriture ; ouverture partielle sans duplication lors d’une reprise.

L’export/import doit préserver l’équivalence fonctionnelle du graphe, pas l’égalité des UUID ou des compteurs de révision. Tester aussi le second import : les liens sont réutilisés et chaque collision de nom de groupe déclenche un choix entre compléter et créer un groupe distinct.

## Matrice des navigateurs

| Navigateur stable sur ordinateur | Automatisation initiale | Validation avant livraison |
| --- | --- | --- |
| Chrome | Parcours automatisés Chromium comme base ; Chrome réel en complément | Installation, action/menu, capture, persistance après relance, groupes, export/import. |
| Edge | Manuelle initialement | Même parcours ; noter les restrictions propres au produit. |
| Brave | Manuelle initialement | Même parcours, avec réglages de protection par défaut. |
| Opera | Manuelle initialement | Même parcours ; vérifier explicitement le contrôle des Tab Islands ou le repli annoncé. |

Consigner date, OS, version exacte, scénario, attendu, observé et preuve utile. Un passage sur Chromium ne vaut pas validation des quatre navigateurs. L’absence d’API de regroupement est acceptable uniquement si le repli fonctionne et que la limitation est documentée.

## Exécution et livraison

À chaque changement : tests unitaires/intégration puis build de production. Sur les changements de parcours : E2E sur ce build. Avant une livraison : parcours critiques sur les quatre navigateurs, contrôle clavier et zoom, essai avec 5 000 liens, et recherche mesurée sur machine identifiée. Les commandes sont définies dans le manifeste npm.

Isoler les profils et jeux de données entre tests ; attendre les états observables plutôt que des délais arbitraires. Capturer traces et captures d’écran sur échec en utilisant des données fictives. Ne pas masquer un test instable par des répétitions systématiques ; diagnostiquer la cause et conserver le premier échec visible.

Pour vérifier l’absence de connexions externes, auditer le build/manifeste et instrumenter les cibles de l’extension (pages et worker), en distinguant les navigations des onglets ouverts et le trafic propre au navigateur. La seule observation du réseau de la bibliothèque ne suffit pas. Aucun asset distant ou connexion initiée par l’extension ne doit être détecté.

Une livraison exige : tous les scénarios critiques passés, aucun échec inexpliqué, aucun scénario critique ignoré et aucune perte de données observée. Les rapports distinguent réussites, échecs, tests ignorés et tests non exécutés. Un seuil arbitraire de couverture ne remplace pas ces preuves. La validation réelle de l’extension dans les quatre navigateurs est confiée à l’utilisateur ; les contrôles automatisés disponibles ne la remplacent pas.
