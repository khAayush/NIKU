# Deploying to Oracle Cloud Always Free

A complete, start-to-finish guide for hosting the app **for free** on an Oracle Cloud
Always Free server. It follows the same setup as `DEPLOY.md` (Ubuntu 24.04, Docker Compose,
Caddy with automatic HTTPS) with the Oracle-specific steps added.

Commands starting with `you@laptop$` run on your own computer; everything else runs on the
server.

**Time needed:** about 1–2 hours, plus waiting for Oracle account approval and DNS.

**What you'll end up with:**

| Container | What it does                                               | Reachable from the internet?      |
| --------- | ---------------------------------------------------------- | --------------------------------- |
| `caddy`   | HTTPS, serves the web app, proxies `/api` and `/socket.io` | Yes: ports 80 and 443             |
| `api`     | Node.js API, reminder workers                              | No (only via Caddy)               |
| `db`      | PostgreSQL (data + reminder job queue)                     | No (internal Docker network only) |

**Checklist of what you need:**

- [ ] A credit or debit card that works for international payments (for verification only)
- [ ] A Gmail account with 2-Step Verification turned on (for sending emails)
- [ ] Your app's code in a Git repository (e.g. GitHub)
- [ ] About 2 hours

---

## Part 1 — Oracle account

### 1.1 Sign up

1. Go to **https://signup.cloud.oracle.com** (or oracle.com/cloud/free → "Start for free").
2. Enter your details. For **Country**, choose your real country (Nepal).
3. **Home Region — choose carefully, it can never be changed.** Always Free resources only
   work in your home region. Because the main user lives in the US, pick a US region:
   - Friend on the West Coast → **US West (San Jose)** or **US West (Phoenix)**
   - Friend in the Central/East → **US Midwest (Chicago)** or **US East (Ashburn)**
4. Add your card. It's used for identity verification; you may see a small temporary hold that
   is released. Some prepaid/virtual cards are rejected — use a regular card if that happens.
5. Wait for the "account ready" email (usually minutes, sometimes a few hours).

### 1.2 Upgrade to Pay As You Go (stays free)

Oracle may **reclaim idle Always Free servers** on free-only accounts. This app uses very
little CPU, so it could look "idle". Upgrading to Pay As You Go (PAYG) avoids this and you
**keep all Always Free resources at $0**.

1. Console menu (☰) → **Billing & Cost Management** → **Upgrade and Manage Payment**.
2. Choose **Upgrade to Pay As You Go** and confirm. Approval can take a little while.

> **Important:** PAYG removes the safety limits of a free account. Anything you create that is
> *not* Always Free will be billed. In this guide, only create what's described, and look for
> the **"Always Free-eligible"** label when choosing options.

### 1.3 Set a budget alert (your safety net)

1. ☰ → **Billing & Cost Management** → **Budgets** → **Create Budget**.
2. Name: `free-tier-guard`, monthly amount: **1** (USD).
3. Add an alert rule: **Actual spend**, threshold **1%**, your email.

If you ever get this email, something non-free was created — find and delete it.

---

## Part 2 — SSH key on your laptop

You'll log in to the server with a key instead of a password.

macOS / Linux / Windows (PowerShell) — all have `ssh-keygen` built in:

```bash
you@laptop$ ssh-keygen -t ed25519 -C "you@example.com"     # press Enter to accept defaults
you@laptop$ cat ~/.ssh/id_ed25519.pub                     # copy this whole line
```

(On Windows the file is `C:\Users\YOU\.ssh\id_ed25519.pub`.)

Keep the private key (`id_ed25519`, no `.pub`) safe and never share it.

---

## Part 3 — Create the server

☰ → **Compute** → **Instances** → **Create instance**.

