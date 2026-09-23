"""Check _env.py against the .env shapes that have actually broken it.

Run: python scripts/outreach/test_env.py

This exists because the loader failed twice on the same machine, both times
reporting "[fatal] SUPABASE_URL is not set" about a .env whose first line was
SUPABASE_URL=... — first because nothing read .env at all, then because
Notepad had written a UTF-8 BOM and the first key came through as
"﻿SUPABASE_URL". The message pointed at the environment each time and the
fault was in the parser, so the cases are pinned here rather than rediscovered.

No dependencies and no network: it writes temp files and reads them back.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import _env  # noqa: E402

FAILURES = []


def check(name, got, want):
    if got == want:
        print(f"  ok    {name}")
    else:
        print(f"  FAIL  {name}\n        got  {got!r}\n        want {want!r}")
        FAILURES.append(name)


def load(body, binary=False):
    """Write body to a temp file, load it into a clean environment, return it."""
    mode, suffix = ("wb", b"") if binary else ("w", "")
    with tempfile.NamedTemporaryFile(mode, suffix=".env", delete=False) as f:
        f.write(body)
        path = f.name
    for key in [k for k in os.environ if k.startswith(("SUPABASE_", "PB_TEST_"))]:
        del os.environ[key]
    _env.LOADED.clear()
    _env.load_env(path)
    os.unlink(path)
    return os.environ


def main():
    print("_env.py")

    # Notepad's UTF-8 BOM plus Windows line endings. The BOM is the one that
    # hides: it only ever damages the FIRST key in the file.
    env = load(
        b"\xef\xbb\xbfSUPABASE_URL=https://x.supabase.co\r\n"
        b"SUPABASE_PUBLISHABLE_KEY=sb_publishable_x\r\n",
        binary=True,
    )
    check("BOM does not corrupt the first key", env.get("SUPABASE_URL"), "https://x.supabase.co")
    check("CRLF is stripped", env.get("SUPABASE_PUBLISHABLE_KEY"), "sb_publishable_x")

    # A quoted value that also carries a trailing comment. Getting the order
    # wrong leaves the quotes on, which stops a JWT looking like a JWT.
    env = load('SUPABASE_ANON_KEY="eyJabc"  # legacy\nPB_TEST_HASH=\'a#b\'\n')
    check("quotes and inline comment", env.get("SUPABASE_ANON_KEY"), "eyJabc")
    check("'#' inside quotes survives", env.get("PB_TEST_HASH"), "a#b")

    # A bash line pasted straight out of the old README.
    env = load("export SUPABASE_URL=https://y.supabase.co\n")
    check("leading 'export' is ignored", env.get("SUPABASE_URL"), "https://y.supabase.co")

    # Comments, blanks, and a value containing '=' (base64 keys end in one).
    env = load("# note\n\nPB_TEST_B64=YWJj==\nSUPABASE_URL=https://z.supabase.co\n")
    check("'=' inside a value", env.get("PB_TEST_B64"), "YWJj==")
    check("comments and blank lines skipped", env.get("SUPABASE_URL"), "https://z.supabase.co")

    # The environment always wins, so a one-off override still works.
    os.environ["SUPABASE_URL"] = "https://override"
    with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as f:
        f.write("SUPABASE_URL=https://from-file\n")
        path = f.name
    _env.load_env(path)
    os.unlink(path)
    check("environment beats the file", os.environ["SUPABASE_URL"], "https://override")
    del os.environ["SUPABASE_URL"]

    # Auth headers: only a real JWT may carry a Bearer token. A 2026-format
    # key sent as Bearer is rejected, which reads as bad credentials.
    check("JWT gets Bearer", sorted(_env.auth_headers("eyJabc")), ["Authorization", "apikey"])
    check("sb_ key is apikey only", sorted(_env.auth_headers("sb_publishable_x")), ["apikey"])

    # A missing name must say what the file did give, and must never print a
    # value — these are credentials.
    load("SUPABASE_URL=https://x.supabase.co\nSUPABASE_SECRET_KEY=sb_secret_TOPSECRET\n")
    try:
        _env.need("SUPABASE_ANON_KEY")
        check("missing name exits", "no exit", "SystemExit")
    except SystemExit as err:
        msg = str(err)
        check("names what it read", "SUPABASE_SECRET_KEY" in msg, True)
        check("never prints a value", "TOPSECRET" in msg, False)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} failed: {', '.join(FAILURES)}")
        return 1
    print("all env-loader cases pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
