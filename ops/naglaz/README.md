# Na Glaz production deployment

Every push to `main` is built by `.github/workflows/deploy-naglaz.yml` and deployed as an immutable static release to `/srv/playne/releases/<git-sha>`.

The server uses a dedicated locked account and forced SSH command. GitHub Actions can only upload a digest-bound archive, request deployment of that exact SHA, and read back the active SHA/digest. The root deployment script validates archive paths and sizes, rejects links and special files, switches `current` atomically, verifies the public page and hashed assets, rolls back on failure, and retains four releases.

## One-time server setup

Generate a dedicated Ed25519 key outside the repository, copy only its public key to the server, and run:

```sh
sudo ./install-foundation.sh /path/to/naglaz-github-actions.pub
```

Configure the `naglaz-production` GitHub environment and these Actions secrets
in `Magnum113/playne`:

- `NAGLAZ_VPS_HOST`
- `NAGLAZ_VPS_SSH_KEY_B64`
- `NAGLAZ_VPS_KNOWN_HOSTS_B64`

The active Nginx configuration serves the game at
`https://www.kadimag.ru/naglaz/` from `/srv/playne/current`. The public
`https://kadimag.ru/naglaz/` address redirects there. The `www` origin is
deliberately separate from the private Kadimag app, so the game can use
`localStorage` for the record without seeing the private app's browser storage.

The dedicated Nginx site is `/etc/nginx/sites-available/playne`, enabled by
`/etc/nginx/sites-enabled/playne`. Install `playne-site.nginx.conf` there and
`www-origin.nginx.conf` as `/etc/nginx/snippets/playne-public.conf`.
Install `canonical-origin.nginx.conf` as
`/etc/nginx/snippets/playne-canonical.conf`; the `kadimag.ru` HTTPS server includes
that snippet only to support the existing `/naglaz` URLs. The `www.kadimag.ru`
server blocks belong entirely to Playne. Access and error logs are
`/var/log/nginx/playne.access.log` and `/var/log/nginx/playne.error.log`.

SVG images request PNG artwork with `crossOrigin="anonymous"`, so the public
art directory sends CORS/CORP headers. Keep these headers scoped to
`/naglaz/art/`. The game uses a restrictive CSP without the `sandbox` directive;
origin isolation comes from `www`, while browser storage remains available.
The deployment workflow verifies the content and headers of every artwork file.

## Server project boundaries

- `/srv/playne/releases`, `current`, `previous`, `incoming`, `.sealed` contain only Playne releases and deployment state.
- `/srv/playne/backups` contains private migration backups, outside the public Nginx root.
- `naglaz-deploy` is the existing dedicated locked SSH account. Its home and upload lock are in `/var/lib/naglaz-deploy`.
- `/usr/local/libexec/naglaz-ci-ssh` and `/usr/local/sbin/naglaz-deploy` operate only on `/srv/playne`.
- The game is static: it needs no application process, database, or files from `/srv/kadimag`, `/opt/komui`, or `/opt/getomerch`.
- Nginx and the TLS certificate for the existing domain are host infrastructure shared with other sites.

`isolate-playne.sh` performs the one-time migration from `/srv/naglaz`:
copies and compares all releases, backs up the original Nginx/deployment files,
extracts only game routes, validates Nginx, reloads it, and checks the public HTML.
It locks both uploads and deployments and restores the original configuration
if activation fails. After a successful deployment from `Magnum113/playne`,
archive the legacy directory under `/srv/playne/backups`; retain the original
release files for rollback.
