# Deployment (Docker and Dokploy)

CutSense ships as **one container**: a single Node process serves the API (`/api/*`) and the built web app on the same port (8787), so there is nothing else to run and no CORS to configure. The container publishes no host port; a reverse proxy such as Traefik reaches it over the Docker network.

## What is in the image

- Multi-stage `Dockerfile` on `node:22-alpine`: build the web bundle (`npm run build`), install production dependencies only, then copy `dist/`, `server/` and `src/` (the server imports shared schemas from `src/lib`).
- Runs as the unprivileged `node` user, with a `HEALTHCHECK` on `/api/health`, and stops cleanly on `SIGTERM`.
- The API starts through `tsx`, which is why it is a runtime dependency.
- The server serves `dist/` when it exists (override the folder with `STATIC_DIR`). Hashed files under `/assets` are cached for a year; `index.html` is never cached, so a new deployment is picked up at once. Unknown `/api/*` routes answer `404` JSON; any other `GET` falls back to the app.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SAM_API_URL`, `SAM_API_KEY` | empty | Meta Model API base URL and key. Optional: without them the AI routes answer `503` and the app offers its labelled alternatives. |
| `SAM_MODEL` | `sam-3.1` | Segmentation model id. |
| `AGENT_MODEL` | `muse-spark-1.3` | Chat model for Hilo and the 3D preview. |
| `TRUST_PROXY` | `1` in `docker-compose.yml` | Number of reverse-proxy hops to trust, so rate limits use the real client IP instead of the proxy's. Use `1` behind Traefik alone. |
| `PORT` | `8787` | Port inside the container. |

Set the key as an environment variable in your platform; never bake it into the image (`.env` is excluded by `.dockerignore`).

## Dokploy

1. Create a **Compose** service from this repository (or an **Application** with build type *Dockerfile*).
2. Add the environment variables above in the **Environment** tab.
3. In **Domains**, choose the service `cutsense`, container port `8787` and your host. Dokploy adds the Traefik labels and attaches the network on deploy, so `docker-compose.yml` has no `ports:` and no labels.
4. Deploy. The health check turns green when `/api/health` answers.

## Run it locally with Docker

```bash
docker build -t cutsense .
docker run --rm --init -p 8787:8787 --env-file .env cutsense   # -p only for a local test
```

Open http://localhost:8787.

## Notes

- Limits are in memory per process, so run a single replica, or add limits at the proxy. `/api/segment` has no limit of its own.
- The server stores nothing; the container needs no volumes.
