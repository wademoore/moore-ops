#!/usr/bin/env python3
"""Independent confirmation of the SigV4 known-answer vectors.

test/worker/sigv4-known-answer.test.js asserts five published constants. Its
header used to say they "were additionally confirmed against an independent
implementation in Python" — a claim a future reader had no way to check,
which is precisely the standard that file otherwise sets for itself. This is
that confirmation, in the repository and re-runnable:

    python3 scratch/mobile-worker/verify-sigv4-vectors.py

It shares no code with the Worker. Different language, different standard
library, the algorithm written out from its published description. If it and
the JS suite agree, the constants are right; if they disagree, one of the two
implementations is wrong and the constant is the tie-breaker.

Deliberately not part of `npm test`: package.json's globs are test/**,
digest/** and render/**, and nothing under scratch/ runs there.
"""
import hashlib
import hmac
import sys

SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'  # the AWS docs' example. Not a key.
EMPTY = hashlib.sha256(b'').hexdigest()


def _hmac(key, message):
    return hmac.new(key, message.encode('utf-8'), hashlib.sha256).digest()


def signing_key(secret, datestamp, region, service):
    key = _hmac(('AWS4' + secret).encode('utf-8'), datestamp)
    key = _hmac(key, region)
    key = _hmac(key, service)
    return _hmac(key, 'aws4_request')


def sigv4(canonical_query, region, service, amzdate, datestamp):
    canonical = '\n'.join([
        'GET', '/', canonical_query,
        'host:example.amazonaws.com\nx-amz-date:{}\n'.format(amzdate),
        'host;x-amz-date', EMPTY,
    ])
    scope = '{}/{}/{}/aws4_request'.format(datestamp, region, service)
    string_to_sign = '\n'.join([
        'AWS4-HMAC-SHA256', amzdate, scope,
        hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
    ])
    key = signing_key(SECRET, datestamp, region, service)
    return hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()


CASES = [
    ('RFC 4231 HMAC-SHA256 test case 1',
     hmac.new(bytes([0x0b]) * 20, b'Hi There', hashlib.sha256).hexdigest(),
     'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'),
    ('RFC 4231 HMAC-SHA256 test case 2',
     hmac.new(b'Jefe', b'what do ya want for nothing?', hashlib.sha256).hexdigest(),
     '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'),
    ('SHA-256 of the empty string', EMPTY,
     'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
    ('SHA-256 of "abc"', hashlib.sha256(b'abc').hexdigest(),
     'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
    ('AWS documented signing key, 20120215/us-east-1/iam',
     signing_key(SECRET, '20120215', 'us-east-1', 'iam').hex(),
     'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d'),
    ('AWS SigV4 test suite: get-vanilla',
     sigv4('', 'us-east-1', 'service', '20150830T123600Z', '20150830'),
     '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'),
    ('AWS SigV4 test suite: get-vanilla-query-order-key-case',
     sigv4('Param1=value1&Param2=value2', 'us-east-1', 'service', '20150830T123600Z', '20150830'),
     'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500'),
]

failures = 0
for name, computed, published in CASES:
    ok = computed == published
    failures += 0 if ok else 1
    print('{}  {}\n    computed  {}\n    published {}'.format('ok  ' if ok else 'FAIL', name, computed, published))

print('\n{}/{} vectors agree with the published constants'.format(len(CASES) - failures, len(CASES)))
sys.exit(1 if failures else 0)
