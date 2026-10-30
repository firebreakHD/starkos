#!/usr/bin/env python3
"""Read-only SMB helper for STARK OS media sources.

The JavaScript side cannot talk SMB reliably: the pure-JS client it used
rejected Samba servers, which is what Synology, QNAP and OpenMediaVault run.
This helper uses smbprotocol, the maintained Python implementation, the same
way the CreatorOS project already does against the same hardware.

Protocol: one JSON line arrives on stdin.

    {"operation": "list"|"get",
     "config": {"host", "port", "share", "baseFolder", "username", "domain",
                "encrypt"},
     "password": "...",
     "path": "sub/folder/file.jpg",
     "maxBytes": 20971520}

The answer is one JSON header line; for "get" the file bytes follow it.
The password only ever travels through stdin, never through the command line,
the environment or a log.
"""

import json
import os
import re
import sys

MAX_HEADER = 64 * 1024
CHUNK = 256 * 1024
FILE_ATTRIBUTE_REPARSE_POINT = 0x400
HOST_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
SHARE_PATTERN = re.compile(r"^[^\\/:*?\"<>|\x00-\x1f]+$")


def respond(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def fail(message, status=502):
    respond({"ok": False, "error": message, "status": status})
    sys.exit(0)


def clean_segments(value, label):
    """Split a relative path and refuse anything that could leave the share."""
    text = str(value or "")
    if "\\" in text:
        fail(f"{label} darf keine Backslashes enthalten.", 400)
    if any(ord(character) < 32 for character in text):
        fail(f"{label} enthält Steuerzeichen.", 400)
    segments = [part for part in text.split("/") if part]
    for part in segments:
        if part in (".", ".."):
            fail("Pfad liegt außerhalb der Medienquelle.", 400)
        if not SHARE_PATTERN.match(part):
            fail(f"{label} enthält unzulässige Zeichen.", 400)
    return segments


def unc(root, segments):
    return "\\".join([root] + list(segments)) if segments else root


def is_link(attributes):
    return bool(attributes & FILE_ATTRIBUTE_REPARSE_POINT)


def main():
    raw = sys.stdin.readline(MAX_HEADER + 1)
    if not raw:
        fail("Keine Anfrage erhalten.", 400)
    if len(raw) > MAX_HEADER:
        fail("Anfrage ist zu groß.", 400)
    try:
        command = json.loads(raw)
    except ValueError:
        fail("Anfrage ist kein gültiges JSON.", 400)

    config = command.get("config") or {}
    host = str(config.get("host") or "")
    share = str(config.get("share") or "")
    if not HOST_PATTERN.match(host):
        fail("Adresse der Freigabe ist ungültig.", 400)
    if not SHARE_PATTERN.match(share):
        fail("Name der Freigabe ist ungültig.", 400)

    base = clean_segments(config.get("baseFolder"), "Basisordner")
    relative = clean_segments(command.get("path"), "Pfad")
    root = f"\\\\{host}\\{share}"
    target = unc(root, base + relative)

    username = str(config.get("username") or "")
    domain = str(config.get("domain") or "")
    if domain:
        username = f"{domain}\\{username}"

    # Erst nach der Eingabeprüfung: ungültige Pfade werden auch dann
    # abgewiesen, wenn die Laufzeit fehlt.
    try:
        import smbclient
        from smbprotocol.exceptions import SMBOSError, SMBResponseException
    except ImportError:
        fail(
            "SMB-Laufzeit fehlt: das Python-Paket smbprotocol ist nicht installiert.",
            501,
        )

    try:
        # DFS referrals are not needed for a plain share and only add a
        # round trip that some servers answer differently.
        smbclient.ClientConfig(skip_dfs=True)
        smbclient.register_session(
            host,
            username=username,
            password=command.get("password") or "",
            port=int(config.get("port") or 445),
            encrypt=bool(config.get("encrypt")),
            require_signing=True,
            auth_protocol="ntlm",
            connection_timeout=20,
        )
    except Exception as error:  # noqa: BLE001 - the library raises many types
        text = str(error)
        # Eine nicht erreichbare Freigabe ist kein Anmeldefehler; sonst sucht
        # man an der falschen Stelle.
        if "Failed to connect" in text or "timed out" in text.lower():
            fail(
                f"Freigabe nicht erreichbar: {host}:{config.get('port') or 445}",
                502,
            )
        if isinstance(error, (SMBOSError, SMBResponseException, ValueError)):
            fail(
                "SMB-Anmeldung fehlgeschlagen. Benutzer, Passwort oder Domäne prüfen.",
                401,
            )
        fail(f"SMB-Verbindung fehlgeschlagen: {error}", 502)

    operation = command.get("operation")
    try:
        if operation == "list":
            info = smbclient.stat(target, follow_symlinks=False)
            if is_link(info.st_file_attributes):
                fail("Verknüpfungen werden nicht geöffnet.", 400)
            entries = []
            for entry in smbclient.scandir(target):
                try:
                    stat = entry.stat(follow_symlinks=False)
                except Exception:  # noqa: BLE001 - skip what we cannot read
                    continue
                if is_link(stat.st_file_attributes):
                    continue
                entries.append(
                    {
                        "name": entry.name,
                        "directory": entry.is_dir(follow_symlinks=False),
                        "size": int(stat.st_size),
                    }
                )
            respond({"ok": True, "entries": entries})
            return

        if operation == "get":
            if not relative:
                fail("Kein Pfad angegeben.", 400)
            info = smbclient.stat(target, follow_symlinks=False)
            if is_link(info.st_file_attributes):
                fail("Verknüpfungen werden nicht geöffnet.", 400)
            if info.st_file_attributes & 0x10:
                fail("Der Pfad ist ein Ordner.", 400)
            limit = int(command.get("maxBytes") or 0)
            size = int(info.st_size)
            if limit and size > limit:
                fail("NAS-Datei ist zu groß.", 413)
            respond({"ok": True, "length": size})
            written = 0
            with smbclient.open_file(target, mode="rb", share_access="r") as handle:
                while True:
                    chunk = handle.read(CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if limit and written > limit:
                        sys.exit(1)
                    sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            return

        fail(f"Unbekannter Vorgang: {operation}", 400)
    except SMBOSError as error:
        code = getattr(error, "errno", None)
        fail(
            f"Zugriff auf die Freigabe fehlgeschlagen: {error}",
            404 if code == 2 else 502,
        )
    except SMBResponseException as error:
        fail(f"Die Freigabe hat abgelehnt: {error}", 502)
    except Exception as error:  # noqa: BLE001
        fail(f"SMB-Zugriff fehlgeschlagen: {error}", 502)
    finally:
        try:
            smbclient.delete_session(host, port=int(config.get("port") or 445))
        except Exception:  # noqa: BLE001 - the session is gone either way
            pass


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
