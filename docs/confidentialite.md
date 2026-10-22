> Révision du 22 octobre 2026 : le texte affiché au public se trouve dans frontend/src/views/PrivacyView.vue. Les mentions de messages et images dans les procédures concernent désormais les données historiques ; l’interface ne propose plus de messagerie ni de nouveaux uploads.

# Notice de confidentialité

La page affichée par le site est [frontend/src/views/PrivacyView.vue](../frontend/src/views/PrivacyView.vue), à l'adresse `/confidentialite/`. Le contact des demandes est `contact@auxance.dev`.

## Qui traite les données

Auxance Jourdan exploite TaskFlow. Le service tourne sur un VPS qu'il administre. Cloudflare relaie le site public `taskflow.auxance.dev` : il voit les données de connexion nécessaires pour délivrer et protéger le trafic, y compris hors du pays du VPS, selon son contrat avec l'exploitant.

## Données et bases

- Compte, espaces, projets, tâches et messages : exécution du service demandé.
- Sessions, limitation des requêtes et journaux techniques : intérêt légitime de protection du service.
- Mot de passe : empreinte Argon2, jamais en clair.
- Aucune vente, aucun outil de mesure d'audience. Les polices et les scripts applicatifs sont servis par TaskFlow.

## Durées

Session authentifiée : 24 heures. Le script de nettoyage prévoit le retrait des sessions expirées et des sessions révoquées créées depuis plus de 7 jours. Le contenu reste jusqu'à la suppression du compte ou de l'espace. Le script de nettoyage cible les images non référencées après 24 heures. Le script de sauvegarde applique une rétention de 30 jours, avec au plus 14 copies, lorsqu’il est exécuté. La planification automatique de ces scripts n’a pas été constatée sur le VPS le 22 octobre 2026. Un compte supprimé peut rester dans une copie plus ancienne jusqu'à son expiration.

## Demandes

Dans le profil : prénom, téléchargement JSON (mot de passe requis), suppression du compte. Sinon, écrire à `contact@auxance.dev` sans envoyer le mot de passe. Réponse sous un mois. Le changement de pseudonyme ou d'e-mail n'est fait qu'après vérification. Une réclamation peut aussi être adressée à la CNIL.

La procédure interne est dans [demandes-et-incidents.md](demandes-et-incidents.md).
