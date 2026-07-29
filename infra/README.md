# infra/

Docker Compose stack for local development: PostgreSQL (with the `pgvector` extension, for RAG
document embeddings) and RabbitMQ (the queue backing WhatsApp/payment webhook processing).

## Files

- `docker-compose.yml` — two services, `postgres` and `rabbitmq`, both with healthchecks and
  named volumes (`pgdata`, `rabbitmqdata`) so data survives a `docker compose down` (not `-v`).
- `.env.example` — template for the two required secrets (`POSTGRES_PASSWORD`,
  `RABBITMQ_PASSWORD`). Copy to `.env` (gitignored) before first run:
  ```bash
  cp .env.example .env
  ```

## Running it

```bash
docker compose up -d
```

Both services must actually be *running the Docker daemon itself* first — starting the containers
will hang/fail if Docker Desktop isn't open yet. Check readiness:

```bash
docker ps                                                              # containers listed at all?
docker inspect --format='{{.State.Health.Status}}' aibp-postgres       # wait for "healthy"
docker inspect --format='{{.State.Health.Status}}' aibp-rabbitmq       # wait for "healthy"
```

## Why the ports are remapped

Host ports are deliberately non-standard (`5433` for Postgres, `5673`/`15673` for RabbitMQ)
because this dev machine runs other projects on the standard ports. The containers' *internal*
ports are standard (`5432`/`5672`/`15672`) — only the host-side mapping changed. `server/`'s
connection strings and RabbitMQ config already point at the remapped ports; you don't need to
change anything in `server/` to match.

## Debugging

- RabbitMQ management UI: `http://localhost:15673` (login: `aibp` / whatever you put in `.env`).
  Useful for checking queue depth (`whatsapp.inbound`, `payments.confirmed`) or inspecting a stuck
  message directly if a background consumer in `server/src/AiBusinessPlatform.Api` seems hung.
- Connect a Postgres client (pgAdmin, DBeaver, `psql`) to `localhost:5433`, database `aibp_dev`,
  user `aibp`, password from `.env` — same credentials the app's own connection string uses.
- If a container won't start healthy, `docker logs aibp-postgres` / `docker logs aibp-rabbitmq` are
  the first place to look before assuming it's an application-level problem.