| Setting           | Choose                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Name              | `niku`                                                                                      |
| Image             | **Change image** → **Canonical Ubuntu 24.04** (the console picks the ARM build automatically) |
| Shape             | **Change shape** → **Ampere** → **VM.Standard.A1.Flex**, **1 OCPU, 6 GB memory**            |
| Networking        | **Create new virtual cloud network** and **public subnet** (defaults are fine)              |
| Public IPv4       | **Assign a public IPv4 address** — make sure this is on                                     |
| SSH keys          | **Paste public keys** → paste the line from Part 2                                          |
| Boot volume       | Leave the default size (it's within the free 200 GB)                                        |

Click **Create**. When it shows **Running**, copy the **Public IP address** — you'll need it.

1 OCPU / 6 GB is far more than this app needs and stays well within the free allowance.

### If you see "Out of capacity"

Free ARM servers are popular and often sold out. Try, in this order:

1. A different **Availability domain** (under *Placement* on the same page).
2. Try again later (early morning US time often works) — capacity frees up regularly.
3. Use the AMD shape instead: **Change shape** → **Specialty and previous generation** →
   **VM.Standard.E2.1.Micro** (1 GB RAM, Always Free). It works for this app, but you **must**
   add swap in step 5.5.

---

## Part 4 — Open the web ports in Oracle's network firewall

Oracle blocks web traffic at the network level by default. Allow ports 80 and 443:

1. Open your instance → under **Primary VNIC** click the **Subnet** link.
2. Open **Security** (or **Security Lists**) → **Default Security List for …**.
3. **Add Ingress Rules** — add these three rules:

| Source CIDR | IP Protocol | Destination Port |
| ----------- | ----------- | ---------------- |
| `0.0.0.0/0` | TCP         | `80`             |
| `0.0.0.0/0` | TCP         | `443`            |
| `0.0.0.0/0` | UDP         | `443`            |

The SSH rule (TCP 22) already exists — don't remove it.

---

## Part 5 — Prepare the server

### 5.1 First login and remove Oracle's built-in firewall rules

Oracle's Ubuntu image ships its own iptables rules that block everything except SSH and can
break Docker networking. Remove them; you'll use UFW instead (step 5.4).

```bash
you@laptop$ ssh ubuntu@SERVER_IP
sudo apt update
sudo apt purge -y netfilter-persistent iptables-persistent
sudo reboot
```

Wait a minute, then log back in: `ssh ubuntu@SERVER_IP`.

### 5.2 Create your own user

```bash
sudo adduser deploy                      # choose a strong password (needed for sudo)
sudo usermod -aG sudo deploy
sudo rsync --archive --chown=deploy:deploy /home/ubuntu/.ssh /home/deploy
```

Open a **second terminal** and check you can log in as the new user:

```bash
you@laptop$ ssh deploy@SERVER_IP
```

From now on, work as `deploy`.

### 5.3 SSH: keys only, no passwords, no root login

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl restart ssh
```

Keep your current session open and confirm a **new** `ssh deploy@SERVER_IP` still works.

### 5.4 Firewall: only ports 22, 80 and 443

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443        # TCP for HTTPS, UDP for HTTP/3
sudo ufw enable
sudo ufw status verbose
```

> Docker publishes container ports itself and bypasses UFW. That's why only the `caddy`
> container publishes ports (80/443). Never add `ports:` to the `db` or `api` services.

### 5.5 Swap memory (required on the 1 GB AMD micro; harmless on ARM)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h      # should show 2.0Gi of swap
```

### 5.6 Automatic security updates

```bash
sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades    # answer "Yes"
```

Optional — allow automatic reboots for kernel updates at a quiet hour (containers restart by
themselves afterwards):

```bash
sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
```

### 5.7 Install Docker

```bash
sudo apt install -y ca-certificates curl git netcat-openbsd
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

Log out and back in, then check: `docker compose version`.

(The ARM server works with all the app's images — Node, Postgres and Caddy all publish ARM
builds.)

### 5.8 Check that email ports are open

```bash
nc -zv -w 5 smtp.gmail.com 587
nc -zv -w 5 smtp.gmail.com 465
```

At least one should say **succeeded**. Note which one — if your `.env.example` has an SMTP port
setting, use that port. If **both** fail, Oracle is blocking outbound mail on your account;
see *Troubleshooting* at the end.

---

## Part 6 — Domain name

You need a name like `tasks.example.com` so Caddy can get an HTTPS certificate.

**Option A — free and instant: DuckDNS**

1. Go to **https://www.duckdns.org** and sign in.
2. Create a subdomain, e.g. `niku` → you get `niku.duckdns.org`.
3. In the **current ip** box, enter your server's public IP and click **update ip**.

**Option B — free .com.np (takes a few days)**

Nepali citizens can usually register a free `.com.np` domain at **https://register.com.np**.
After approval, create an `A` record pointing your chosen name to the server's IP. You can start
with DuckDNS and switch later (just change `DOMAIN` in `.env` and restart).

Check that the name points at your server (may take a few minutes):

```bash
you@laptop$ nslookup niku.duckdns.org
```

DNS must be correct **before** the first deploy (Part 8), because Caddy requests the HTTPS
certificate on first start.

---

## Part 7 — Get the code and configure it

### 7.1 Clone the repository

```bash
sudo mkdir -p /opt/todo && sudo chown deploy:deploy /opt/todo
git clone YOUR_REPO_URL /opt/todo
cd /opt/todo
```

For a private GitHub repo, add a read-only
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys):

```bash
ssh-keygen -t ed25519 -C "niku-server" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub     # add this in GitHub → repo → Settings → Deploy keys
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:YOUR_USER/YOUR_REPO.git /opt/todo
```

### 7.2 Gmail app password

Google Account → **Security** → **2-Step Verification** (must be on) → **App passwords** →
create one named "NIKU" → copy the 16 characters (without spaces).

### 7.3 Push notification (VAPID) keys

```bash
docker run --rm node:22-alpine npx -y web-push@3.6.7 generate-vapid-keys
```

### 7.4 Create the `.env` file

```bash
cd /opt/todo
cp .env.example .env
chmod 600 .env
nano .env
```

