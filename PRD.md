# PRD - Homybudget

Version du document: 1.1  
Date: 8 février 2026  
Référence produit: codebase `homybudget` v`1.0.6`

## 1. Vision produit
Homybudget est une application web/PWA de gestion budgétaire personnelle et de couple.  
Le produit permet de piloter des budgets mensuels, suivre le prévisionnel vs réalisé, gérer un compte joint, et administrer les accès utilisateurs avec authentification locale ou OIDC.

## 2. Problème à résoudre
- Les utilisateurs n'ont pas une vue unique et fiable de leurs flux mensuels.
- Le suivi à deux (couple/foyer) est difficile sans structure commune par personne.
- Les données sont dispersées entre notes, tableurs et apps.
- La saisie doit rester utilisable en connexion instable.

## 3. Objectifs produit
- Centraliser le budget mensuel dans un format structuré et persistant.
- Réduire l'effort de suivi par propagation, duplication intelligente et actions rapides.
- Rendre visible l'état financier du mois en temps réel (prévu/réel/solde).
- Offrir une administration simple des accès (rôles, activation, reset, profil).
- Garantir la continuité de service en mode offline avec resynchronisation automatique.

## 4. Hors périmètre (actuel)
- Agrégation bancaire automatique (open banking/PSD2).
- Catégorisation automatique par IA.
- Application mobile native (iOS/Android) dédiée.
- Gestion multi-devises avancée avec conversion FX.

## 5. Personas
- Admin foyer: configure l'app, gère utilisateurs, OIDC, sauvegardes/restauration.
- Utilisateur standard: met à jour son budget et consulte les vues d'analyse.
- Couple/duo: partage un budget à deux et un compte joint commun.

## 5.1 Stack technique (implémentée)
- Frontend:
- React `18.3.1` + TypeScript `5.6.3`.
- Vite `5.4.10`.
- Tailwind CSS `3.4.14` + PostCSS/Autoprefixer.
- UI/UX: Radix UI (`Dialog`, `Select`), `lucide-react`, `framer-motion`, `@hello-pangea/dnd`.
- Backend API:
- Node.js (ESM) + Express `4.19.2`.
- Connexion DB via `pg` `8.13.0`.
- Upload fichiers via `multer`.
- Authentification et sécurité:
- JWT via `jsonwebtoken`.
- Hash mots de passe via `bcryptjs`.
- OIDC via `openid-client`.
- Base de données:
- PostgreSQL (Docker Compose: `postgres:16-alpine`).
- Schéma SQL versionné dans `server/schema.sql`.
- Déploiement et exécution:
- Docker multi-stage (`node:20-alpine`) + Nginx pour servir le frontend buildé.
- API Node + frontend static servis dans un conteneur unique en mode compose.
- Outillage dev:
- `concurrently` pour lancer frontend + API en local.
- Scripts: `dev`, `dev:server`, `dev:full`, `build`, `preview`.

## 6. Portée fonctionnelle

### 6.1 Authentification et onboarding
- Bootstrap du premier admin si aucun utilisateur n'existe.
- Connexion locale JWT avec option "rester connecté" (stockage local ou session).
- Onboarding initial: admin, langue, thème, mode solo/duo, création du 2e compte en mode duo.
- OIDC:
- login externe via redirection.
- liaison d'un compte OIDC avec le compte local.
- retours d'état UI (`linked`, `unlinked`, `expired`, `invalid`, `inactive`, `failed`).

### 6.2 Modèle budgétaire mensuel
- Données mensuelles par clé `YYYY-MM`.
- Contenu d'un mois:
- `person1` et `person2`: revenus, dépenses fixes, dépenses variables.
- `jointAccount`: solde initial et transactions.
- `person1UserId` et `person2UserId`: liaisons optionnelles aux comptes utilisateurs.
- Navigation, création, suppression d'un mois.
- Génération automatique de l'année suivante (12 mois).

### 6.3 Revenus et dépenses
- Revenus:
- ajout/édition/suppression.
- propagation optionnelle vers les mois futurs.
- Dépenses fixes:
- ajout/édition/suppression.
- statut de réalisation (`isChecked`).
- Dépenses variables:
- ajout/édition/suppression.
- statut de réalisation.
- échéancier (`isRecurring`, `recurringMonths`, `startMonth`).
- propagation conditionnelle vers le futur.
- Drag & drop:
- réordonnancement des lignes.
- déplacement entre zones selon mode de tri.
- Mode wizard (création/édition) pour accélérer la saisie.
- Undo sur certaines actions (édition/suppression) via toast.

