> Audit initial avant intervention. Les modifications réalisées et les tests exécutés ensuite sont décrits dans [simplification-rncp5.md](simplification-rncp5.md).

# Audit pédagogique TaskFlow — DWWM niveau 5

Date : 22 octobre 2026. Objectif : réduire le périmètre à maîtriser pour l’oral tout en conservant les compétences attendues.

**Verdict : le socle Vue + Flask + PostgreSQL est adapté. La difficulté vient surtout du cumul gestion de tâches + messagerie temps réel + gestion avancée des comptes + exploitation. Aucun référentiel consulté ne classe Vue, TypeScript ou les WebSockets comme interdits au niveau 5. Les priorités ci-dessous sont mon appréciation pédagogique, pas un barème officiel.**

Audit statique du dépôt, des parcours principaux, des configurations et des documents fournis. Les tests n’ont pas été exécutés et le site déployé n’a pas été contrôlé. Ce rapport ne certifie ni le fonctionnement ni la conformité globale. Aucune fonctionnalité supprimée ou réécrite. La modification préexistante de `app/uploads.py` a été laissée intacte.

## 1. Ce que les référentiels demandent

Sources locales : RE, millésime 04, pages 4–7 et 9–12 ; REAC, millésime 04, fiches compétences, notamment pages 25–29. Documents fournis : `C:/Users/auxan/Downloads/REV2_DWWM_V04_24052023.pdf` et `C:/Users/auxan/Downloads/REAC_DWWM_V04_24052023.pdf`.

Pour le titre complet : présentation de 35 minutes, entretien technique de 40 minutes, questionnaire professionnel de 30 minutes et entretien final de 15 minutes. Ne pas confondre avec les durées des CCP pris séparément. Le dossier de projet comporte 30 à 50 pages hors garde, sommaire et annexes ; annexes limitées à 30 pages. Le plan distingue projets en entreprise et projets en formation.

Le jury vérifie la maîtrise du candidat, les choix techniques, le front statique et dynamique, les données, les traitements serveur, la sécurité et les tests. L’installation et le déploiement sont également évalués. Une belle interface seule ne prouve pas la maîtrise ; un projet modeste n’exonère pas de ces compétences.

| Compétence | Éléments présents dans TaskFlow | Travail pédagogique utile |
| --- | --- | --- |
| Environnement | Dockerfile, Compose, Vite, dépendances, Git | Expliquer comment démarrer, configurer et relier les services. |
| Maquettes | `docs/design/mockup/`, versions desktop/mobile et enchaînement | Choisir une version cohérente avec le produit présenté. Une maquette mobile et l’enchaînement ont été inspectés visuellement. |
| Interface statique | Templates Vue, CSS, responsive | Expliquer HTML sémantique, formulaires, disposition, media queries et accessibilité. |
| Interface dynamique | Formulaires, listes, filtres, appels API, états Vue | Montrer un parcours complet avec chargement, erreur et succès. |
| Base relationnelle | Schéma SQL, clés étrangères, contraintes, jointures | Expliquer cardinalités, intégrité, transaction, sauvegarde et restauration. |
| Accès SQL et NoSQL | Psycopg pour SQL ; Redis configuré pour Flask-Limiter | La preuve de code NoSQL personnel est à consolider ; voir section 4. |
| Composants métier | Routes, validations, permissions | Consolider la preuve de POO et la gestion des modifications concurrentes. |
| Déploiement | README, Compose production, Nginx, scripts | Présenter une procédure reproductible et comprise. |

## 2. Ce qui mérite d’être simplifié, par priorité

### Priorité 1 — Messagerie temps réel et messages privés

Fichiers : `frontend/src/chat/ChatPanel.vue`, `frontend/src/chat/subscribe.ts`, `frontend/src/views/DirectMessagesView.vue`, `app/sockets/`, `app/routes/direct_messages.py`, routes de chat dans `app/routes/workspaces.py`.

La messagerie cumule historique HTTP, événements Socket.IO, reconnexion, rattrapage de plusieurs pages, dédoublonnage par identifiant, maintien du défilement, salons et révocation d’accès. Le serveur revérifie les destinataires au moment de publier. Ces protections ont une raison d’être, mais imposent beaucoup de connaissances supplémentaires.

**Recommandation : retirer la messagerie du périmètre de la version d’examen si tu ne sais pas expliquer ces mécanismes.** Le CRUD des tâches suffit déjà à montrer une interface dynamique et des accès aux données. Si les commentaires sont un besoin réel, des commentaires HTTP avec bouton Actualiser sont plus simples. Ne pas remplacer automatiquement le temps réel par du polling, qui ajoute d’autres états et temporisations.

Une suppression effective touche aussi la barre latérale, les exports, la suppression de compte, les tests, la documentation et les dépendances. Masquer seulement le bouton ne simplifie pas le code. Ne pas supprimer les contrôles d’accès pour rendre le chat plus court.