| Variable                                | Value                                        |
| --------------------------------------- | -------------------------------------------- |
| `DOMAIN`                                | `niku.duckdns.org` (no `https://`)           |
| `ACME_EMAIL`                            | your email, for Let's Encrypt expiry notices |
| `POSTGRES_PASSWORD`                     | output of `openssl rand -hex 24`             |
| `BETTER_AUTH_SECRET`                    | output of `openssl rand -base64 48`          |
| `SMTP_USER`                             | your Gmail address                           |
| `SMTP_PASS`                             | the Gmail app password from 7.2              |
| `MAIL_FROM`                             | e.g. `NIKU <you@gmail.com>` (optional)       |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from 7.3                                     |
| `VAPID_SUBJECT`                         | `mailto:` + your email                       |

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

You can ignore `NODE_ENV`, `DATABASE_URL`, `WEB_ORIGIN`, `HOST` and `PORT` — the production
compose file sets them.

**Back up `.env` now** (e.g. copy its contents into a password manager). If you lose
`BETTER_AUTH_SECRET` everyone is logged out; if you change the VAPID keys everyone must turn push
notifications on again.

---

## Part 8 — First deploy

```bash
cd /opt/todo
docker compose -f docker-compose.prod.yml build                 # first build: 5–20 minutes
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml run --rm migrate      # creates the tables
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps                    # all "running"/"healthy"
```

Check it:

```bash
curl https://niku.duckdns.org/api/health
# {"status":"ok","database":"ok",...}
```

Then:

1. Open `https://niku.duckdns.org` and create your account.
2. **Test email:** log out, use *Forgot password*, and confirm the email arrives (check spam).
3. **Test a reminder:** create a task with a reminder 2 minutes from now and wait for it.
4. Send the link to your friend.

> Anyone who knows the URL can create an account.

Tip: add `export COMPOSE_FILE=docker-compose.prod.yml` to `~/.bashrc` to drop the `-f …` part.

Useful commands (in `/opt/todo`):

```bash
docker compose -f docker-compose.prod.yml logs -f api          # API logs (JSON)
docker compose -f docker-compose.prod.yml logs -f caddy        # HTTPS / proxy logs
docker compose -f docker-compose.prod.yml restart api
```

---

## Part 9 — Backups (don't skip this)

Free servers come with no guarantees. Backups plus your `.env` let you rebuild anywhere in
under an hour.

### 9.1 Daily backups on the server

```bash
/opt/todo/scripts/backup.sh          # try it once
ls -lh /opt/todo/backups
crontab -e                           # add the line below, save
```

```cron
0 3 * * * /opt/todo/scripts/backup.sh >> /opt/todo/backups/backup.log 2>&1
```

This keeps the newest 14 dumps.

### 9.2 Copy backups to your laptop (weekly)

```bash
you@laptop$ rsync -avz deploy@niku.duckdns.org:/opt/todo/backups/ ~/todo-backups/
```

### 9.3 Restoring

See **"Restore a backup"** in `DEPLOY.md` — the commands are identical.

---

## Part 10 — Monitoring

- **Uptime:** create a free monitor at **UptimeRobot** (or Better Stack) for
  `https://niku.duckdns.org/api/health`. It alerts you by email if the app goes down.
- **Errors:**

  ```bash
  docker compose -f docker-compose.prod.yml logs api | grep -E '"level":(50|60)'
  docker compose -f docker-compose.prod.yml logs api | grep 'Reminder delivery failed'
  ```

- **Disk:** `df -h`. Container logs are capped automatically.

---

## Part 11 — Updating the app

```bash
cd /opt/todo
/opt/todo/scripts/backup.sh                                     # safety first
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

Reminders that come due during the short restart are sent as soon as the API is back.

---

## Part 12 — Staying free on Oracle

- Only create resources labelled **Always Free-eligible**. Don't add extra block volumes,
  load balancers or paid shapes.
- Keep the budget alert from step 1.3.
- **Don't terminate the instance** unless you mean to — the public IP is released and DNS must
  be updated to the new one. Stopping and starting is fine.
- Log in to the Oracle console every few weeks so the account stays active.
- If you use DuckDNS and the IP ever changes, update it on duckdns.org.

---

## Troubleshooting

- **Site doesn't load / HTTPS certificate not issued:** check `logs caddy`. Usually one of:
  DNS doesn't point at the server yet; ports 80/443 missing from the Oracle Security List
  (Part 4); Oracle's iptables rules still present (repeat 5.1, then `sudo iptables -S` should
  show no `REJECT` lines); or UFW missing 80/443 (`sudo ufw status`).
- **Can't SSH after a change:** use the Oracle console → instance → **Console connection**
  (Cloud Shell) to get in and fix the SSH config.
- **"SMTP verification failed" in the API logs:** wrong `SMTP_USER`/`SMTP_PASS`, or 2-Step
  Verification isn't on. Use an app password, not your normal password.
- **Both Gmail ports blocked (5.8):** open an Oracle support request asking to allow outbound
  SMTP submission, or switch to an email provider with a free tier that accepts port 2525
  (Nodemailer works with any SMTP provider).
- **Push notifications don't arrive:** the browser must be running, notifications allowed for
  the site, and *Browser push notifications* on in Settings.
- **API container keeps restarting:** `logs api` shows which environment variable is missing or
  invalid.
- **Build runs out of memory:** make sure swap is on (`free -h`), then run the build again.