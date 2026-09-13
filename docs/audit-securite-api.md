# Audit de sécurité de l’API TaskFlow

Date : 11 septembre 2026. Version examinée : commit `fc818aa`, avec les fichiers présents dans l’espace de travail au début de l’audit.

Objectif : relever les risques et préparer un support de travail pour un dossier RNCP niveau 5. Les corrections restent à réaliser par l’auteur du projet. Aucun correctif applicatif, changement de configuration ou changement de données n’a été effectué pendant cet audit.

## 1. Périmètre et méthode

Revue des 25 couples route/méthode déclarés, de l’authentification, des permissions, des accès PostgreSQL, du schéma SQL, des dépendances directes et de la configuration Docker. Fichiers concernés : `app/app.py`, `app/permissions.py`, `app/db.py`, les quatre modules de `app/routes/`, `app/sql/init.sql`, `requirements.txt`, `Dockerfile`, `compose.yaml`, `.env.example`, `.gitignore` et la documentation existante.

La revue de code est complétée par des vérifications avec le client de test Flask et des données fictives en mémoire. Aucun serveur réseau ni conteneur n’a été démarré pour l’audit ; aucune connexion à la base réelle, aucun test de charge et aucune tentative sur un service public n’ont été réalisés. Le contenu de `.env` et des cinq fichiers `.txt` non suivis n’a pas été consulté. Leur présence seule a été observée.

Environnement des vérifications : Python 3.14.4, Flask 3.1.0, Werkzeug 3.1.8 et argon2-cffi 25.1.0, dans un environnement temporaire extérieur au dépôt. Le Dockerfile prévoit Python 3.12 : ces sondes ne constituent donc pas une validation du conteneur. Le pilote PostgreSQL a été remplacé par un double interdisant toute connexion, car `psycopg-binary==3.2.1` n’était pas installable pour ce Python et `libpq` était absent. Les fonctions d’accès aux données ont été simulées ; les routes et le traitement HTTP Flask sont ceux du projet. Les exceptions ont été converties en réponses HTTP pour observer les codes `500` ; le débogueur interactif n’a pas été lancé.

Les références OWASP servent à classer les risques. Elles ne constituent ni une certification de l’API, ni une correspondance officielle avec un titre RNCP précis, dont le référentiel n’a pas été fourni. [Référentiel OWASP API Security 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).

## 2. Synthèse des constats

L’API dispose déjà de protections utiles : hachage Argon2, requêtes SQL paramétrées, vérification de l’appartenance aux espaces et restrictions par rôle. Le principal défaut applicatif concerne l’attribution des rôles : les règles diffèrent selon l’action utilisée. La configuration Docker doit également être revue avant une exposition réseau.

La gravité tient compte de l’impact et des conditions d’exploitation. « Élevée » signifie une priorité avant exposition ou utilisation avec des données réelles ; « moyenne » un risque à traiter dans le cycle de sécurisation ; « faible » une divulgation limitée ou un durcissement. Aucun score CVSS n’a été calculé.

| ID | Constat | Gravité | État de la preuve |
| --- | --- | --- | --- |
| SEC-01 | Attribution de rôles supérieurs par l’ajout d’un membre | Élevée | Confirmé dans le code et par simulation HTTP |
| SEC-02 | Suppression d’un administrateur après rétrogradation | Moyenne | Confirmé dans le code et par simulation HTTP |
| SEC-03 | Débogueur Flask activé par le démarrage Docker | Élevée si accessible au réseau | Configuration confirmée ; exposition réelle non vérifiée |
| SEC-04 | PostgreSQL publié avec un compte excessivement privilégié et des identifiants faibles | Élevée si accessible au réseau | Configuration confirmée ; privilèges du serveur existant non vérifiés |
| SEC-05 | Fichiers locaux sensibles inclus dans le contexte de construction Docker | Élevée si l’image est diffusée | Règles de construction et présence de `.env` confirmées |
| SEC-06 | Cookie de session sans attribut `Secure` | Élevée en cas d’accès HTTP sur un réseau non fiable | Attributs du cookie vérifiés ; interception non réalisée |
| SEC-07 | Ancien cookie encore utilisable après déconnexion | Moyenne | Rejeu confirmé avec une session fictive |
| SEC-08 | Absence de limites applicatives sur les tentatives et les ressources | Moyenne | Revue et vérifications ciblées ; saturation non testée |
| SEC-09 | Validation insuffisante des types et valeurs d’entrée | Faible isolément ; moyenne avec SEC-03 | Erreurs de traitement confirmées sur des requêtes fictives |
| SEC-10 | Affectation d’une tâche à un utilisateur extérieur à l’espace | Moyenne | Acceptation confirmée par simulation HTTP |
| SEC-11 | Détails techniques renvoyés par `/health` | Faible | Divulgation confirmée avec une erreur fictive |
| SEC-12 | Réponses permettant d’identifier des comptes ou des ressources existantes | Faible | Revue et vérifications ciblées |

