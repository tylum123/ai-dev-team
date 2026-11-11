# Linux server deployment

## Docker demo on a Linux VPS

The included Docker Compose configuration is a **Demo-only** container. It does not include Git, GitHub CLI, or access to a Docker daemon, and the backend rejects Live tasks and provider settings. It does not mount the host Docker socket. A separate worker architecture and real isolation tests are required before enabling Live.

On a Linux host with Docker Engine and Compose installed, clone the repository, then run:

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:4310/api/state
```

The port is bound only to host loopback. On your own computer connect using `ssh -N -L 4310:127.0.0.1:4310 USER@SERVER`, then open `http://127.0.0.1:4310`. Do not expose this unauthenticated app publicly. The named volume `task-data` persists demo task history between container restarts. Avoid `docker compose down -v` if the data should be retained. Build and test on the target VPS before relying on this configuration; it has not yet been validated on a live Docker daemon.

## Free experiment plan

Use an Oracle Cloud Always Free eligible VM only after checking its current eligibility and limits in the Oracle console. A free account may require identity and payment-card verification; never upgrade to a paid account or add paid services as part of this setup without the owner's decision. Always Free capacity may be unavailable and idle instances may be reclaimed. Provider API usage, domain names, backups and any resources outside the free allocation can cost money. See [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

The initial deployment is for a single trusted operator using an SSH tunnel. It is not a public multi-user backend: authentication, authorization, encrypted credential storage, provider URL protections and hardened isolation must be implemented and tested before connecting the public Vercel dashboard to Live. In particular, `.data/provider.json` currently stores provider keys in plaintext and must not be uploaded to Git or untrusted backups. Do not configure any secrets before the server and access model have been checked.

GitHub Actions runs syntax, tests and the static build on pushes and pull requests. This is validation only: it does not currently deploy the server. Once a server exists, add a restricted deployment credential, verify the exact destination and implement a tested release/rollback mechanism before enabling automatic deployment. Do not allow pull requests from the public repository to execute on a persistent self-hosted runner. GitHub-hosted standard runners for public repositories are free subject to GitHub limits and policy.

Before any real Live task, prepare a compatible Docker image, configure a provider with a deliberate spending limit, and perform an end-to-end test. AI API calls are not included in Oracle's free VM. A budget checked after a provider response cannot guarantee zero spending; use a provider's free allocation and provider-side limits when available, or remain in Demo mode.

This service runs the existing Node backend directly on a dedicated Linux VM. No build or package installation is required for this dependency-free project. Keep port 4310 private: the MVP has no application login or multi-user authorization.

## Requirements

- Node.js 22+ at `/usr/bin/node`, Git, systemd.
- For Live: Docker Engine, the prepared `node:22-alpine` image, GitHub CLI, an API key and an available model.
- A repository URL and SSH access to the destination server.

## Installation

After cloning the project into `/opt/ai-dev-team`, run as administrator:

```sh
useradd --system --create-home --home-dir /var/lib/ai-dev-team --shell /usr/sbin/nologin ai-dev-team
install -d -o ai-dev-team -g ai-dev-team -m 700 /opt/ai-dev-team/.data
install -m 644 /opt/ai-dev-team/deploy/ai-dev-team.service /etc/systemd/system/ai-dev-team.service
systemctl daemon-reload
systemctl enable --now ai-dev-team
systemctl status ai-dev-team --no-pager
curl --fail http://127.0.0.1:4310/api/state
```

Keep application source owned by the administrator; only `.data` and the service home need service write access. Adjust ExecStart if Node is installed elsewhere. For Live, grant this dedicated account access to Docker only on a dedicated worker server: Docker daemon access is powerful host-level access. Configure Git/gh credentials for this service account, not your interactive administrator account. Prepare the Docker image on that host.

Store runtime configuration outside Git in `/etc/ai-dev-team.env`, owned by root with mode 600. Use `OPENAI_API_KEY`, `OPENAI_MODEL` and optionally `OPENAI_MODEL_FAST`, `OPENAI_MODEL_STRONG`, `MODEL_PRICES_JSON`, `DOCKER_IMAGE`. Do not paste keys into deployment logs. Restart the service after changes.

## Access

Stop the local app if it already occupies port 4310, then run on your PC:

```sh
ssh -N -L 4310:127.0.0.1:4310 USER@SERVER
```

Open `http://127.0.0.1:4310`. Keep the same local port because the server validates Host against port 4310. Do not open inbound port 4310 or expose a public proxy without authenticated access and an explicit trusted-origin policy.

## Updates and recovery

Wait for tasks to finish, stop the service, back up `.data` separately, update to a reviewed Git commit, run `npm test`, then restart. Check `journalctl -u ai-dev-team -n 100 --no-pager`. Interrupted tasks are marked on restart; the MVP does not resume them automatically. Do not include `.env`, runtime workspaces or task history in Git. Roll back the source commit while preserving `.data` and runtime configuration.
