# Claude.md — Instructions pour créer une nouvelle app “Liste de naissance” (SQLite)

## Objectif
Créer une application web simple et rapide à déployer qui héberge une **liste de naissance** avec une base **SQLite**. L’app doit permettre aux parents de publier une liste et aux invités de réserver/acheter des cadeaux, sans collisions ni doublons.

## Portée fonctionnelle (MVP)
### Rôles
- **Parents (admin)** : créent et gèrent la liste, ajoutent/modifient les cadeaux, voient l’état des réservations.
- **Invités (public)** : consultent la liste via un lien partagé, réservent un cadeau, laissent un message.

### Fonctionnalités clés
1. **Liste publique via lien secret** (token) : ex. `/list/<token>`
2. **CRUD cadeaux** (admin)
3. **Réservation** (invité) : “Je m’en charge” → statut “réservé”
4. **Annulation réservation** (invité) via lien de confirmation (token de réservation)
5. **Prix + lien boutique** + **priorité** + **catégorie**
6. **Commentaires** sur cadeau (optionnel pour v1)
7. **Vue admin** : filtres (disponible/réservé/acheté), export CSV

## Data model SQLite (suggestion)

### Tables
- `lists`
  - `id` (PK)
  - `title`
  - `description`
  - `owner_email` (optionnel pour reset)
  - `public_token` (unique)
  - `created_at`, `updated_at`

- `items`
  - `id` (PK)
  - `list_id` (FK)
  - `name`
  - `description`
  - `price_cents`
  - `currency`
  - `store_url`
  - `priority` (1–3)
  - `category`
  - `image_url` (optionnel)
  - `status` (available|reserved|purchased)
  - `created_at`, `updated_at`

- `reservations`
  - `id` (PK)
  - `item_id` (FK)
  - `guest_name`
  - `guest_email` (optionnel)
  - `message`
  - `reservation_token` (unique)
  - `created_at`

### Contraintes
- Un item **ne peut pas être réservé deux fois** (transaction + contrainte unique sur `item_id` dans `reservations` tant que status=reserved).
- Lors d’une réservation, **verrouiller** l’item : transaction SQLite.

## API (exemple REST)
- `GET /api/lists/:token` → infos liste + items
- `POST /api/lists` → créer liste (admin)
- `PUT /api/lists/:id` → update liste (admin)
- `POST /api/items` / `PUT /api/items/:id` / `DELETE /api/items/:id` (admin)
- `POST /api/items/:id/reserve` → réserver (guest)
- `POST /api/reservations/:token/cancel` → annuler
- `POST /api/items/:id/mark-purchased` (admin)

## UI / UX
- **Page publique** : grille de cadeaux, état visible (badge “Réservé”), CTA clair.
- **Modal réservation** : nom + message, validation rapide.
- **Admin** : bouton “+ cadeau”, drag & drop optionnel pour réordonner.
- **Mobile-first** : cartes simples, CTA big.

## Sécurité & anti-doublon
- **Token public** aléatoire pour l’accès à la liste.
- **Token de réservation** unique pour annulation.
- **Rate limit léger** sur réservation.
- **Validation stricte** (prix > 0, URL valide).

## Stack conseillée (simple)
- Backend : Node.js + Express (ou Fastify)
- DB : SQLite (better-sqlite3) + migrations SQL
- Front : Vite + React (ou un simple SSR)
- Auth admin : code d’accès + session (cookie) ou mot de passe simple

## Migrations
- Utiliser un dossier `migrations/` avec versionnement SQL.
- Lancer au démarrage si base vide.

## Performance & Déploiement
- SQLite en volume persistant.
- Docker compose : `app` + volume `db-data`.
- Sauvegarde : export `.db` ou endpoint `/api/backup`.

## Checklist de dev rapide
1. Init projet + DB SQLite
2. CRUD liste + items
3. Page publique
4. Réservation transactionnelle
5. UI admin basique
6. Déploiement Docker

## Non-Goals (v1)
- Paiement intégré
- Multi-liste dans un seul compte
- Auth sociale

## Qualité
- Tests unitaires simples pour réservation
- Tests E2E minimal (réserver + annuler)

---
Fin.
