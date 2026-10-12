# Information et gestion des données — RG-02, RG-03, RG-04, RG-05, RG-11

Version locale préparée le 8 octobre 2026. Aucun déploiement ni effacement de la base du VPS. L'adresse publique retenue est `contact@auxance.dev` ; sa redirection Cloudflare a été activée le même jour.

## Ce qui fonctionne

- `/confidentialite/` et `/cookies/` sont des pages HTML autonomes : ouverture directe, rechargement et lecture sans connexion. Elles utilisent les styles et thèmes du site. Les liens figurent en pied de page et dans le profil ; le formulaire d'inscription présente l'utilisation des champs avant le bouton.
- Le prénom facultatif peut être effacé. Une chaîne vide ou composée d'espaces devient `NULL` en base et l'interface reprend le pseudonyme.
- Le bouton de retrait de l'avatar supprime le fichier courant puis sa référence dans une transaction qui verrouille le profil. Si le fichier résiste à la suppression, la réponse `503` conserve la référence pour permettre un nouvel essai. Cette route ne modifie pas le traitement des autres fichiers orphelins, prévu au lot RG-08/RG-09.
- La liste des membres omet les e-mails pour tous les rôles. Les pseudonymes, avatars, identifiants et rôles suffisent à afficher et administrer cette liste. L'ajout d'un membre conserve la saisie de son adresse connue.
- « Download my data » demande le mot de passe actuel et fournit un fichier JSON. La route utilise exclusivement le compte de la session. Session, CSRF et limitation à 3 demandes par heure par IP s'appliquent.
- Le client Socket.IO 4.8.1 fait partie du build du frontend : il vient du paquet npm officiel `socket.io-client`, à la version du site initial, dont l'empreinte est fixée dans `frontend/package-lock.json`. Licence MIT. Il est servi par le site lui-même, sans appel à un serveur tiers.

## Contenu et bornes de l'export

`app/data_export.py` lit un instantané PostgreSQL cohérent en transaction `REPEATABLE READ READ ONLY`. Les requêtes sélectionnent des colonnes explicites ; elles ne lisent pas les mots de passe ni les sessions.

Le fichier contient le profil, les appartenances actuelles, les tâches créées par ou attribuées au compte dans les espaces encore accessibles, les messages d'espace écrits par le compte et ses messages directs envoyés. Les messages reçus et l'historique des autres auteurs sont exclus. Les messages écrits par le compte et encore conservés peuvent figurer même après son retrait d'un espace ; cela n'ouvre pas l'accès à l'historique collectif. Les tâches modifiées par des tiers ne sont exportées que si le compte a encore accès à leur espace.

Les images sont référencées par chemin, sans copie binaire dans le JSON. Les logs, les textes qui mentionnent une personne et d'autres données peuvent nécessiter une réponse complémentaire à une demande d'accès. Le bouton n'est pas présenté comme l'intégralité automatique de toute réponse juridique.

Le curseur serveur lit une ligne à la fois. Au-delà de 5 000 lignes au total ou de 5 Mio de JSON sérialisé, la réponse est `409 export_too_large`, sans fichier incomplet. Le contact permettra de traiter un volume supérieur. Aucun fichier d'export n'est conservé sur le serveur : le navigateur crée le téléchargement à partir de la réponse. Les dates de génération sont UTC ; les dates SQL sans fuseau sont accompagnées du paramètre de fuseau de la base.

## Contact retenu et branchement applicatif

Au déploiement, renseigner `PRIVACY_CONTACT_EMAIL=contact@auxance.dev` dans l'environnement, puis redémarrer le backend. Une valeur non vide est validée au démarrage. `GET /api/privacy` expose uniquement cette adresse publique. Les pages et le profil fabriquent un lien `mailto:` avec un objet générique, sans mot de passe, jeton ou donnée du compte dans le corps.

Le code fonctionne sans adresse pendant la préparation : il affiche l'état de la bêta, jamais une adresse fictive. La boîte Gmail de destination est vérifiée chez Cloudflare, la règle est active et les MX sont publiés. Un message de test envoyé par Auxance à `contact@auxance.dev` depuis une autre boîte a bien été reçu dans Gmail le 8 octobre, initialement dans les indésirables. Auxance a également confirmé la réception de sa réponse Gmail dans sa boîte personnelle : le test aller-retour est terminé. Les réponses partiront de l'adresse Gmail pour cette première configuration : le routage Cloudflare seul ne fournit pas de boîte d'envoi sous `contact@auxance.dev`. Aucun abonnement payant n'a été souscrit.

