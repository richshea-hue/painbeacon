"""Load the repo's .env, so the Python scripts behave like the Node ones.

The Node scripts get this free: they run as `node --env-file=.env ...`.
Python does not, so every outreach script has quietly required the caller to
export variables by hand first. Worse, the README told you to do it with

    export SUPABASE_URL=...

which is bash, and these scripts are actually run from PowerShell on Windows,
where that line does nothing at all and the script then dies with
"[fatal] SUPABASE_URL not set" — a message that points at the environment
rather than at the instruction that failed to set it.

Anything already in the environment wins over the file, so CI and one-off
overrides still work. Nothing here is printed: these are credentials.
"""

import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_PATH = os.path.join(REPO, ".env")


def load_env(path=ENV_PATH):
    """Read KEY=VALUE lines from .env into os.environ. Missing file is fine."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return False
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        # Strip an inline comment only when the value is unquoted; a key can
        # legitimately contain a '#'.
        value = value.strip()
        if value[:1] in ("'", '"') and value[-1:] == value[:1] and len(value) > 1:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        if key and key not in os.environ:
            os.environ[key] = value
    return True


def need(*names):
    """First of `names` that is set, or exit explaining what was looked for.

    Takes several names because the repo is inconsistent about one of them:
    build_confirm_targets.py has always wanted SUPABASE_SERVICE_KEY while
    .env.example documents SUPABASE_SERVICE_ROLE_KEY. Accepting both is
    kinder than making someone discover that by reading two files.
    """
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    looked = names[0] if len(names) == 1 else " or ".join(names)
    raise SystemExit(
        f"[fatal] {looked} is not set.\n"
        f"        Add it to {ENV_PATH} (gitignored) and re-run — these scripts\n"
        f"        read that file themselves now. To override for one run:\n"
        f"          PowerShell   $env:{names[0]} = '...'\n"
        f"          bash         export {names[0]}=...",
    )


def auth_headers(key):
    """Headers for a Supabase REST call, correct for both key formats.

    Legacy keys are JWTs (they start with "eyJ") and are accepted in both the
    apikey header and an Authorization Bearer header. The 2026 keys
    (sb_publishable_... and sb_secret_...) are sent on apikey only and are
    NOT valid as a Bearer token, so sending both fails for a project that has
    migrated — which looks like an auth problem and is really a header
    problem. Send Bearer only when the key is actually a JWT.
    """
    headers = {"apikey": key}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


load_env()