Les gravités conditionnelles ne prouvent pas que l’application est actuellement accessible depuis Internet.

## 3. Fiches de relevé

### SEC-01 — Attribution de rôles supérieurs par l’ajout d’un membre

**Preuves :** [app/routes/workspaces.py](../app/routes/workspaces.py), lignes 124–146, à comparer aux lignes 214–225.

`POST /api/workspaces/{id}/members` autorise les rôles `owner` et `admin` pour tout appelant déjà `owner` ou `admin`. En revanche, la route `PATCH` interdit à un administrateur d’attribuer ces rôles et réserve l’attribution du rôle `owner` au détenteur de la propriété principale, nommé « crown holder » dans le code.

**Scénario :** un administrateur dispose d’un second compte inscrit, encore extérieur à l’espace. Il l’ajoute avec `{"email":"second@example.test","role":"owner"}`. La route accepte l’ajout. Un `owner` qui ne détient pas la propriété principale peut également ajouter un autre `owner`.

**Impact :** élévation de privilèges dans l’espace, notamment pour administrer des membres avec des droits normalement refusés. Le rôle `owner` ajouté ne transfère pas automatiquement `workspaces.owner_id` : la propriété principale et la suppression de l’espace restent protégées par cette seconde vérification.

**Correction à envisager :** appliquer une même politique d’attribution des rôles lors de l’ajout et de la modification. **Critère de validation :** un administrateur ne peut attribuer ni `admin` ni `owner`, quelle que soit la route ; seul le détenteur de la propriété principale peut attribuer `owner`. Vérifier aussi que les opérations autorisées restent possibles.

Classement : OWASP API5:2023, autorisation des fonctions.

### SEC-02 — Suppression d’un administrateur après rétrogradation

**Preuves :** [app/routes/workspaces.py](../app/routes/workspaces.py), lignes 198–225 et 266–275.

La suppression directe d’un administrateur par un autre administrateur est interdite. Cependant, `PATCH /api/workspaces/{id}/members/{user_id}` permet de transformer cet administrateur en `member` ou `guest`. L’appelant peut ensuite le supprimer.

**Scénario observé :** administrateur A tente de supprimer B : refus `403`. A rétrograde B en `member` : succès `200`. A relance la suppression : l’opération de suppression est appelée. La réponse finale comporte un défaut distinct décrit plus bas.

**Impact :** contournement d’une protection explicite entre administrateurs, avec perte des droits et de l’accès de la cible. **Correction à envisager :** vérifier le rôle actuel de la cible lors de la modification, en cohérence avec les règles de suppression. **Critère de validation :** si la politique conserve cette protection, A ne peut ni rétrograder B ni le supprimer par enchaînement d’actions.

Classement : OWASP API5:2023.

### SEC-03 — Débogueur activé par le démarrage Docker

**Preuves :** [app/app.py](../app/app.py), ligne 33 ; [Dockerfile](../Dockerfile), ligne 11 ; [compose.yaml](../compose.yaml), lignes 5–6.

