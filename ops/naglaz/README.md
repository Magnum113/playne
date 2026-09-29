# Na Glaz production deployment

Every push to `main` is built by `.github/workflows/deploy-naglaz.yml` and deployed as an immutable static release to `/srv/naglaz/releases/<git-sha>`.

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
`https://www.kadimag.ru/naglaz/` from `/srv/naglaz/current`. The public
`https://kadimag.ru/naglaz/` address redirects there. The `www` origin is
deliberately separate from the private Kadimag app, so the game can use
`localStorage` for the record without seeing the private app's browser storage.

The HTTPS server must also contain the location in `artwork.nginx.conf`.
SVG images request PNG artwork with `crossOrigin="anonymous"`, so the public
art directory sends CORS/CORP headers. Keep these headers scoped to
`/naglaz/art/`. The game uses a restrictive CSP without the `sandbox` directive;
origin isolation comes from `www`, while browser storage remains available.
The deployment workflow verifies the content and headers of every artwork file.