## Conditions avant publication complète

Les textes sont actuellement une **notice de bêta en préparation, version 0.1**, et non une politique complète pour une ouverture à de vrais projets. Compléter ces points, puis passer le texte en version de publication datée :

1. Adresse de contact fonctionnelle et procédure de traitement des demandes, y compris après suppression d'un compte. Le pseudonyme et l'e-mail se rectifient via cette procédure ; ne pas changer une adresse sur un simple message non vérifié.
2. Identité juridique de l'exploitant, finalités et bases légales correspondant au fonctionnement retenu. L'adresse postale du dossier RNCP n'a pas été réutilisée sur le site.
3. Hébergeur, lieux de traitement, garanties contractuelles, rôle et réglages effectifs de Cloudflare, éventuels transferts internationaux. Ne pas déduire un pays de stockage de la seule adresse IP du VPS.
4. Durées et procédures effectivement appliquées aux comptes, contenus, sessions, journaux et sauvegardes, après les lots RG-09/RG-10.
5. Déployer le lot RG-06 et sa migration : récapitulatif, blocage des espaces avec collaborateurs et reprise des fichiers. Les textes de suppression correspondent à cette version locale. Voir `suppression-compte.md`.
6. Vérification des cookies réellement déposés sur le domaine public et retrait des mentions de préparation. Les pages sont marquées `noindex` pendant cette étape ; cela ne constitue pas un contrôle d'accès.

Le code applicatif ne modifie aucun DNS ni aucune boîte mail. La configuration de messagerie a été réalisée séparément dans Cloudflare, à la demande d'Auxance. L'option d'une remise à zéro de la base est laissée à plus tard.

## Inventaire du stockage dans le navigateur

| Élément | Usage dans le code | Durée / retrait |
| --- | --- | --- |
| Cookie `session` | Connexion et jeton CSRF signé. Créé aussi avant connexion pour protéger l'authentification. | Cookie de session du navigateur ; une restauration de session peut le conserver. Le jeton authentifié expire côté serveur après 24 h. Logout : révocation et suppression du cookie. |
| `localStorage.taskflow-theme` | Choix d'apparence, sans identifiant de compte. | Sans échéance automatique ; supprimé avec les données du site. |
| Cache de fichiers statiques | Scripts, styles, polices et icônes du site. | Revalidation prévue par Nginx ; aucune ressource de script chargée depuis un CDN. |
| Blob de téléchargement JSON | Copie demandée par l'utilisateur. | URL temporaire révoquée après le déclenchement du téléchargement ; le fichier sauvegardé reste sous le contrôle de l'utilisateur. |
| Mécanismes Cloudflare | À relever sur la configuration publique effective. | À compléter avant publication ; pas de durée ou de cookie supposé dans la notice. |

Aucun outil publicitaire ou de mesure d'audience n'a été trouvé dans le frontend inspecté. Cette observation ne couvre pas une éventuelle injection par les services du domaine public.

## Vérifier simplement

```bash
python -m pytest -q
npm test --prefix frontend
npm run build --prefix frontend
docker compose -f compose.chat-tests.yaml up -d --wait
TASKFLOW_CHAT_INTEGRATION=1 python -m pytest -q app/tests/integration
python scripts/check_nginx_security.py
docker compose -f compose.chat-tests.yaml down
```

Les tests réseau utilisent uniquement la base jetable `taskflow_chat_test` sur `127.0.0.1:55438`. Les tests unitaires et réseau se lancent dans des processus Python séparés. Pour relire un cas court, commencer par `app/tests/test_my_data.py` : mauvais mot de passe, tentative de choisir un autre compte, puis téléchargement autorisé.

Les vérifications navigateur couvrent le prénom vide, le retrait d'avatar, le téléchargement réel, la liste sans e-mails, le chat avec Socket.IO local et les pages publiques sur mobile. Le cache local a nécessité une origine de recette neuve (`localhost` au lieu de `127.0.0.1`) ; prévoir une actualisation complète des anciens onglets lors de la livraison.

## Sources de cadrage

- [CNIL : information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)
- [CNIL : portabilité](https://www.cnil.fr/fr/respecter-les-droits-des-personnes/professionnels-comment-repondre-une-demande-de-droit-la-portabilite)
- [CNIL : cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)
- [Socket.IO : installation du client](https://socket.io/docs/v4/client-installation/)