### Priorité 2 — Sauvegarde automatique des tâches

Fichiers : `frontend/src/views/TaskView.vue`, `frontend/src/composables/useSerialQueue.ts`, `app/routes/tasks.py`, `app/db.py` (`update_task_db`).

Statut, priorité et couleur sont enregistrés automatiquement ; les autres champs utilisent un bouton. Le front doit gérer plusieurs états occupés, deux versions des données, une révision de saisie, une file de promesses et l’attente avant navigation.

**Recommandation : un formulaire et un seul bouton Enregistrer pour tous les champs.** Conserver validation, retour d’erreur, prévention du double envoi et traitement des changements non enregistrés.

Point technique réel : le PATCH relit la tâche puis réécrit toute sa ligne. La file du navigateur limite les collisions de cet écran, mais ne coordonne pas deux utilisateurs ou deux onglets. Une simplification correcte doit aussi traiter les écritures concurrentes côté serveur : mise à jour des seuls champs demandés avec liste blanche, ou contrôle de version selon le besoin. Ce risque est identifié par lecture du code, sans reproduction pendant cet audit. Ne pas simplement supprimer la file en conservant les sauvegardes simultanées.

### Priorité 3 — Déplacement des cartes qui change aussi leur priorité

Fichiers : `frontend/src/views/ProjectView.vue`, `frontend/src/task/board.ts`.

Le dépôt d’une carte modifie son statut et peut lui donner la priorité de sa voisine. L’ordre affiché dépend ensuite de la priorité puis de l’identifiant : ce n’est pas un ordre libre enregistré. Cela complique le code et l’explication fonctionnelle.

**Recommandation : garder les colonnes Kanban, changer le statut depuis un champ accessible, gérer la priorité séparément.** Le glisser-déposer peut rester une évolution. Si tu le conserves, limite-le au changement de colonne et garde une alternative clavier. Le problème n’est pas l’accessibilité : c’est le comportement supplémentaire à maintenir.

### Priorité 4 — Quatre rôles et deux notions de propriétaire

Fichiers : `app/permissions.py`, `app/routes/workspaces.py`, `app/sql/01-init.sql`, `frontend/src/workspace/WorkspaceMembers.vue`.

Il existe `owner`, `admin`, `member`, `guest`, ainsi qu’un propriétaire désigné par `workspaces.owner_id`. Avoir le rôle owner et être le propriétaire désigné ne donne pas exactement les mêmes droits. Le transfert exige encore des règles particulières.

**Recommandation : si les quatre rôles ne répondent pas à un besoin que tu peux défendre, garder un propriétaire unique et des membres ; éventuellement conserver guest pour montrer la lecture seule.** Écrire une matrice simple des droits avant changement. Prévoir une migration des rôles existants et adapter routes, tests et affichage ensemble. L’autorisation doit toujours être vérifiée au serveur.

### Priorité 5 — Personnalisation et uploads

Fichiers : `app/uploads.py`, `app/routes/media.py`, `app/file_cleanup.py`, `frontend/src/api/images.ts`, `frontend/src/components/ProtectedImage.vue`, profil et réglages du workspace.

L’envoi de photos apporte validation et traitement des fichiers, stockage privé, contrôle d’accès, suppression différée et chargement des images en base64 avec cache de promesses côté front.

**Recommandation : des initiales et des couleurs prédéfinies suffisent au besoin de gestion de tâches.** Retirer la fonctionnalité d’upload est plus simple que conserver l’upload en retirant ses protections. Si tu la gardes, savoir expliquer format, taille, nom généré, confidentialité et nettoyage. Les uploads sont une extension possible, pas une exigence propre au titre.

### Priorité 6 — Automatisation avancée de la suppression et de l’export

Fichiers : `app/account_deletion.py`, `app/deletion_log.py`, `app/data_export.py`, `app/file_cleanup.py`, scripts de restauration, formulaires du profil.

Le code gère aperçu des conséquences, espaces partagés, verrous SQL, journal hors base, verrou de fichier, écriture atomique, synchronisation disque, rejeu après restauration et nettoyage différé. L’export utilise une transaction de lecture cohérente, un curseur serveur et des plafonds.

**Recommandation : ne pas en faire la fonctionnalité centrale de l’oral.** Pour une version pédagogique distincte avec données fictives, un périmètre fonctionnel réduit permet de repenser ces mécanismes. Sur une application réellement utilisée, leur retrait exige de conserver un traitement effectif des demandes et de la restauration. Cet audit pédagogique n’établit pas qu’on peut supprimer ces obligations ou protections. Une procédure opérateur documentée est une piste à évaluer, pas un remplacement automatique déclaré conforme.

### Priorité 7 — Infrastructure de production

