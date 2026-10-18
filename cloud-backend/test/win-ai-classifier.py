"""Credential precedence integration against the actual read-only classifier."""
import base64
import hashlib
import importlib.util
import pathlib
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location('identity', pathlib.Path(__file__).parents[1] / 'src/win-ai-sqlite.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class ClassifierTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          create table users(id integer,access_token text);
          create table custom_oauth_providers(id integer,slug text);
          create table user_oauth_bindings(user_id integer,provider_id integer,provider_user_id text);
          create table tokens(user_id integer,key text);
          create table user_sessions(user_id integer,sid text);
          create table user_access_tokens(user_id integer,token_hash text);
          create table top_ups(trade_no text,money real,payment_provider text);
          insert into top_ups values('order-1',10.5,'epay');
          create table subscription_orders(trade_no text,money real,payment_provider text);
          insert into subscription_orders values('plan-1',20.0,'epay');
          insert into users values(1,'legacy-a'),(2,'legacy-b');
          insert into custom_oauth_providers values(1,'xingzhou');
          insert into user_oauth_bindings values(1,1,'source-a'),(2,1,'source-b');
          insert into tokens values(1,'relayA'),(2,'relayB');
          insert into user_sessions values(1,'sid-a'),(2,'sid-b');
        ''')
        self.db.execute('insert into user_access_tokens values(1,?)', (hashlib.sha256(b'nap_testA').hexdigest(),))

    def tearDown(self):
        self.db.close()

    def check(self, expected, uri='/v1/chat/completions', **headers):
        row = identity.lookup(self.db, {'uri': uri, **headers})
        self.assertEqual(expected, row.get('source_id') if row else None)

    def test_path_specific_overrides_cannot_hide_effective_owner(self):
        self.check('source-a', authorization='Bearer sk-relayA', apiKey='unknown', googleKey='unknown')
        self.check('source-b', '/v1/messages', authorization='Bearer sk-relayA', apiKey='sk-relayB')
        self.check('source-a', '/v1/models?key=sk-relayA', apiKey='sk-relayB')
        self.check('source-b', '/v1/models?key=sk-relayA', googleKey='sk-relayB')
        self.check('source-b', '/v1beta/models/model:generateContent', googleKey='sk-relayB')
        self.check('source-a', '/v1/chat/completions?key=unknown', authorization='Bearer sk-relayA')
        self.check('source-a', '/v1/models?key=&key=unknown', authorization='Bearer sk-relayA')
        self.check('source-a', '/v1/models?key=unknown%ZZ', authorization='Bearer sk-relayA')
        self.check('source-a', '/v1/models?key=unknown;key=other', authorization='Bearer sk-relayA')

    def test_websocket_and_midjourney_credentials(self):
        self.check('source-b', authorization='Bearer sk-relayA', websocketProtocol='realtime, openai-insecure-api-key.sk-relayB')
        self.check('source-a', mjKey='sk-relayA')
        self.check('source-a', authorization='Bearer midjourney-proxy', mjKey='sk-relayA')
        self.check('source-b', '/v1/messages', websocketProtocol='openai-insecure-api-key.sk-relayA', apiKey='sk-relayB')

    def test_dashboard_pat_and_refresh_cookie_owner(self):
        self.check('source-a', '/api/user/self', authorization='Bearer nap_testA', apiKey='unknown')
        self.check('source-b', '/api/user/self', authorization='legacy-b')
        jwt = 'header.' + base64.urlsafe_b64encode(b'{"sid":"sid-a"}').decode().rstrip('=') + '.signature'
        self.check('source-a', '/api/user/self', authorization='Bearer ' + jwt)
        self.check('source-b', '/api/user/auth/refresh', authorization='Bearer ' + jwt, cookie='new_api_refresh=sid-b.secret')
        self.check('source-a', '/api/user/auth/refresh', cookie='new_api_refresh=sid-a.secret; new_api_refresh=sid-b.secret')
        self.check('source-a', '/api/user/auth/refresh', cookie='new_api_refresh=sid-b.bad\\value; new_api_refresh="sid-a.secret"')
        self.assertTrue(identity.lookup(self.db, {'uri': '/api/user/self', 'authorization': 'a.malformed.c'})['invalid'])

    def test_payment_amount_matches_exact_existing_order(self):
        self.assertTrue(identity.lookup(self.db, {'paymentOrder': 'order-1', 'paymentMoney': '10.50'})['amountMatches'])
        self.assertFalse(identity.lookup(self.db, {'paymentOrder': 'order-1', 'paymentMoney': '0.01'})['amountMatches'])
        self.assertFalse(identity.lookup(self.db, {'paymentOrder': 'unknown', 'paymentMoney': '10.50'})['amountMatches'])
        self.assertFalse(identity.lookup(self.db, {'paymentOrder': 'order-1', 'paymentMoney': 'NaN'})['amountMatches'])
        self.assertTrue(identity.lookup(self.db, {'paymentOrder': 'plan-1', 'paymentMoney': '20.00', 'paymentKind': 'subscription'})['amountMatches'])
        self.assertFalse(identity.lookup(self.db, {'paymentOrder': 'plan-1', 'paymentMoney': '0.01', 'paymentKind': 'subscription'})['amountMatches'])


if __name__ == '__main__':
    unittest.main()
