# 🃏 OpenFlashcards

A lightweight, responsive web application for language learning with flashcards.  
**Migrated from Java/Spring Boot/MongoDB → Node.js/Express/JSON files.**

---

## Features

- **Multi-user** with login portal (JWT authentication)
- **Admin panel** to create/manage users
- **Per-user word banks** – each user has their own vocabulary
- **Word categories**: Nouns, Verbs, Adjectives, Adverbs
- **Phrases** (sentence reconstruction exercise)
- **Optional "Definition" field** on every word
- **Clickable words** in phrase exercises to see translation hints
- **Mixed practice** – choose any combination of categories
- **Dark mode**, responsive (mobile-first)
- **Text-to-speech** via Web Speech API
- **Data stored in JSON files** – no database required
- **Single Docker container** – ready for Synology NAS

---

## Data structure

```
config/
  users.json                          ← All users (bcrypt-hashed passwords)

data/
  {userId}/
    config.json                       ← User prefs (languages, dark mode…)
    Words_{userId}_{langCode}.json    ← Word bank for this language
    Sentences_{userId}_{langCode}.json← Phrase bank for this language
```

---

## Quick start (local)

```bash
npm install
docker run -d \
  --name openflashcards \
  --restart unless-stopped \
  -p 8000:8000 \
  openflashcards
# Open http://localhost:8000
# Login: admin / admin  ← change this!
```

---

## Docker – Build & Deploy to Synology

### Build and export

```bash
chmod +x build-and-export.sh
./build-and-export.sh
```

This creates `openflashcards.tar.gz`.

### Import on Synology

```bash
# 1. Copy the archive to your NAS, then SSH in:
docker load < openflashcards.tar.gz

# 2. Create data directories on the NAS:
mkdir -p /volume1/docker/openflashcards/{data,config}

# 3. Start the container:
docker run -d \
  --name openflashcards \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /volume1/docker/openflashcards/data:/app/data \
  -v /volume1/docker/openflashcards/config:/app/config \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  openflashcards:latest

# 4. Open http://your-nas-ip:8000
#    Default login: admin / admin
#    ⚠️ Change the admin password on first login!
```

### Using Synology Container Manager (GUI)

1. Import image: **Container Manager → Registry → Import**
2. Create container with:
   - Port mapping: `8000 → 8000`
   - Volume: `/volume1/docker/openflashcards/data` → `/app/data`
   - Volume: `/volume1/docker/openflashcards/config` → `/app/config`
   - Env: `JWT_SECRET=your_random_secret`

---

## Security

| Item       | Details                                           |
| ---------- | ------------------------------------------------- |
| Passwords  | bcrypt (cost 10)                                  |
| Sessions   | JWT in httpOnly cookie (30 days)                  |
| Admin      | Default `admin/admin` – **change on first login** |
| JWT secret | Set via `JWT_SECRET` env variable                 |

---

## Migrating from v1 (Java/MongoDB)

v1 stored data in MongoDB. To migrate your data:

1. Export from MongoDB:
   ```bash
   mongoexport --collection=nouns --jsonArray -o nouns.json
   # repeat for verbs, adjectives, adverbs, phrases
   ```
2. Transform to the v2 JSON format (array of word objects per the API schema)
3. Place files in `data/{userId}/Words_{userId}_{langCode}.json`

---

## API Reference

All API routes require authentication (cookie or `Authorization: Bearer <token>`).

| Method | Path                      | Description          |
| ------ | ------------------------- | -------------------- |
| POST   | `/auth/login`             | Login                |
| POST   | `/auth/logout`            | Logout               |
| GET    | `/auth/me`                | Current user         |
| POST   | `/auth/change-password`   | Change own password  |
| GET    | `/api/config`             | Get user config      |
| PUT    | `/api/config`             | Update user config   |
| POST   | `/api/languages`          | Add a language       |
| DELETE | `/api/languages/:code`    | Remove a language    |
| GET    | `/api/words?lang=`        | List words           |
| POST   | `/api/words`              | Add word             |
| PUT    | `/api/words/:id?lang=`    | Update word          |
| DELETE | `/api/words/:id?lang=`    | Delete word          |
| GET    | `/api/phrases?lang=`      | List phrases         |
| POST   | `/api/phrases`            | Add phrase           |
| PUT    | `/api/phrases/:id?lang=`  | Update phrase        |
| DELETE | `/api/phrases/:id?lang=`  | Delete phrase        |
| GET    | `/api/quiz?lang=&types=`  | Get quiz question    |
| POST   | `/api/quiz/answer`        | Submit answer        |
| GET    | `/api/quiz/phrase?lang=`  | Get phrase quiz      |
| POST   | `/api/quiz/phrase/answer` | Submit phrase answer |
| GET    | `/api/stats?lang=`        | Get stats            |
| GET    | `/admin/users`            | List users (admin)   |
| POST   | `/admin/users`            | Create user (admin)  |
| PUT    | `/admin/users/:id`        | Update user (admin)  |
| DELETE | `/admin/users/:id`        | Delete user (admin)  |