Fichiers : `compose.prod.yaml`, `deploy/nginx/`, `Caddyfile`, `compose.prod.caddy.backup.yaml`, scripts de sauvegarde/restauration.

La configuration active décrite ajoute Redis, Nginx, des réglages Cloudflare et des en-têtes de proxy. Le dépôt contient aussi une ancienne variante Caddy. Leur présence ne prouve pas que les deux proxys tournent simultanément.

**Recommandation : documenter un seul chemin de déploiement de référence.** Garder Docker Compose pour le développement, la configuration par variables, HTTPS pour la publication, la sauvegarde et une restauration expliquée. Ne pas supprimer Redis sans comprendre son rôle de stockage du limiteur, ni affaiblir la confiance accordée aux en-têtes de proxy. Les détails Cloudflare peuvent être en annexe si tu sais néanmoins expliquer la chaîne utilisée.

### Priorité 8 — Finitions graphiques et tests visuels

Fichiers : `frontend/src/styles/motion.css`, `tokens.css`, `theme.ts`, `e2e/playwright.config.ts`.

Les animations sont principalement du CSS, pas un moteur graphique complexe. Les couleurs sont centralisées et le thème est déjà structuré. Le gain à tout retirer serait inférieur à celui de la messagerie ou des autosauvegardes.

**Recommandation : arrêter les nouvelles finitions.** Garder le design existant si tu comprends ses règles. Un seul thème peut suffire, mais les tokens CSS ne sont pas une complication inutile. Conserver responsive, focus visible, labels et réduction des animations.

Les tests navigateur couvrent quatre profils, dont des comparaisons visuelles avec un seuil serré. Ils sont utiles comme filet de sécurité. Ne pas supprimer des tests verts pour rendre le projet artificiellement plus petit ; présenter surtout les tests fonctionnels et de sécurité que tu sais expliquer. Adapter les tests quand une fonctionnalité est réellement retirée.

## 3. Ce que je garderais

- Vue 3, Vue Router, Vite, TypeScript et les deux stores Pinia actuels : pas de réécriture totale justifiée par le seul niveau RNCP. Les types simples et la séparation des appels API rendent aussi le code lisible.
- Flask et les blueprints, PostgreSQL et les requêtes paramétrées Psycopg. Pas besoin d’ajouter un ORM pour faire plus professionnel.
- Inscription, connexion, déconnexion, hachage Argon2, sessions et expiration.
- Autorisations serveur par ressource, validation serveur, contrôle CSRF, erreurs explicites, limites de requêtes et configuration sécurisée.
- Workspaces, projets et tâches : ils donnent de vraies relations et règles métier. Ne pas supprimer une relation utile uniquement pour réduire le nombre de tables.
- Un composant de dialogue partagé et les petits helpers utiles. Le découpage actuel n’est pas en lui-même un défaut.
- Maquettes desktop/mobile, enchaînement, responsive, accessibilité, tests, documentation de déploiement, sauvegarde/restauration et veille.

Le client API mutualise CSRF, erreurs réseau et expiration de session. Il est plus élaboré qu’un fetch isolé, mais le dupliquer dans chaque écran rendrait le projet moins clair. L’apprendre sur un seul parcours est préférable à retirer ses protections.

## 4. Points à consolider avant de dire « le projet couvre tout »

**NoSQL.** Redis est configuré pour Flask-Limiter dans `app/extensions.py` et le Compose production. Je n’ai pas trouvé de composant métier personnel manipulant explicitement des données NoSQL. Utiliser Redis indirectement ne démontre pas, à lui seul, la capacité à coder ces accès. Le RE inclut la compétence SQL et NoSQL parmi celles que l’ensemble des projets doit mettre en œuvre ; le REAC mentionne les modèles clé/valeur. Prévoir une preuve claire déjà réalisée dans un autre projet, ou un petit composant pertinent et maîtrisé. Ne pas greffer une nouvelle base au hasard. Faire valider la correspondance des preuves avec le formateur ; ne pas supposer que le jury ignorera ce sujet.

**POO.** Le métier serveur lu est surtout organisé en fonctions. La recherche de classes Python trouve principalement des classes de tests. Employer les objets de Flask ou Psycopg n’établit pas automatiquement une maîtrise personnelle de la conception objet. Le RE et le REAC demandent le respect des bonnes pratiques de POO. Préparer une réalisation concrète que tu sais expliquer ; éventuellement un petit service métier cohérent, sans transformer toute l’application en architecture abstraite.

**Documentation.** `docs/design/figma-desktop/README.md` décrit encore du JavaScript natif et un serveur sur le port 5500 ; le projet utilise Vue/Vite sur 5173. `docs/frontend.md` présente Pinia comme limité à la session alors qu’un store sidebar existe. `docs/db.md` annonce huit tables alors que le SQL en définit neuf avec `file_cleanup_jobs`. Ces écarts sont à corriger avant de remettre le dossier.

