"""Rebuild the committed desktop canvas from its pinned upstream source."""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


COMMIT = "3a6b64b602ad062b29fac66902ed18a7ef5fd9dc"
ARCHIVE_SHA256 = "2ebd99871c543a14bbb880a2417246d911e14a2315bf17b7f9fdffd598f571b9"
BUN_VERSION = "1.3.13"
SCRIPTS = Path(__file__).resolve().parent
CANVAS = SCRIPTS.parent / "canvas-app"
CONTROLS = ("workspace-controls.css", "workspace-selects.js")
BUILD_FILES = ("LICENSE", "config.js", "index.html", "logo.svg")
BUILD_DIRECTORIES = ("assets", "icons", "plugins")


def run(*args, cwd=None, env=None):
    command = shutil.which(args[0])
    if command is None:
        raise SystemExit(f"Required command unavailable: {args[0]}")
    subprocess.run([command, *args[1:]], cwd=cwd, env=env, check=True)


def normalized(path):
    # Git may check out the generated text files with CRLF on Windows.
    return path.read_bytes().replace(b"\r\n", b"\n")


def artifacts(directory):
    paths = [directory / name for name in BUILD_FILES]
    for folder in BUILD_DIRECTORIES:
        paths.extend(path for path in (directory / folder).rglob("*") if path.is_file())
    return {path.relative_to(directory): normalized(path) for path in paths if path.is_file()}


def build(directory):
    archive = directory / "source.tgz"
    run("curl", "--fail", "--location", "--silent", "--show-error", "--retry", "3",
        "--retry-all-errors", "--output", str(archive),
        f"https://codeload.github.com/basketikun/infinite-canvas/tar.gz/{COMMIT}")
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise SystemExit("Infinite Canvas source archive checksum mismatch")
    with tarfile.open(archive) as source_archive:
        source_archive.extractall(directory, filter="data")
    source = directory / f"infinite-canvas-{COMMIT}"
    web = source / "web"
    run("git", "apply", str(SCRIPTS / "infinite-canvas-desktop.patch"), cwd=source)
    for name in CONTROLS:
        (web / "public" / name).write_bytes(normalized(CANVAS / name))
    invocation = ("npm", "exec", "--registry=https://registry.npmjs.org", "--yes",
                  f"--package=bun@{BUN_VERSION}", "--", "bun")
    run(*invocation, "install", "--frozen-lockfile", "--registry", "https://registry.npmjs.org", cwd=web)
    env = {name: value for name, value in os.environ.items() if not name.upper().startswith("VITE_")}
    run(*invocation, "run", "build", cwd=web, env={**env, "VITE_BASE": "./"})
    shutil.copyfile(source / "LICENSE", web / "dist" / "LICENSE")
    return web / "dist"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="replace the checked-in upstream artifacts")
    options = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="xz-infinite-canvas-") as temporary:
        result = build(Path(temporary))
        shipped = artifacts(CANVAS)
        rebuilt = artifacts(result)
        differences = sorted(path for path in shipped.keys() | rebuilt.keys() if shipped.get(path) != rebuilt.get(path))
        if options.write:
            for path in differences:
                destination = CANVAS / path
                if path in rebuilt:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(rebuilt[path])
                else:
                    destination.unlink()
        elif differences:
            raise SystemExit("Infinite Canvas artifacts differ:\n" + "\n".join(map(str, differences)))
    print(f"Infinite Canvas {COMMIT}: {len(rebuilt)} artifacts {'checked in workspace' if options.write else 'match'}")


if __name__ == "__main__":
    main()