### 6.4 Règles de date et jours ouvrés
- Les dates sont alignées au mois cible.
- Si la date tombe un week-end/jour férié bancaire, la date est déplacée au prochain jour ouvré.
- Jeu de jours fériés par défaut inspiré TARGET2:
- 1er janvier, vendredi saint, lundi de Pâques, 1er mai, 25 décembre.
- Possibilité d'override par année via `bankHolidaysByYear`.

### 6.5 Compte joint
- Transactions `deposit` et `expense` avec date, montant, description, personne.
- Solde courant calculé en temps réel.
- Report automatique du solde final vers `initialBalance` des mois suivants.
- Réordonnancement des transactions par drag & drop.

### 6.6 Dashboard et rapports
- Dashboard:
- progression mensuelle, dépenses prévu/réel, top catégories, à venir, compte joint.
- indicateurs globaux revenus/dépenses/disponible.
- Rapports:
- vue annuelle consolidée.
- courbes revenus vs dépenses.
- solde mensuel.
- calendrier transactionnel et agrégats YTD.

### 6.7 Paramètres et personnalisation
- Thème clair/sombre, palettes visuelles.
- Langues FR/EN.
- Mode solo/duo.
- Activation/désactivation compte joint.
- Tri des dépenses, widgets budget, affichage liste des mois.
- Devise EUR/USD.
- Durée de session JWT (1h à 24h).
- Gestion comptes bancaires par personne:
- max 3 comptes par personne.
- nom, couleur hex, banque associée (catalogue FR + custom).
- logo et tonalité visuelle.

### 6.8 Administration et profil
- Profil utilisateur:
- nom affiché.
- avatar URL.
- upload avatar (image).
- Mot de passe:
- changement de mot de passe utilisateur connecté.
- reset par token (demande utilisateur ou génération admin).
- Admin:
- création utilisateur.
- changement rôle (`user`/`admin`).
- activation/désactivation compte.
- association des personnes budget aux utilisateurs.

### 6.9 Sauvegarde et restauration
- Export JSON:
- mode complet (budgets + settings + users + liaisons OIDC).
- mode données seules (budgets + settings).
- Import JSON:
- mode `replace` uniquement (merge non supporté).
- garde-fous:
- validation payload.
- au moins un admin requis en import complet.

### 6.10 Offline et synchronisation
- Cache local des budgets et file de synchronisation (mois, suppressions, settings).
- Autosave debounced vers l'API.
- Flush automatique au retour online.
- Stratégie de conflit:
- si le serveur est plus récent (`updatedAt`), serveur prioritaire.
- sinon envoi local prioritaire.
- Badge d'état de sync (`offline`, `pending`, sync locale/serveur).

### 6.11 Mise à jour applicative
- Vérification de version via API Docker Hub.
- Cache côté serveur (15 minutes).
- Indicateur visuel "mise à jour dispo" dans la navigation.

## 7. Règles métier détaillées
- `monthKey` doit respecter `YYYY-MM` et mois `01..12`.
- `PASSWORD_MIN_LENGTH` appliqué à bootstrap, création utilisateur, reset et changement mot de passe.
- Utilisateur inactif: login interdit et accès API protégé refusé.
- Rôles:
- admin nécessaire pour users management et backup import/export.
- utilisateur standard autorisé sur ses actions de profil et budget.
- `sessionDurationHours` est borné entre 1 et 24.
- Les champs OIDC sensibles sont masqués pour les non-admin.
- Upload avatar:
- types: `png`, `jpeg/jpg`, `webp`, `gif`.
- taille max: 5MB.

## 8. Matrice permissions
- Anonyme:
- bootstrap status, bootstrap initial, login local, request/reset password, health, version latest, OIDC start/callback/config.
- Utilisateur authentifié:
- lecture/écriture mois, lecture settings, patch settings partiel, profil (`/users/me`), upload avatar, changement mot de passe, init lien OIDC.
- Admin:
- toutes permissions utilisateur.
- gestion utilisateurs.
- export/import sauvegardes.
- reset password admin sur n'importe quel utilisateur.
- gestion complète settings dont session et OIDC.