**Maquettes.** Des adaptations mobiles et un schéma d’enchaînement existent bien dans `docs/design/mockup/`. Il faut les aligner sur le périmètre retenu et expliquer les écarts avec la réalisation finale. Ne pas mélanger sans explication les anciennes maquettes et la refonte actuelle.

**Tests et compréhension.** Les résultats historiques annoncés dans les docs ne sont pas des résultats vérifiés aujourd’hui. Rejouer les vérifications après les changements. Préparer un jeu d’essai avec entrées, attendu, obtenu et analyse : le nombre de tests seul ne prouve pas la compétence.

## 5. Périmètre conseillé pour l’oral

« TaskFlow permet à une petite équipe de créer des projets, d’attribuer des tâches et de suivre leur avancement, avec des accès contrôlés. »

Parcours central : connexion → workspace → projet → création d’une tâche → modification du statut → vérification des droits → persistance en base.

Fonctions à garder : comptes, workspaces, membres avec droits simples, projets, tâches (titre, description, statut, priorité, responsable, échéance), affichage Kanban simple, responsive et gestion des erreurs. Messagerie, personnalisation par fichiers et mécanismes avancés d’exploitation deviennent des évolutions ou annexes, selon ce qui reste effectivement dans le produit. Cela ne dispense pas de préparer les preuves NoSQL et POO.

Exemple de répartition personnelle des 35 minutes, non imposée par le référentiel : 3 minutes besoin/périmètre ; 5 maquettes/mobile/accessibilité ; 4 architecture/environnement ; 8 parcours front → API → SQL ; 5 modèle de données ; 4 sécurité ; 3 tests et problème résolu ; 3 déploiement, limites et évolutions. Adapter si plusieurs projets sont nécessaires pour couvrir les compétences.

Questions à savoir traiter sans réciter :

1. Que fait `v-model`, et pourquoi l’écran se met-il à jour ?
2. Que se passe-t-il entre le clic Enregistrer et le commit SQL ?
3. Pourquoi cacher un bouton ne sécurise-t-il pas une API ?
4. Quelle différence entre authentification et autorisation ?
5. Comment une requête paramétrée évite-t-elle l’injection SQL ?
6. Pourquoi hacher le mot de passe ? Où sont cookie, session et jeton CSRF ?
7. Quelles sont les cardinalités et les conséquences d’un DELETE ?
8. Que se passe-t-il si deux utilisateurs modifient la même tâche ?
9. Comment reproduire une erreur, la corriger et vérifier la correction ?
10. Comment reconstruire, déployer et restaurer le projet ?

L’usage d’une aide de génération ne permet pas d’inférer ta maîtrise à partir du code seul. Pour chaque extrait présenté, tu dois pouvoir expliquer les choix et effectuer une petite modification comprise. Présenter honnêtement les aides utilisées et tes contributions selon les consignes de ton centre ; ne pas inventer un raisonnement que tu n’as pas tenu.

## 6. Ordre de travail recommandé

1. Figer le périmètre d’examen et écrire sa courte expression de besoins.
2. Retirer en premier les messages privés et le temps réel si non maîtrisés.
3. Unifier l’enregistrement des tâches et traiter correctement les mises à jour serveur.
4. Simplifier les déplacements du Kanban, puis les rôles si nécessaire.
5. Réduire les uploads et la personnalisation si leur explication reste difficile.
6. Garder l’exploitation avancée hors du parcours central ; ne pas dégrader un service utilisé.
7. Mettre à jour les maquettes, le schéma et la documentation avec la version retenue.
8. Consolider NoSQL, POO, tests, accessibilité et veille.
9. Rejouer les tests pertinents, puis répéter le parcours et l’oral chronométré.

**Le meilleur gain vient de retirer des fonctionnalités entières et leurs dépendances, pas de renommer des variables, supprimer les tests ou affaiblir la sécurité.**

## Sources Internet consultées

- France compétences, RNCP37674 : https://www.francecompetences.fr/recherche/rncp/37674 — fiche officielle retrouvée dans les résultats de recherche, niveau 5, compétences et modalités ; échéance affichée au 1er septembre 2028. L’ouverture directe a renvoyé une erreur 503 ; les durées ont également été vérifiées dans le PDF fourni.
- Documentation officielle Flask, Security Considerations : https://flask.palletsprojects.com/en/stable/web-security/ — CSRF et sécurisation des cookies ; appui au maintien des protections.
- Documentation officielle Vue, Introduction : https://vuejs.org/guide/introduction.html — rôle du framework et adoption progressive ; aucune équivalence de niveau RNCP n’en est déduite.

Les appréciations « prioritaire », « complexe » ou « à simplifier » reposent sur le code inspecté et ton objectif de préparation. Elles ne sont pas des prescriptions officielles du jury.