Le conteneur démarre `python -m app.app`, qui appelle `app.run(host="0.0.0.0", port=5000, debug=True)`. Le port 5000 est publié sur l’hôte. Le mode débogage peut exposer des traces internes et présente une surface dangereuse si le débogueur devient accessible. Flask précise que son débogueur permet d’exécuter du code Python et que son PIN ne doit pas servir de protection de production. [Documentation Flask sur le débogage](https://flask.palletsprojects.com/en/stable/debugging/).

**Limite :** aucun accès externe ni contournement du PIN ou des contrôles d’hôte n’a été démontré. Une exécution de code anonyme n’est donc pas affirmée.

**Correction à envisager :** prévoir un démarrage de production avec le débogage désactivé et un serveur WSGI adapté. **Critère de validation :** une erreur volontaire en environnement de recette produit une réponse générique, sans trace ni interface interactive ; vérifier le mode réellement lancé par le conteneur.

Classement : OWASP API8:2023, configuration de sécurité.

### SEC-04 — Accès PostgreSQL trop exposé et trop privilégié

**Preuves :** [compose.yaml](../compose.yaml), lignes 13–14 et 23–28 ; [app/sql/init.sql](../app/sql/init.sql), lignes 1–44.

Les identifiants de base sont des valeurs faibles inscrites en clair dans Compose, et le port `5432:5432` est publié sans restriction à la boucle locale. Docker publie ainsi le port sur toutes les interfaces par défaut ; son accessibilité effective dépend du réseau et du pare-feu. [Documentation Docker sur la publication des ports](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/).

Le compte utilisé par l’API est aussi celui déclaré dans `POSTGRES_USER`. Sur un volume neuf, l’image officielle crée ce compte avec les privilèges de superutilisateur. Aucun rôle applicatif restreint n’est défini par le SQL fourni. Il s’agit d’une déduction de la configuration d’initialisation ; les droits du volume actuel n’ont pas été interrogés. [Documentation de l’image PostgreSQL](https://hub.docker.com/_/postgres).

**Impact :** un accès direct à PostgreSQL peut contourner tous les contrôles de l’API ; une compromission de l’application bénéficie aussi de droits excessifs en base. **Correction à envisager :** limiter l’exposition réseau, utiliser un secret robuste et un rôle applicatif restreint. **Critère de validation :** le port est inaccessible depuis les réseaux non autorisés ; les identifiants précédents sont refusés ; le compte applicatif n’est pas superutilisateur et ne peut pas administrer les rôles ou supprimer le schéma.

Changer uniquement `.env` ne remplace pas les valeurs littérales de Compose. Modifier `POSTGRES_PASSWORD` ne réinitialise pas non plus le mot de passe d’un volume déjà initialisé : vérifier le résultat sur la base existante, sans supprimer ses données.

Classement : OWASP API8:2023.

### SEC-05 — Fichiers locaux sensibles incorporés à l’image Docker

**Preuves :** [Dockerfile](../Dockerfile), ligne 9 ; [compose.yaml](../compose.yaml), ligne 3 ; [.gitignore](../.gitignore), ligne 1. Absence constatée de `.dockerignore` et de `Dockerfile.dockerignore` ; présence constatée de `.env` et de `.git`.

Avec le contexte local `build: .` et `COPY . .`, un prochain build réalisé depuis cet espace de travail inclut `.env` et les autres fichiers locaux non exclus. `.gitignore` concerne Git et ne filtre pas ce contexte Docker. [Documentation Docker sur le contexte de construction](https://docs.docker.com/build/concepts/context/).

**Impact :** une personne pouvant récupérer cette image peut également récupérer les fichiers qu’elle contient, y compris des secrets si `.env` en contient. Aucune image existante n’a été inspectée et aucune diffusion antérieure n’est affirmée. Le contenu des fichiers `.txt` n’a pas été lu ; leur nom ne prouve pas qu’ils contiennent des sessions.

**Correction à envisager :** limiter explicitement les fichiers inclus au build et injecter les secrets à l’exécution. **Critère de validation :** inspecter l’image finale et ses couches ; aucun `.env`, historique Git ou fichier local d’authentification ne doit être présent. Si une image contenant des secrets a déjà été diffusée, leur retrait d’une nouvelle image doit s’accompagner du renouvellement des secrets concernés.

Classement : OWASP API8:2023.

### SEC-06 — Cookie de session sans attribut `Secure`

**Preuves :** [app/app.py](../app/app.py), lignes 11–12 ; [app/routes/auth.py](../app/routes/auth.py), ligne 52 ; [compose.yaml](../compose.yaml), lignes 5–6.

Le cookie de session émis possède `HttpOnly`, mais pas `Secure` ni de valeur explicite `SameSite`. L’API fournie démarre en HTTP ; aucun proxy HTTPS n’est décrit dans le dépôt. Sans `Secure`, le navigateur peut transmettre le cookie par HTTP. Les paramètres correspondants sont documentés par Flask. [Configuration des cookies Flask](https://flask.palletsprojects.com/en/stable/config/#SESSION_COOKIE_SECURE).

**Impact :** si un utilisateur accède à l’application en HTTP sur un réseau observable, sa session et ses identifiants de connexion peuvent être interceptés. Ce scénario n’a pas été réalisé. Un éventuel HTTPS, HSTS ou filtrage géré hors du dépôt reste à vérifier.

**Correction à envisager :** imposer HTTPS pour l’utilisation avec des données réelles et configurer explicitement les attributs adaptés au parcours client. **Critère de validation :** connexion réelle par HTTPS, cookie avec `Secure` et `HttpOnly`, valeur `SameSite` choisie explicitement, et absence d’accès applicatif non protégé par le port direct.

Classement : OWASP API2/API8:2023. L’absence de `SameSite` explicite ne démontre pas à elle seule une attaque CSRF ; voir les limites ci-dessous.

### SEC-07 — La déconnexion ne révoque pas une copie du cookie

**Preuves :** [app/routes/auth.py](../app/routes/auth.py), lignes 52, 58 et 67–70 ; [app/app.py](../app/app.py), lignes 11–12.

La session est un cookie signé par Flask. `logout()` retire `user_id` de la session du navigateur courant, sans enregistrer de révocation côté serveur. Une copie antérieure du cookie reste acceptée.

**Scénario :** connexion avec un compte fictif, conservation du cookie en mémoire, déconnexion, puis réinjection du cookie conservé avant un appel à `/api/auth/me`. La déconnexion nettoie le client initial mais n’invalide pas cette copie. Le délai de validation de signature par défaut est de 31 jours depuis sa création, sous réserve que la clé reste valide ; la fermeture du navigateur ne révoque pas une copie déjà extraite. [Configuration Flask des sessions](https://flask.palletsprojects.com/en/stable/config/#PERMANENT_SESSION_LIFETIME).

**Impact :** la déconnexion ne permet pas de mettre fin à une session volée. Le vol préalable du cookie est une condition du scénario ; aucun vol réel n’a été effectué. **Correction à envisager :** prévoir un mécanisme de révocation et une durée de session adaptée. **Critère de validation :** après déconnexion, le cookie conservé avant celle-ci reçoit `401`. [Recommandations OWASP sur la fin de session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Classement : OWASP API2:2023.

### SEC-08 — Tentatives et consommation de ressources non limitées

**Preuves :** [app/routes/auth.py](../app/routes/auth.py), lignes 12–25 et 36–52 ; [app/app.py](../app/app.py), lignes 11–17 ; [app/db.py](../app/db.py), lignes 71–83, 150–161, 239–251 et 335–346.

Aucune limitation applicative des tentatives de connexion ou d’inscription n’est présente. `MAX_CONTENT_LENGTH` n’est pas configuré, et les listes sont chargées intégralement avec `fetchall()` sans pagination. Les textes libres n’ont pas de taille maximale applicative. L’inscription et la vérification du mot de passe mobilisent Argon2, volontairement coûteux en calcul et en mémoire.

**Impact :** facilitation des essais automatisés de mots de passe, création massive de comptes et risque d’épuisement de ressources. Les tailles de colonnes SQL ne limitent pas la taille du JSON reçu avant son traitement. Aucune saturation ni capacité maximale du serveur n’a été mesurée ; un filtrage externe pourrait limiter le risque. [Consommation de ressources dans Flask](https://flask.palletsprojects.com/en/stable/web-security/#resource-use).

**Correction à envisager :** fixer des limites de requête et de champs, limiter les tentatives, paginer et prévoir des quotas adaptés. **Critère de validation :** dépassement du seuil de tentatives traité par une réponse contrôlée telle que `429`, corps trop gros rejeté en `413`, nombre de résultats borné et absence d’écriture lorsque les limites sont dépassées.

Classement : OWASP API2/API4:2023.

### SEC-09 — Entrées insuffisamment validées

**Preuves :** [app/routes/auth.py](../app/routes/auth.py), lignes 14–25 et 38–49 ; [app/routes/workspaces.py](../app/routes/workspaces.py), lignes 106–109 ; [app/routes/tasks.py](../app/routes/tasks.py), lignes 68–92 et 135–145 ; [app/sql/init.sql](../app/sql/init.sql), lignes 26–32.

Le code suppose que le JSON est un objet et que les champs ont les types attendus. Un tableau non vide tel que `[1]` atteint un appel à `.get()` et déclenche une exception. À l’inscription, un mot de passe numérique non nul atteint `len(password)` et déclenche aussi une exception. Les statuts, priorités, dates et longueurs des tâches ne sont pas validés avant l’accès SQL.

**Impact :** réponses `500` déclenchables par le client, requêtes inutiles vers la base, traces potentiellement exposées avec SEC-03. Les contraintes SQL empêchent déjà plusieurs valeurs interdites d’être enregistrées : le défaut est le traitement de l’entrée et de l’erreur, pas une injection SQL démontrée.

**Correction à envisager :** définir le schéma des requêtes, valider types, longueurs, valeurs autorisées, identifiants et dates, puis traduire les erreurs prévisibles. **Critère de validation :** tableaux, nombres, valeurs `null` interdites, chaînes trop longues, statuts inconnus et dates impossibles produisent un `400` ou `422` JSON, sans écriture. Refaire les cas liés aux contraintes sur une base de test PostgreSQL.

Classement : validation des entrées, avec conséquences OWASP API4/API8:2023.

### SEC-10 — Affectation d’une tâche hors de l’espace de travail

**Preuves :** [app/routes/tasks.py](../app/routes/tasks.py), lignes 80–86 ; [app/sql/init.sql](../app/sql/init.sql), ligne 25.

La création d’une tâche vérifie uniquement que `assignee_id` correspond à un utilisateur existant. Elle ne vérifie pas son appartenance à l’espace du projet. La clé étrangère vérifie elle aussi seulement l’existence du compte.

**Scénario :** un membre autorisé crée une tâche dans son projet avec l’identifiant d’un utilisateur extérieur. La route accepte cette affectation. **Impact :** incohérence d’autorisation sur la relation entre tâche et responsable ; possibilité de rattacher une personne à un espace auquel elle n’appartient pas. Aucune lecture de la tâche par cet utilisateur extérieur n’a été démontrée : les contrôles de lecture de l’espace restent présents.

**Correction à envisager :** vérifier l’appartenance du responsable à l’espace, selon la règle métier retenue. Si l’affectation externe est intentionnelle, la documenter et définir ses droits. **Critère de validation :** une affectation externe est refusée sans insertion ; une affectation interne autorisée et une tâche non affectée restent possibles.

Classement : OWASP API3:2023, autorisation d’une propriété d’objet.

### SEC-11 — Divulgation technique sur `/health`

**Preuves :** [app/app.py](../app/app.py), lignes 20–29.

L’endpoint public renvoie `str(error)` lors d’une erreur de base. Une erreur fictive injectée pendant la vérification se retrouve dans la réponse JSON. Une erreur réelle peut fournir des noms d’hôtes, ports ou détails de connexion selon sa nature ; aucune valeur secrète réelle n’a été utilisée.

**Impact :** aide à la reconnaissance de l’infrastructure. **Correction à envisager :** renvoyer un état public minimal et conserver le détail dans des journaux internes. **Critère de validation :** une panne de base simulée ne révèle aucun détail technique au client ; un identifiant permet de retrouver le diagnostic côté serveur.

Classement : OWASP API8:2023.

### SEC-12 — Énumération de comptes et de ressources

**Preuves :** [app/routes/auth.py](../app/routes/auth.py), lignes 25–27 ; [app/routes/tasks.py](../app/routes/tasks.py), lignes 36–48 ; [app/routes/projects.py](../app/routes/projects.py), lignes 79–88 ; [app/routes/workspaces.py](../app/routes/workspaces.py), lignes 65–70 et 142–148.

Une inscription sur un email déjà présent retourne `409` avec un message spécifique. Pour un utilisateur connecté extérieur à l’espace, une tâche existante donne `403` alors qu’un identifiant inexistant donne `404`. Des distinctions semblables existent sur les espaces et projets. L’ajout de membres permet également à un appelant autorisé de distinguer les emails inscrits.

**Impact :** découverte de l’existence d’un compte ou d’une ressource, sans accès démontré à son contenu. **Correction à envisager :** décider quelles informations d’existence peuvent être publiques et harmoniser les réponses si leur confidentialité est recherchée ; compléter par des limites de tentatives. **Critère de validation :** un utilisateur non autorisé ne peut distinguer les cas que la politique exige de masquer. Le message de connexion reste déjà identique pour un compte inconnu et un mauvais mot de passe.

Classement : confidentialité et conception des réponses.

## 4. Dépendances : alertes identifiées et applicabilité

Les versions directes de `requirements.txt` ont été confrontées aux métadonnées publiques PyPI et aux avis des mainteneurs à la date de l’audit. Les doublons entre identifiants GHSA, CVE et PYSEC désignent le même problème et ne sont pas comptés plusieurs fois.

| Dépendance déclarée | Alerte et version corrigée | Applicabilité observée dans ce projet |
| --- | --- | --- |
| Flask 3.1.0 | CVE-2025-47278 ; corrigée en 3.1.1 | Concerne `SECRET_KEY_FALLBACKS`, non configuré ici. Exploitation non établie. [Avis du mainteneur](https://github.com/pallets/flask/security/advisories/GHSA-4grg-w6v8-c28g). |
| Flask 3.1.0 | CVE-2026-27205 ; corrigée en 3.1.3 | Nécessite notamment certains accès aux clés de session et un cache partagé. Les routes utilisent `session.get()` et aucun proxy de cache n’est décrit. Exploitation non établie. [Avis du mainteneur](https://github.com/pallets/flask/security/advisories/GHSA-68rp-wp8r-4726). |
| python-dotenv 1.0.1 | CVE-2026-28684 ; correction annoncée en 1.2.2 | Concerne `set_key()`/`unset_key()` et des conditions locales sur les fichiers. Aucun appel à ces fonctions dans le code examiné. Exploitation par l’API non établie. [Avis du mainteneur](https://github.com/theskumar/python-dotenv/security/advisories/GHSA-mf9w-mj56-hr94). |

Aucune alerte n’a été renvoyée par les métadonnées consultées pour `psycopg==3.2.1`, `psycopg-binary==3.2.1` et `argon2-cffi==25.1.0`. [Métadonnées PyPI psycopg](https://pypi.org/pypi/psycopg/3.2.1/json), [psycopg-binary](https://pypi.org/pypi/psycopg-binary/3.2.1/json), [argon2-cffi](https://pypi.org/pypi/argon2-cffi/25.1.0/json). Cela ne prouve pas l’absence de vulnérabilité : les bibliothèques natives, l’OS et les dépendances transitives de l’image réellement déployée n’ont pas été inventoriés ni scannés.

**Action à prévoir par l’auteur :** mettre à jour les dépendances concernées vers des versions corrigées compatibles, verrouiller aussi les dépendances transitives et analyser l’image effectivement produite. Aucun paquet du projet ni fichier de dépendances n’a été modifié. Ces alertes de maintenance sont distinguées des scénarios applicatifs confirmés.

## 5. Observations complémentaires et limites

- **Durcissement Docker :** `compose.yaml:7–8` monte tout le dépôt en écriture dans `/app`, et le Dockerfile ne définit pas d’utilisateur applicatif. Une compromission du processus pourrait donc atteindre les fichiers montés selon leurs permissions. Cela ne démontre pas une prise de contrôle de tout l’hôte. Prévoir une configuration de production avec les accès nécessaires seulement.
- **Réponse incorrecte après suppression d’un membre :** `app/routes/workspaces.py:278` retourne un tuple à un élément. Flask le refuse alors que la fonction de suppression a déjà été exécutée. C’est un défaut de fiabilité supplémentaire : le client peut recevoir `500` malgré une suppression effectuée. Prévoir une réponse HTTP valide et tester l’état final de la base lors de la correction.
- **CSRF à compléter selon le client prévu :** aucun mécanisme dédié n’est visible. Les mutations métier exigent du JSON et aucun CORS permissif n’est configuré, ce qui bloque le scénario classique par formulaire intersite. Le logout accepte en revanche un POST sans JSON. Son déclenchement intersite dépendrait de l’envoi du cookie par le navigateur. Aucune exploitation CSRF en navigateur n’a été démontrée ; ne pas présenter toutes les routes comme vulnérables sur cette seule absence.
- **Secrets :** la robustesse réelle de `SECRET_KEY`, les droits de `.env`, l’historique Git complet et les anciennes images n’ont pas été examinés. Le code ne valide pas explicitement la présence et la qualité de la clé au démarrage ; une clé absente provoque un échec de session, pas une authentification contournée démontrée.
- **Traçabilité :** aucun journal métier dédié aux changements de rôle, transferts de propriété ou suppressions sensibles n’apparaît dans le code. Les journaux d’accès techniques ne suffisent pas nécessairement à reconstituer acteur, cible et changement. Le dispositif de supervision extérieur n’a pas été inspecté.
- **Périmètre non vérifié :** HTTPS réel, pare-feu, reverse proxy, sauvegardes/restauration, système hôte, concurrence des transactions et interfaces clientes. Aucun front n’a été examiné : une valeur contenant du HTML renvoyée en JSON ne suffit pas à démontrer une XSS.

## 6. Protections déjà présentes

| Protection observée | Preuve | Portée |
| --- | --- | --- |
| Hachage des mots de passe avec Argon2 | `app/routes/auth.py:9,25,49` | Le code stocke un hachage et vérifie le mot de passe par la bibliothèque. |
| Requêtes SQL paramétrées | `app/db.py`, par exemple lignes 32–38, 46–52 et 272–287 | Aucune concaténation d’entrée HTTP dans les requêtes SQL n’a été identifiée. |
| Permissions vérifiées côté serveur | `app/permissions.py:4–10`, `app/routes/tasks.py:36–49` | Les rôles et l’appartenance sont vérifiés via les données de l’espace. Les incohérences de SEC-01/02 restent à corriger. |
| Identité du créateur issue de la session | `app/routes/tasks.py:54,85` | Le client ne choisit pas le créateur de la tâche dans le JSON. |
| Propriété principale contrôlée séparément | `app/routes/workspaces.py:87,201,296` | Protection de la suppression de l’espace, du titulaire principal et du transfert de propriété. |
| Contraintes d’intégrité en base | `app/sql/init.sql:4,28–31,40–43` | Email et adhésion uniques, clés étrangères, listes de valeurs de statut/priorité/rôle. |
| Création de l’espace et de son propriétaire dans une transaction | `app/db.py:349–369` | Les deux insertions partagent le même contexte de connexion transactionnel. |
| Cookie signé avec `HttpOnly` | Session Flask utilisée par `app/routes/auth.py:52` | La signature protège l’intégrité du cookie ; `HttpOnly` réduit l’accès depuis JavaScript. |
| Message de connexion générique | `app/routes/auth.py:45–51` | Même message pour compte inconnu et mauvais mot de passe. |
| `.env` exclu du suivi Git actuel | `.gitignore:1` et liste des fichiers suivis | Ne protège pas le build Docker ni nécessairement les anciens commits. |

## 7. Utilisation pour le dossier RNCP niveau 5

Ce document fournit l’état initial. Pour présenter le travail, sélectionner des corrections représentatives : autorisation des rôles, validation des données, gestion de session et configuration de déploiement. Pour chacune, conserver la preuve initiale, expliquer l’impact sur la confidentialité, l’intégrité ou la disponibilité, puis ajouter le choix de correction et une preuve de validation.

Ordre de traitement suggéré : sécuriser l’exposition et les secrets avant toute mise en ligne ; corriger SEC-01 et SEC-02 avant un usage partagé ; traiter ensuite sessions, limites, validation et affectations ; terminer par les divulgations limitées et les mesures de suivi. Les mises à jour de dépendances peuvent être menées en parallèle avec leurs vérifications de compatibilité.

| Élément à compléter par l’auteur | Contenu attendu |
| --- | --- |
| Constat choisi | Identifiant SEC, fichier et règle concernée |
| Preuve avant correction | Requête fictive, rôle de l’appelant, résultat obtenu et résultat attendu |
| Correction réalisée | Explication du changement et référence au commit de correction |
| Vérification après correction | Cas interdit désormais refusé, cas autorisé toujours fonctionnel, état final des données |
| Risque résiduel | Limites restantes, dépendances au déploiement et justification des choix |

Ne présenter comme corrigés que les points effectivement traités et vérifiés. Pour les scénarios simulés durant cet audit, compléter la démonstration finale sur une base PostgreSQL de test et sur le mode de déploiement choisi.

## 8. Résultats des vérifications isolées

Le tableau conserve les résultats observés pendant cet audit. Les scripts et sorties détaillées ont été produits dans `/tmp/taskflow-audit-n79la5l5/`, hors du dépôt ; ils restent temporaires et ne constituent pas une suite de tests versionnée jointe au projet. Les comptes, emails, identifiants, cookies et données utilisés sont fictifs. Les lignes de code référencées dans ce rapport correspondent à l’état initial et peuvent évoluer lors des corrections.

| Vérification | Résultat observé | Conclusion |
| --- | --- | --- |
| 20 opérations métier sans session, avec JSON valide si nécessaire | 20 réponses `401` | Authentification requise sur les opérations métier déclarées. |
| Lectures et mutations examinées avec un utilisateur extérieur à l’espace | 17 réponses `403` | Cloisonnement respecté dans ces scénarios. |
| Mutations examinées avec le rôle `guest` | 11 réponses `403` | Invité bloqué sur les mutations testées. |
| Modification et suppression du titulaire principal par six autres comptes/rôles | 12 réponses `403` | Protection du titulaire dans ces scénarios. |
| Six lectures métier avec le rôle `guest` | 6 réponses `200` | Les lectures autorisées restent possibles. |
| Administrateur ajoutant un utilisateur au rôle `owner` par POST | `201`, rôle `owner` enregistré en mémoire, titulaire principal inchangé | SEC-01 reproduit. |
| Administrateur attribuant `owner` par PATCH | `403` | Différence de politique avec POST confirmée. |
| Owner non titulaire ajoutant un autre owner | `201` | Autre chemin de SEC-01 reproduit. |
| Administrateur supprimant un pair, puis le rétrogradant et le supprimant | `403`, puis `200`, puis `500` avec cible supprimée en mémoire | SEC-02 et défaut de réponse après suppression reproduits. |
| Création de tâche avec un responsable extérieur à l’espace | `201`, identifiant extérieur transmis à la création | SEC-10 reproduit, sans preuve d’accès en lecture pour cet utilisateur. |
| Cookie émis à la connexion | `session=<masqué>; HttpOnly; Path=/` | `Secure` et `SameSite` absents de l’en-tête observé. |
| Connexion, `/me`, déconnexion, `/me`, réinjection du cookie et `/me` | `200`, `200`, `200`, `401`, puis `200` | SEC-07 reproduit. |
| JSON `[1]` sur inscription/connexion et mot de passe entier sur ces deux routes | 4 réponses `500` | Absence de validation de types confirmée. |
| Tableaux JSON sur quatre mutations métier et JSON `null` sur PATCH workspace | 5 réponses `500` | SEC-09 reproduit sur les routes examinées. |
| Formulaire classique sur la connexion | `415` | Type MIME non JSON refusé. |
| POST formulaire sur la déconnexion | `200` | Le logout n’exige pas de JSON ; ceci ne simule pas les règles de cookies d’un navigateur. |
| `/health` avec erreur de connexion synthétique | `500`, texte fictif de l’exception recopié dans `error` | SEC-11 reproduit. |
| 30 connexions successives avec un email fictif inconnu | 30 réponses `401`, aucun `429` | Absence de limitation constatée sur cette séquence ; aucun test de charge. |
| Lecture par un utilisateur extérieur : tâche existante puis identifiant absent | `403`, puis `404` | Distinction d’existence de SEC-12 confirmée. |

Les quatre premières lignes totalisent 60 refus attendus vérifiés. Ces résultats ne couvrent pas toutes les combinaisons de rôles, de routes, de concurrence et d’état de base. L’énumération par email à l’inscription, les contraintes SQL et les configurations Docker ont été évaluées par lecture du code, sans test sur la base ou sur un déploiement réel.
