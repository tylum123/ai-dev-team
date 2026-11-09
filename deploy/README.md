# Linux server deployment

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
