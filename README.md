
# 🃏 OpenFlashcards

![OpenFlashcards logo](<images/OpenFlashcards logo.png>)

A lightweight, responsive web application for language learning with flashcards.

![Docker Image Version](https://img.shields.io/docker/v/liozon/openflashcards?logo=docker)

---

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#features">Features</a></li>
    <li><a href="#data-structure">Data structure</a></li>
    <li><a href="#quick-start-get-it-from-docker-hub">Quick start (get it from Docker Hub)</a></li>
    <li><a href="#quick-start-local">Quick start (local)</a></li>
    <li><a href="#quick-start-docker">Quick start (docker)</a></li>
    <li><a href="#api-reference">API Reference</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## Features

- **Multi-user** with login portal (JWT authentication)

![Login page](<images/Login page.png>)

- **Admin panel** to create/manage users

![User management portal](<images/Users management.png>)

- **Per-user word banks** – each user has their own vocabulary

![Vocabulary page](images/Vocabulary.png)

- **Word practice** practice words based on your word bank

![Words practice](<images/Practice words.png>)

- **Phrases** practise phrases reconstruction

![Sentences writing](<images/Practice sentences.png>)

- **Words writing** write words, letter by letter, with (easy) or without (hard) audio input

![Sentences writing](<images/Practice writing.png>)

- **Optional "Definition" field** on every word

![Word editing page](<images/Editing word.png>)

- **Mixed practice** – choose any combination of categories

![Practice settings](<images/Practice settings.png>)

- **Dark mode**, responsive (mobile-first)

| Dark mode                            | White mode                             |
| ------------------------------------ | -------------------------------------- |
| ![Dark mode](<images/Dark mode.png>) | ![White mode](<images/White mode.png>) |

- **Text-to-speech** via Web Speech API
- **Data stored in JSON files** – no database required
- **Single Docker container** – all in one solution

---

## Data structure

```txt
config/
  users.json                             ← All users (bcrypt-hashed passwords)

data/
  {userId}/
    config.json                          ← User prefs (languages, dark mode…)
    Words_{userId}_{langCode}.json       ← Word bank for this language
    Sentences_{userId}_{langCode}.json   ← Phrase bank for this language
```

---

## Quick start (get it from Docker Hub)

1. Download Docker Desktop: https://www.docker.com/products/docker-desktop
2. Lauch **Docker Desktop**
3. Into the search bar, type `liozon/openflashcards` and click on on **Run**
![alt text](<images/Docker image search.png>)
4. Map the **container port 8000** to your **local port 8000** and click **Run**
![alt text](<images/Docker port config.png>)
5. Open a browser and go to **http://localhost:8000**
6. Connect to the app with the default admin credentials:
   - Username: `admin`
   - Password: `admin`
   > ⚠️ Change the default password immediately after logging in!
7. Create new users and start learning!

---

## Quick start (local)

```bash
git clone https://github.com/Liozon/OpenFlashcards.git
cd OpenFlashcards
npm install
node src/server.js
# Open http://localhost:8000
```

---

## Quick start (compile for docker)

```bash
git clone https://github.com/Liozon/OpenFlashcards.git
cd OpenFlashcards
npm install
chmod +x build-and-export.sh
./build-and-export.sh
# This creates `openflashcards.tar.gz`.

docker run -d \
  --name openflashcards \
  --restart unless-stopped \
  -p 8000:8000 \
  openflashcards
# Open http://localhost:8000
```

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

---

## Acknowledgments

This project is based on the work of [Alex Bokos](https://github.com/alexbokos) with [open.flashcards](https://github.com/alexbokos/open.flashcards)
