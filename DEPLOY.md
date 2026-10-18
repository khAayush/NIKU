# Deploying to a VPS

This guide sets up the app on a fresh **Ubuntu 24.04** server with Docker Compose and Caddy
(automatic HTTPS). Commands starting with `you@laptop$` run on your own computer; everything else
runs on the server.

What runs on the server:

| Container | What it does                                               | Reachable from the internet?      |
| --------- | ---------------------------------------------------------- | --------------------------------- |
| `caddy`   | HTTPS, serves the web app, proxies `/api` and `/socket.io` | Yes: ports 80 and 443             |
| `api`     | Node.js API, reminder workers                              | No (only via Caddy)               |
| `db`      | PostgreSQL (data + reminder job queue)                     | No (internal Docker network only) |

You need: a VPS (1 GB RAM is enough), a domain name you control, and a Gmail account with
2-Step Verification (for sending emails).

---

## 1. First login and a non-root user

Create an SSH key on your computer if you don't have one, and copy it to the server:

```bash
you@laptop$ ssh-keygen -t ed25519 -C "you@example.com"     # accept the defaults
you@laptop$ ssh-copy-id root@SERVER_IP
you@laptop$ ssh root@SERVER_IP
```

On the server, create your own user with sudo rights and give it the same key:

```bash
adduser deploy                      # choose a strong password (needed for sudo)
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Open a **second terminal** and check you can log in as the new user before going on:

```bash
you@laptop$ ssh deploy@SERVER_IP
```

From now on, work as `deploy`.

## 2. SSH: keys only, no passwords, no root login

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl restart ssh
```

Keep your current session open and confirm a **new** `ssh deploy@SERVER_IP` still works. Then
check that passwords are refused:

```bash
you@laptop$ ssh -o PubkeyAuthentication=no deploy@SERVER_IP   # should say "Permission denied"
```

## 3. Firewall: only ports 22, 80 and 443

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443        # TCP for HTTPS, UDP for HTTP/3
sudo ufw enable
sudo ufw status verbose
```

> Docker publishes container ports itself and bypasses UFW rules. That's why only the `caddy`
> container publishes ports (80/443), and the database publishes none. Don't add `ports:` to the
> `db` or `api` services.

## 4. Automatic security updates

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades    # answer "Yes"
```

Optional: allow automatic reboots for kernel updates at a quiet hour (containers restart by
themselves afterwards):

```bash
sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
```

## 5. Install Docker

Using Docker's official repository:

```bash
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
```

Log out and back in (so the `docker` group applies), then check: `docker compose version`.

## 6. Point your domain at the server

At your DNS provider, create records for the name you'll use (e.g. `tasks.example.com`):

| Type   | Name    | Value                                          |
| ------ | ------- | ---------------------------------------------- |
| `A`    | `tasks` | the server's IPv4 address                      |
| `AAAA` | `tasks` | the server's IPv6 address (only if it has one) |

Wait until it resolves to the server (can take a few minutes):

```bash
you@laptop$ dig +short tasks.example.com
```

Caddy requests the HTTPS certificate on first start, so DNS must be correct before step 9.

## 7. Get the code

```bash
sudo mkdir -p /opt/todo && sudo chown deploy:deploy /opt/todo
git clone YOUR_REPO_URL /opt/todo
cd /opt/todo
```

(For a private GitHub repo, add a read-only
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
to the repository and clone with its SSH URL.)

## 8. Environment variables

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Set these (every variable is explained in `.env.example`):

| Variable                                | Value                                        |
| --------------------------------------- | -------------------------------------------- |
| `DOMAIN`                                | `tasks.example.com` (no `https://`)          |
| `ACME_EMAIL`                            | your email, for Let's Encrypt expiry notices |
| `POSTGRES_PASSWORD`                     | output of `openssl rand -hex 24`             |
| `BETTER_AUTH_SECRET`                    | output of `openssl rand -base64 48`          |
| `SMTP_USER`                             | your Gmail address                           |
| `SMTP_PASS`                             | a Gmail **app password** (below)             |
| `MAIL_FROM`                             | e.g. `NIKU <you@gmail.com>` (optional)       |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generate with the command below              |
| `VAPID_SUBJECT`                         | `mailto:` + your email                       |

You can ignore `NODE_ENV`, `DATABASE_URL`, `WEB_ORIGIN`, `HOST` and `PORT`: the production compose
file sets them and overrides anything in `.env`.

