#!/usr/bin/env python3
"""Download and validate a Dashboard v2 candidate without activating it."""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

MIN_BYTES = 1_000_000
MAX_BYTES = 8_000_000
LEVEL2_REQUIRED = ('today-panel', 'upcoming-panel', 'athletics-panel', 'right-rail', 'sports-ticker', 'now-next ', 'centers-block')
FIRST_DAY_REQUIRED = ('first-day-dashboard', 'data-dashboard-mode="first-day-level3"', 'data-first-day-coda="true"', 'data-fd-slot="now"', 'data-fd-slot="next"', 'updateFirstDayLevel3', 'Welcome home, Myles + Ophelia')
FORBIDDEN = (
    re.compile(r'client_secret', re.I), re.compile(r'refresh_token', re.I),
    re.compile(r'access[_-]?key', re.I), re.compile(r'drive\.google\.com', re.I),
    re.compile(r'dakboard\.com', re.I), re.compile(r'calendar\.google\.com', re.I),
    re.compile(r'rawProvider', re.I), re.compile(r'internalFields', re.I),
)

def log(event, **fields):
    print(json.dumps(dict(event=event, **fields), sort_keys=True), flush=True)

def _sign(key, message):
    return hmac.new(key, message.encode('utf-8'), hashlib.sha256).digest()

def signed_get(bucket, region, key, credentials, version_id=None, attempts=3):
    host = '{}.s3.{}.amazonaws.com'.format(bucket, region)
    path = '/' + urllib.parse.quote(key, safe='/~-._')
    query = '' if not version_id else urllib.parse.urlencode({'versionId': version_id})
    for attempt in range(1, attempts + 1):
        now = dt.datetime.utcnow()
        amzdate, datestamp = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
        headers = 'host:{}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:{}\n'.format(host, amzdate)
        canonical = 'GET\n{}\n{}\n{}\nhost;x-amz-content-sha256;x-amz-date\nUNSIGNED-PAYLOAD'.format(path, query, headers)
        scope = '{}/{}/s3/aws4_request'.format(datestamp, region)
        string_to_sign = 'AWS4-HMAC-SHA256\n{}\n{}\n{}'.format(amzdate, scope, hashlib.sha256(canonical.encode()).hexdigest())
        date_key = _sign(('AWS4' + credentials['secretAccessKey']).encode(), datestamp)
        region_key = _sign(date_key, region)
        service_key = _sign(region_key, 's3')
        signing_key = _sign(service_key, 'aws4_request')
        signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
        auth = 'AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={}'.format(credentials['accessKeyId'], scope, signature)
        request = urllib.request.Request('https://{}{}{}'.format(host, path, '?' + query if query else ''), headers={
            'Authorization': auth, 'x-amz-date': amzdate, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
        })
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == attempts:
                raise
            log('dashboard_candidate_download_retry', attempt=attempt, error=str(error))
            time.sleep(2 ** (attempt - 1))

def parse_time(value):
    return dt.datetime.strptime(value.replace('Z', '+0000'), '%Y-%m-%dT%H:%M:%S.%f%z')

def validate(manifest, html_bytes, sports_url, now=None, max_age_hours=8):
    errors = []
    now = now or dt.datetime.now(dt.timezone.utc)
    if manifest.get('schemaVersion') != 1 or manifest.get('artifactVersion') != 'dashboard-v2': errors.append('unsupported manifest schema or artifact version')
    try:
        generated = parse_time(manifest['generatedAt'])
        age = (now - generated).total_seconds()
        if age < -300 or age > max_age_hours * 3600: errors.append('artifact freshness is outside the allowed window')
    except (KeyError, ValueError): errors.append('invalid generatedAt')
    artifact = manifest.get('artifact', {})
    size = len(html_bytes)
    if size < MIN_BYTES or size > MAX_BYTES or artifact.get('size') != size: errors.append('artifact size is invalid')
    checksum = hashlib.sha256(html_bytes).hexdigest()
    if artifact.get('sha256') != checksum: errors.append('SHA-256 checksum mismatch')
    if not artifact.get('key') or not artifact.get('versionId'): errors.append('version-pinned artifact reference missing')
    text = html_bytes.decode('utf-8', errors='strict')
    first_day = 'data-dashboard-mode="first-day-level3"' in text
    for marker in FIRST_DAY_REQUIRED if first_day else LEVEL2_REQUIRED:
        if marker not in text: errors.append('required panel marker missing: ' + marker)
    if not first_day and 'data-sports-url="{}"'.format(sports_url) not in text: errors.append('exact sports endpoint missing')
    if first_day and any(marker in text for marker in ('athletics-panel', 'sports-ticker', 'Weekly priorities')): errors.append('suppressed Level-2 content is present in first-day artifact')
    if first_day and not manifest.get('level2Artifact'): errors.append('first-day artifact is missing its Level-2 fallback')
    runtime = manifest.get('runtime', {})
    if runtime.get('browserOrigin') != 'http://127.0.0.1:4173' or runtime.get('sportsFeedUrl') != sports_url: errors.append('runtime configuration mismatch')
    for pattern in FORBIDDEN:
        if pattern.search(text): errors.append('forbidden content matched: ' + pattern.pattern)
    if errors: raise ValueError('; '.join(errors))
    return dict(generatedAt=manifest['generatedAt'], size=size, sha256=checksum)

