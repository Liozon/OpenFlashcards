# Démarrage de l'application

## Première fois (ou après modification du code)

```bash
docker compose build --no-cache
docker compose up
```

## Relancer sans rebuild (si le code n'a pas changé)

```bash
docker compose up
```

## Arrêter

```bash
docker compose down
```

## Accéder à l'application

http://localhost:8090/flashcards