## 9. Exigences API
- Base:
- API REST JSON.
- erreurs standard: `{ "error": "<message>" }`.
- Endpoints critiques:
- `PUT /api/months/:monthKey` doit upsert et retourner `updatedAt`.
- `DELETE /api/months/:monthKey` doit être idempotent.
- `PATCH /api/settings` refuse payload vide.
- `POST /api/backup/import` refuse tout mode différent de `replace`.
- Sécurité API:
- routes protégées avec `Authorization: Bearer <token>`.
- CORS configuré via `CORS_ORIGIN` (liste possible).
- payload JSON limité à 10MB.

## 10. Modèle de données
- `monthly_budgets`:
- `month_key` PK.
- `data` JSONB du budget.
- timestamps `created_at`, `updated_at`.
- `users`:
- identité, affichage, avatar, thème, hash mot de passe, rôle, statut, dates.
- unicité `username`.
- `password_reset_tokens`:
- token hashé, expiration, statut d'utilisation.
- `app_settings`:
- singleton `id = 1`, JSONB settings.
- `oauth_accounts`:
- liaison externe/provider -> user.
- unicités `(issuer, subject)` et `(issuer, user_id)`.

## 11. Exigences non fonctionnelles
- Sécurité:
- hash `bcrypt`.
- JWT signé (`JWT_SECRET`).
- séparation permissions user/admin.
- Résilience:
- auto-initialisation schéma SQL si DB vide.
- mode offline avec queue locale.
- Performance:
- autosave debounced.
- lazy loading Dashboard/Rapports.
- Compatibilité:
- web desktop/mobile.
- PWA `standalone`.
- Observabilité minimale:
- endpoint santé DB `GET /api/health`.
- logs serveur pour erreurs auth/sync/import.

## 12. Exigences d'exploitation
- Variables d'environnement clés:
- `DATABASE_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`.
- `JWT_SECRET`, `CORS_ORIGIN`, `PORT`.
- `PASSWORD_MIN_LENGTH` (défaut 8).
- `PASSWORD_RESET_TOKEN_TTL_MINUTES` (défaut 60).
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` (bootstrap auto optionnel).
- Déploiement:
- exécutable local Node + Vite.
- support Docker Compose (API + frontend + PostgreSQL).
- Persistance:
- données DB PostgreSQL.
- avatars stockés sur disque (`server/uploads/avatars` ou volume Docker).

## 13. Critères d'acceptation (MVP actuel)
- Un nouvel environnement sans user doit permettre bootstrap admin puis connexion.
- En mode duo, un mois doit contenir 2 colonnes personne + compte joint activable.
- Toute modification budgétaire doit être persistée localement, puis synchronisée serveur.
- En cas de perte réseau, l'utilisateur continue de modifier ses données sans blocage.
- L'import backup complet doit restaurer budgets, settings, users et liaisons OIDC.
- Un utilisateur inactif doit être refusé à la connexion.

## 14. KPIs de succès (cibles)
- Activation:
- >= 80% des nouvelles instances terminent l'onboarding complet.
- Engagement:
- >= 60% des utilisateurs actifs mettent à jour leur budget au moins 2 fois/semaine.
- Qualité de sync:
- >= 99% des sauvegardes auto sans erreur bloquante.
- Adoption avancée:
- >= 40% des admins utilisent l'export de sauvegarde mensuel.

## 15. Risques
- Conflits multi-session et pertes d'intention utilisateur (serveur prioritaire dans certains cas).
- Import de sauvegarde destructif en mode remplacement.
- Mauvaise configuration OIDC (issuer/client/redirect).
- Exposition opérationnelle si `JWT_SECRET` ou credentials faibles.
- Token de reset retourné par API: acceptable en homelab, à durcir pour contexte internet public.
- Dépendance API Docker Hub pour check de version.

## 16. Roadmap proposée
- v1.1:
- audit fin des conflits de sync + historique d'événements.
- notifications de conflits plus explicites.
- v1.2:
- enrichissement banques US et UX de mapping comptes.
- import sélectif (budgets sans écraser settings).
- v1.3:
- alertes de dépassement budgétaire.
- objectifs d'épargne et suivi.
- v1.4:
- exports analytiques CSV/PDF.
- filtres et comparatifs de périodes avancés.

## 17. Questions ouvertes
- Faut-il introduire un mode `merge` d'import sécurisé et traçable ?
- Quel niveau de chiffrement/masquage veut-on pour les backups JSON ?
- Souhaite-t-on verrouiller les settings globaux aux seuls admins ?
- Faut-il ajouter une rétention serveur automatique des backups et snapshots mensuels ?