def stage(config_path, credentials_path, root):
    if os.name == 'posix' and stat.S_IMODE(os.stat(credentials_path).st_mode) & 0o077:
        raise ValueError('credentials file must be mode 0600 or stricter')
    config = json.loads(pathlib.Path(config_path).read_text())
    credentials = json.loads(pathlib.Path(credentials_path).read_text())
    manifest_bytes = signed_get(config['bucket'], config['region'], config['manifestKey'], credentials)
    manifest = json.loads(manifest_bytes.decode('utf-8'))
    artifact = manifest.get('artifact', {})
    html = signed_get(config['bucket'], config['region'], artifact.get('key', ''), credentials, artifact.get('versionId'))
    evidence = validate(manifest, html, config['sportsFeedUrl'], max_age_hours=config.get('maxAgeHours', 8))
    level2_html = None
    if manifest.get('level2Artifact'):
        level2_artifact = manifest['level2Artifact']
        level2_html = signed_get(config['bucket'], config['region'], level2_artifact.get('key', ''), credentials, level2_artifact.get('versionId'))
        level2_manifest = dict(manifest, artifact=level2_artifact)
        level2_manifest.pop('level2Artifact', None)
        validate(level2_manifest, level2_html, config['sportsFeedUrl'], max_age_hours=config.get('maxAgeHours', 8))
        level2_text = level2_html.decode('utf-8', errors='strict')
        if not all(marker in level2_text for marker in ('data-first-day-coda-url="index.html"', 'data-first-day-coda-start=', 'data-first-day-coda-end=', 'updateFirstDayLevel2Transition')):
            raise ValueError('Level-2 fallback is missing deterministic first-day coda re-entry')
    release_name = manifest['generatedAt'].replace(':', '').replace('.', '-')
    staging_root = pathlib.Path(root)
    staging_root.mkdir(parents=True, exist_ok=True)
    temp_dir = pathlib.Path(tempfile.mkdtemp(prefix='.candidate-', dir=str(staging_root)))
    try:
        (temp_dir / 'index.html').write_bytes(html)
        if level2_html is not None: (temp_dir / 'level2.html').write_bytes(level2_html)
        (temp_dir / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (temp_dir / 'ELIGIBLE').write_text(json.dumps(evidence, sort_keys=True) + '\n')
        final = staging_root / release_name
        if final.exists(): shutil.rmtree(str(temp_dir))
        else: os.replace(str(temp_dir), str(final))
        log('dashboard_candidate_staged', path=str(final), **evidence)
        return final
    except Exception:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--staging-root', required=True)
    parser.add_argument('--activate-helper')
    args = parser.parse_args()
    try:
        candidate = stage(args.config, args.credentials, args.staging_root)
        if args.activate_helper:
            helper = pathlib.Path(args.activate_helper)
            if not helper.is_absolute() or not helper.is_file():
                raise ValueError('activation helper must be an existing absolute path')
            subprocess.run([str(helper), str(candidate)], check=True)
            log('dashboard_candidate_activated', path=str(candidate))
    except Exception as error:
        log('dashboard_candidate_failed', error=str(error))
        return 1
    return 0

if __name__ == '__main__': sys.exit(main())
