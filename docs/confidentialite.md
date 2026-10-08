# Notice de confidentialité

La page affichée par le site est [frontend/confidentialite/index.html](../frontend/confidentialite/index.html). Le contact des demandes est `contact@auxance.dev`.

## Qui traite les données

Auxance Jourdan exploite TaskFlow. Le service tourne sur un VPS qu'il administre. Cloudflare relaie le site public `taskflow.auxance.dev` : il voit les données de connexion nécessaires pour délivrer et protéger le trafic, y compris hors du pays du VPS, selon son contrat avec l'exploitant.

## Données et bases

- Compte, espaces, projets, tâches et messages : exécution du service demandé.
- Sessions, limitation des requêtes et journaux techniques : intérêt légitime de protection du service.
- Mot de passe : empreinte Argon2, jamais en clair.
- Aucune vente, aucun outil de mesure d'audience. Les polices et le client Socket.IO sont servis par TaskFlow.

## Durées

Session authentifiée : 24 heures. Le nettoyage retire les sessions expirées et les sessions révoquées depuis plus de 7 jours. Le contenu reste jusqu'à la suppression du compte ou de l'espace. Une image qui n'est plus référencée est retirée après 24 heures. Les sauvegardes SQL sont conservées 30 jours, avec au plus 14 copies. Un compte supprimé peut rester dans une copie plus ancienne jusqu'à son expiration.

## Demandes

Dans le profil : prénom, avatar, téléchargement JSON (mot de passe requis), suppression du compte. Sinon, écrire à `contact@auxance.dev` sans envoyer le mot de passe. Réponse sous un mois. Le changement de pseudonyme ou d'e-mail n'est fait qu'après vérification. Une réclamation peut aussi être adressée à la CNIL.

La procédure interne est dans [demandes-et-incidents.md](demandes-et-incidents.md).
