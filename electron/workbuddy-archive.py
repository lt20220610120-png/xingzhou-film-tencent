"""Extract a verified release into a new staging directory, without executing it."""
import re
import json
import os
import shutil
import sqlite3
import sys
import tarfile
from pathlib import Path, PurePosixPath

CODE_PATHS = ('server', 'web/out', 'deploy', '.version', '.venv')
PATH_KEYS = {
    'WB_DATA_DIR', 'WB_DB', 'WB_USERS_FILE', 'WB_AUTH_DIR', 'WB_UPSTREAM_CONFIG',
    'WB_UPSTREAM_DIR', 'WB_CLIENT_PATHS_FILE', 'WB_CCSWITCH_DIR', 'WB_ZCODE_DIR',
    'WB2API_LOG_FILE', 'WB_UPSTREAM_REF_FILE', 'WB_UPDATE_STATUS',
    'WB2A_AUTH_DIR', 'WB2A_STATE_FILE', 'WB2A_DEVICE_TOKEN_FILE', 'WB2A_PROMPT_FILE',
}


def load_path_env(root):
    try:
        from dotenv import load_dotenv
    except ImportError:
        # The installed uvicorn[standard] runtime has python-dotenv. A conservative
        # standard-library fallback keeps standalone QA usable; ambiguous syntax
        # is rejected rather than interpreted differently from the running service.
        env_file = root / '.env'
        if not env_file.exists():
            return
        for line in env_file.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
            if not match or match[1] not in PATH_KEYS or match[1] in os.environ:
                continue
            value = match[2]
            if value.startswith(('"', "'")):
                quoted = re.fullmatch(r'([\"\x27])(.*?)\1(?:\s+#.*)?', value)
                if not quoted:
                    raise ValueError('ambiguous path environment')
                value = quoted[2]
                if quoted[1] == '"' and '\\' in value:
                    raise ValueError('ambiguous path escaping')
            else:
                value = re.sub(r'\s+#.*$', '', value).strip()
            if '${' in value:
                raise ValueError('path interpolation requires dotenv')
            os.environ[match[1]] = value
    else:
        # Mirrors uvicorn's --env-file: process variables take priority and dotenv
        # interpolation occurs inside this isolated, short-lived child process.
        load_dotenv(root / '.env', override=False)


