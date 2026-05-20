# notifications — operational notes

Two delivery channels live here: **e-mail** (via Django) and **Web Push**
(via `pywebpush` + `py_vapid`). E-mail Just Works™ once SMTP env vars
are set. Push has gotchas worth writing down once.

## Web Push — VAPID keys

Web Push needs an asymmetric key pair (VAPID). The **public** key is sent
to the browser when it subscribes; the **private** key signs each push
the server sends. Mismatched keys = the push service returns 401 and the
notification silently disappears.

### Source of truth (local)

`infra/.secrets/vapid_public_key` and `infra/.secrets/vapid_private_key`
are the local-dev canonical files. The private key is a normal PEM
(PKCS8). Both files are gitignored.

### Storage in production

Container App env vars can't carry multi-line values cleanly — newlines
get mangled or stripped. So in prod we store:

| Variable | Where | Format |
|---|---|---|
| `VAPID_PUBLIC_KEY` | plain env var | url-safe base64 (already single-line) |
| `VAPID_PRIVATE_KEY` | Container App **secret** `vapid-private` | **base64 of the PEM** (single line) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `.github/workflows/azure-static-web-apps-*.yml` | same as `VAPID_PUBLIC_KEY` |

The frontend public key in the SWA workflow file **must** match the
backend `VAPID_PUBLIC_KEY` exactly. If they drift, new subscriptions are
created against the wrong key and every push gets a 401.

### `py_vapid.Vapid.from_string` lies

Despite the name, `from_string` does **not** accept a wrapped PEM. It
expects the raw base64 body — no `-----BEGIN/END-----` banners, no
newlines — and base64 in the url-safe alphabet (`-_`, not `+/`).

`_vapid_private_key()` in `push.py` normalises every shape we've seen
(base64-of-PEM, literal-`\n`-escaped PEM, raw PEM, raw body) into the
canonical form. If push starts failing after a key rotation, check that
helper first — it logs diagnostics on import via `_diag()`.

### Empty config = push disabled

If either VAPID env var is empty, push delivery is a no-op (see
`_vapid_configured()`). Local dev without keys configured still runs;
you just won't get push notifications. E-mail fan-out happens
regardless, so users still hear about discussion replies and reminders.

## Where each notification fires

| Trigger | E-mail | Push |
|---|---|---|
| New discussion topic in scope you follow | yes | yes |
| Reply to your discussion topic | yes | yes |
| Checklist item due / reminder | yes | yes |
| RSVP confirmation / waitlist / approval | yes | no |
| Invoice issued | yes | no |
| Password reset, e-mail verify, etc. | yes | no |

Push is opt-in per device (the browser prompts on subscribe). E-mail is
opt-out via the unsubscribe footer link on each transactional template.

## Adding a new push payload

`send_push_to_user(user, payload)` is the public surface. `payload` is
a JSON-serialisable dict; the service worker's `push` listener reads
`title`, `body`, `url`, and optionally `icon`. Dead endpoints (410 from
the push service) are auto-deleted so the subscription list stays clean.
