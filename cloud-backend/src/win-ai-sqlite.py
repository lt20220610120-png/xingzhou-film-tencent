"""Read-only classification for the pinned release; upstream still authenticates."""
import base64
import hashlib
import decimal
import json
import re
import sqlite3
import sys
import urllib.parse


def strip_bearer(value):
    return value[7:].strip() if value.startswith(('Bearer ', 'bearer ')) else value


def go_query(raw):
    """Go url.ParseQuery keeps the first empty value and drops malformed pairs."""
    result = {}
    for pair in raw.split('&'):
        if ';' in pair or re.search(r'%(?![0-9a-fA-F]{2})', pair):
            continue
        for key, value in urllib.parse.parse_qsl(pair, keep_blank_values=True):
            result.setdefault(key, []).append(value)
    return result


def effective_relay_key(inp, path, query):
    # Exact override order from pinned middleware/auth.go TokenAuth.
    key = inp.get('authorization') or ''
    for protocol in (inp.get('websocketProtocol') or '').split(','):
        protocol = protocol.strip()
        if protocol.startswith('openai-insecure-api-key.'):
            candidate = protocol[len('openai-insecure-api-key.'):]
            if candidate:
                key = 'Bearer ' + candidate
            break
    if '/v1/messages' in path or '/v1/models' in path:
        if inp.get('apiKey'):
            key = 'Bearer ' + inp['apiKey']
    if path == '/v1/models' or path.startswith(('/v1beta/models', '/v1beta/openai/models', '/v1/models/')):
        if query.get('key', [''])[0]:
            key = 'Bearer ' + query['key'][0]
        if inp.get('googleKey'):
            key = 'Bearer ' + inp['googleKey']
    key = strip_bearer(key)
    if not key or key == 'midjourney-proxy':
        key = strip_bearer(inp.get('mjKey') or '')
    return key.removeprefix('sk-').split('-')[0]


def lookup(db, inp):
    if inp.get('paymentOrder'):
        table = 'subscription_orders' if inp.get('paymentKind') == 'subscription' else 'top_ups'
        row = db.execute('select money from '+table+' where trade_no=? and payment_provider=?', (inp['paymentOrder'], 'epay')).fetchone()
        try:
            amount = decimal.Decimal(str(inp.get('paymentMoney') or ''))
            matches = bool(row and amount.is_finite() and amount > 0 and amount == decimal.Decimal(f"{row['money']:.2f}"))
        except decimal.InvalidOperation:
            matches = False
        return {'amountMatches': matches}
    url = urllib.parse.urlsplit(inp.get('uri') or '/')
    path = urllib.parse.unquote(url.path)
    base = "select u.id, b.provider_user_id as source_id from users u left join user_oauth_bindings b on b.user_id=u.id and b.provider_id=(select id from custom_oauth_providers where slug='xingzhou') "
    read_only_relay = path.rstrip('/') in ('/api/usage/token', '/api/log/token')
    if read_only_relay or not path.startswith(('/api/', '/pg/')):
        key = strip_bearer(inp.get('authorization') or '').removeprefix('sk-').split('-')[0] if read_only_relay else effective_relay_key(inp, path, go_query(url.query))
        row = db.execute(base + 'join tokens t on t.user_id=u.id where t.key=?', (key,)).fetchone() if key else None
        return dict(row) if row else None
    cookies = {}
    for fragment in (inp.get('cookie') or '').split(';'):
        name, found, value = fragment.strip().partition('=')
        if not found:
            value = ''
        if len(value) >= 2 and value[0] == value[-1] == '"':
            value = value[1:-1]
        # Go Request.Cookie uses the first syntactically valid occurrence.
        if any(ord(c) < 32 or ord(c) >= 127 or c in '\\";' for c in value):
            continue
        cookies.setdefault(name, value)
    raw = (inp.get('authorization') or '').strip()
    parts = raw.split()
    if len(parts) == 2 and parts[0].lower() == 'bearer':
        raw = parts[1]
    elif len(parts) != 1:
        raw = ''
    sid = None
    if path == '/api/user/auth/refresh' and cookies.get('new_api_refresh'):
        sid = cookies['new_api_refresh'].split('.')[0]
    elif raw.count('.') == 2:
        try:
            sid = json.loads(base64.urlsafe_b64decode(raw.split('.')[1] + '===')).get('sid')
        except (ValueError, TypeError):
            return {'invalid': True}
    if sid:
        row = db.execute(base + 'join user_sessions s on s.user_id=u.id where s.sid=?', (sid,)).fetchone()
        return {**dict(row), 'sid': sid} if row else {'invalid': True}
    if raw.startswith('nap_'):
        row = db.execute(base + 'join user_access_tokens t on t.user_id=u.id where t.token_hash=?', (hashlib.sha256(raw.encode()).hexdigest(),)).fetchone()
    elif raw:
        row = db.execute(base + 'where u.access_token=?', (raw,)).fetchone()
    else:
        row = None
    return dict(row) if row else None


if __name__ == '__main__':
    try:
        inp = json.load(sys.stdin)
        db = sqlite3.connect('file:' + urllib.parse.quote(sys.argv[1]) + '?mode=ro', uri=True, timeout=2)
        db.row_factory = sqlite3.Row
        print(json.dumps(lookup(db, inp)))
    except Exception:
        print('identity lookup unavailable', file=sys.stderr)
        sys.exit(1)
