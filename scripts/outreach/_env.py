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

Two Windows details are load-bearing, because this file is edited in Notepad:

  * The file is read as utf-8-sig. Notepad can save a UTF-8 BOM, and a BOM
    makes the FIRST key literally "\ufeffSUPABASE_URL" — so the first line of
    .env goes missing while every later line loads fine. That fails as
    "[fatal] SUPABASE_URL is not set" on a file whose first line is
    SUPABASE_URL=..., which sends you looking in exactly the wrong place.
  * A leading `export ` is stripped. The README used to hand out bash lines,
    and pasting one into .env is the obvious thing to do with it.
"""

import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_PATH = os.path.join(REPO, ".env")


# Names that came out of the .env file, so a failure can say whether the file
# was read at all and what was in it. Names only — never the values.
LOADED = []
LOADED_PATH = None


def load_env(path=ENV_PATH):
    """Read KEY=VALUE lines from .env into os.environ. Missing file is fine."""
    global LOADED_PATH
    try:
        # utf-8-sig, not utf-8: see the BOM note at the top of this file.
        with open(path, encoding="utf-8-sig") as f:
            lines = f.readlines()
    except OSError:
        return False
    LOADED_PATH = path
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        # `export FOO=bar` pasted out of a shell, and a BOM that survived a
        # non-utf-8-sig reader somewhere upstream.
        if key.startswith("export "):
            key = key[len("export "):].strip()
        key = key.lstrip("\ufeff")
        # Strip an inline comment only when the value is unquoted; a key can
        # legitimately contain a '#'. Comment first, then quotes, so that
        #   KEY="value"  # note
        # loses the note and then the quotes. The other order leaves the
        # quotes glued to the value, which for a Supabase key means it no
        # longer looks like the JWT it is and gets the wrong auth header.
        value = value.strip()
        if value[:1] in ("'", '"'):
            end = value.find(value[0], 1)
            if end > 0:
                value = value[1:end]
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        if key:
            LOADED.append(key)
            if key not in os.environ:
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
    # Say what we actually read. "Not set" on a file that plainly contains the
    # name sends you looking at the wrong thing — it is usually the file we
    # could not open, or a key that arrived with a BOM or an `export ` glued to
    # it. Printing the names found (never the values) settles that in one look.
    if LOADED_PATH:
        found = ", ".join(sorted(set(LOADED))) or "nothing readable"
        where = f"        {LOADED_PATH} was read and gave: {found}\n"
    else:
        where = f"        No file at {ENV_PATH} — create it (it is gitignored).\n"
    raise SystemExit(
        f"[fatal] {looked} is not set.\n"
        f"{where}"
        f"        Add it to {ENV_PATH} and re-run — these scripts read that\n"
        f"        file themselves. To override for one run:\n"
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
