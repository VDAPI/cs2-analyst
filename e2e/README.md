# Testy E2E (S19)

```bash
docker compose up -d                       # Postgres + Redis
createdb -h localhost -U cs2analyst cs2analyst_e2e   # raz (albo przez psql)
npm run test:e2e                           # build + start na :3100, seed, worker, testy
npx playwright test e2e/flows/upload.spec.ts --project=desktop-flows   # jeden plik
npm run test:e2e:update-snapshots          # nowe wzorce zrzutów (Docker, ten sam obraz co CI)
```

- `screens/` — tylko odczyt: każdy ekran, raport, replay, porównanie, nawigacja, strona publiczna.
- `flows/` — zmieniają dane: rejestracja, upload i usuwanie, udostępnianie. Startują po `screens/`.
- Demo do testów to plik JSON udający `.dem` (`src/lib/parsers/fixture-demo.ts`); analizuje go prawdziwy worker.
- Każdy test kończy się błędem, gdy przeglądarka zgłosi błąd w konsoli.