def inspect_data(root):
    root = Path(root).resolve()
    load_path_env(root)
    result = []

    def resolve(raw, base=root):
        candidate = Path(str(raw)).expanduser()
        return (candidate if candidate.is_absolute() else base / candidate).resolve()

    def env_path(key, default):
        candidate = resolve(os.environ.get(key, '').strip() or default)
        result.append({'key': key, 'path': str(candidate)})
        return candidate

    def conflict():
        return any(Path(item['path']) == root / rel or root / rel in Path(item['path']).parents
                   for item in result for rel in CODE_PATHS)

    result.extend({'key': label, 'path': str((root / relative).resolve())}
                  for label, relative in (('.env', '.env'), ('data/', 'data'), ('upstream/', 'upstream')))
    data = env_path('WB_DATA_DIR', root / 'data')
    database = env_path('WB_DB', data / 'manager.db')
    env_path('WB_USERS_FILE', data / 'users.json')
    upstream_config = env_path('WB_UPSTREAM_CONFIG', root / 'upstream' / 'config.json')
    upstream = env_path('WB_UPSTREAM_DIR', upstream_config.parent)
    # Native service startup uses root/upstream as Go's working directory when
    # WB_UPSTREAM_DIR is absent, while Python's config defaults to config.parent.
    # Protect relative Go data against both bases when they differ.
    native_upstream = resolve(os.environ.get('WB_UPSTREAM_DIR', '').strip() or root / 'upstream')
    upstream_bases = {upstream, native_upstream}
    env_path('WB_AUTH_DIR', upstream / 'auths')
    env_path('WB_CLIENT_PATHS_FILE', data / 'client_paths.json')
    env_path('WB_CCSWITCH_DIR', Path.home() / '.cc-switch')
    env_path('WB_ZCODE_DIR', Path.home() / '.zcode' / 'v2')
    env_path('WB2API_LOG_FILE', upstream / 'data' / 'server.err.log')
    env_path('WB_UPSTREAM_REF_FILE', data / 'upstream-ref.txt')
    env_path('WB_UPDATE_STATUS', data / 'update-status.json')
    for key in ('WB2A_AUTH_DIR', 'WB2A_STATE_FILE', 'WB2A_DEVICE_TOKEN_FILE', 'WB2A_PROMPT_FILE'):
        if os.environ.get(key, '').strip():
            result.extend({'key': key, 'path': str(resolve(os.environ[key], base))} for base in upstream_bases)
    # Return conflicts before opening a configured database/config location that
    # itself lies in a code tree; the main process reports only the setting key.
    if conflict():
        return result
    if not upstream_config.is_file():
        raise ValueError('missing upstream configuration')
    if upstream_config.exists():
        config = json.loads(upstream_config.read_text(encoding='utf-8'))
        if not isinstance(config, dict):
            raise ValueError('invalid upstream configuration')
        for key, raw in (
            ('auth_dir', config.get('auth_dir') or './auths'),
            ('state_file', config.get('state_file') or './data/state.json'),
            ('upstream.device_token_file', (config.get('upstream') or {}).get('device_token_file')),
            ('prompt.file', (config.get('prompt') or {}).get('file')),
        ):
            if raw:
                if not isinstance(raw, str):
                    raise ValueError('invalid upstream path')
                result.extend({'key': key, 'path': str(resolve(raw, base))} for base in upstream_bases)
    if conflict():
        return result
    if database.exists():
        # URI mode=ro never creates a missing database or changes its contents.
        # Read only auth_dir, never API keys, account contents or token columns.
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=2) as connection:
            connection.execute('PRAGMA query_only=ON')
            table = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='upstreams'").fetchone()
            if table and 'auth_dir' in [row[1] for row in connection.execute('PRAGMA table_info(upstreams)')]:
                for (raw,) in connection.execute("SELECT auth_dir FROM upstreams WHERE auth_dir IS NOT NULL AND trim(auth_dir) <> ''"):
                    if not isinstance(raw, str):
                        raise ValueError('invalid group auth directory')
                    result.append({'key': '分组账号目录', 'path': str(resolve(raw))})
    return result


def extract(archive, destination, version):
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version):
        raise ValueError('invalid release version')
    target = Path(destination).resolve()
    if target.exists():
        raise ValueError('staging destination must not exist')
    expected = 'workbuddy-manager-v' + version
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        if len(members) > 20000 or sum(m.size for m in members) > 256 * 1024 * 1024:
            raise ValueError('release exceeds extraction limit')
        seen = set()
        for member in members:
            name = member.name
            pieces = name.split('/')
            if ('\\' in name or ':' in name or PurePosixPath(name).is_absolute()
                    or not pieces or pieces[0] != expected
                    or any(p in ('', '.', '..') or p.rstrip(' .') != p
                           or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', p, re.I)
                           for p in pieces)
                    or not (member.isfile() or member.isdir())):
                raise ValueError('unsafe archive member')
            normalized = name.casefold()
            if normalized in seen:
                raise ValueError('duplicate archive member')
            seen.add(normalized)
            if member.size < 0 or member.size > 64 * 1024 * 1024:
                raise ValueError('archive file exceeds size limit')
        # Validate every entry before creating any files. Links, devices and special
        # tar metadata entries never reach tarfile.extract / extractall.
        target.mkdir()
        for member in members:
            output = target.joinpath(*member.name.split('/'))
            output.resolve().relative_to(target)
            if member.isdir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, output.open('xb') as dest:
                    shutil.copyfileobj(source, dest)
    root = target / expected
    for required in ('server/main.py', 'server/requirements.txt', 'web/out/index.html', '.version'):
        if not (root / required).is_file():
            raise ValueError('release missing required file')
    if (root / '.version').read_text(encoding='utf-8').strip().lstrip('v') != version:
        raise ValueError('release version mismatch')
    return str(root)


if __name__ == '__main__':
    try:
        if sys.argv[1:2] == ['--inspect-data']:
            print(json.dumps(inspect_data(sys.argv[2]), ensure_ascii=True))
        else:
            print(extract(*sys.argv[1:]))
    except Exception as error:
        # Avoid archive member names or local data in the process error output.
        print('Release extraction rejected: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