**Gmail app password:** Google Account → Security → 2-Step Verification (must be on) → App
passwords → create one named "NIKU" → copy the 16 characters (without spaces) into `SMTP_PASS`.

**VAPID keys** (for push notifications):

```bash
docker run --rm node:22-alpine npx -y web-push@3.6.7 generate-vapid-keys
```

Keep `.env` secret and backed up somewhere safe (e.g. a password manager). If you lose
`BETTER_AUTH_SECRET` everyone is logged out; if you change the VAPID keys, everyone must turn push
notifications on again.

## 9. First deploy

```bash
cd /opt/todo
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml run --rm migrate      # creates the tables
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps                     # all "running"/"healthy"
```

Check it:

```bash
curl https://tasks.example.com/api/health
# {"status":"ok","database":"ok",...}
```

Open `https://tasks.example.com`, create your account, then send the link to your friends.

> Anyone who knows the URL can create an account.

Useful commands (run in `/opt/todo`):

```bash
docker compose -f docker-compose.prod.yml logs -f api          # API logs (JSON)
docker compose -f docker-compose.prod.yml logs -f caddy        # HTTPS / proxy logs
docker compose -f docker-compose.prod.yml restart api
```

Tip: `export COMPOSE_FILE=docker-compose.prod.yml` in `~/.bashrc` lets you drop the `-f …` part.

## 10. Daily backups

`scripts/backup.sh` runs `pg_dump` and keeps the newest 14 dumps in `/opt/todo/backups`
(owner-only permissions). Try it once:

```bash
/opt/todo/scripts/backup.sh
ls -lh /opt/todo/backups
```

Schedule it every night at 03:00 (server time) with `crontab -e`:

```cron
0 3 * * * /opt/todo/scripts/backup.sh >> /opt/todo/backups/backup.log 2>&1
```

### Copy backups off the server

Backups on the same server don't protect against losing the server. From your computer, pull
them regularly (for example weekly, or with a scheduled task):

```bash
you@laptop$ rsync -avz deploy@tasks.example.com:/opt/todo/backups/ ~/todo-backups/
```

### Restore a backup

```bash
cd /opt/todo
docker compose -f docker-compose.prod.yml stop api caddy
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U todo -d todo --clean --if-exists --no-owner < backups/todo-YYYY-MM-DDTHHMMSSZ.dump
docker compose -f docker-compose.prod.yml run --rm migrate   # in case the backup is older than the code
docker compose -f docker-compose.prod.yml up -d
```

To restore on a **new** server: follow steps 1–8 (use the same `.env`), run
`docker compose -f docker-compose.prod.yml up -d db`, copy the dump to the server
(`scp`), then run the `pg_restore` and the remaining commands above.

## 11. Updating the app

```bash
cd /opt/todo
/opt/todo/scripts/backup.sh                                     # safety first
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
docker image prune -f                                           # remove old images
```

Reminders are stored in the database, so nothing is lost during the short restart. Any that come
due while the API is down are sent as soon as it's back.

## 12. Monitoring

- **Uptime:** point an uptime monitor (e.g. UptimeRobot, Better Stack) at
  `https://tasks.example.com/api/health`. It returns `200` when the API and database are up and
  `503` when the database is unreachable.
- **Errors:** the API logs JSON lines. Find problems with:

  ```bash
  docker compose -f docker-compose.prod.yml logs api | grep -E '"level":(50|60)'   # errors
  docker compose -f docker-compose.prod.yml logs api | grep 'Reminder delivery failed'
  ```

  Failed push/email deliveries are retried 5 times with increasing delays; the final failure is
  logged as `Reminder delivery failed, giving up`.

- **Disk:** container logs are capped (5 × 10 MB per container). Check space with `df -h`.

## Troubleshooting

- **HTTPS certificate not issued:** check `logs caddy`. DNS must point at this server and ports
  80/443 must be open (`sudo ufw status`).
- **"SMTP verification failed" in the API logs:** wrong `SMTP_USER`/`SMTP_PASS`, or 2-Step
  Verification isn't on. Use an app password, not your normal password.
- **Push notifications don't arrive:** the browser must be running, notifications allowed for the
  site, and _Browser push notifications_ on in Settings. After changing VAPID keys, turn it off and
  on again.
- **API container keeps restarting:** `logs api` shows which environment variable is missing or
  invalid.
