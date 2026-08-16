import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const script = String.raw`
import datetime, hashlib, importlib.util, json, pathlib
p = pathlib.Path('infrastructure/pi-dashboard/pull-dashboard-candidate.py')
s = importlib.util.spec_from_file_location('pull', p)
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
sports = 'https://example.lambda-url.us-east-2.on.aws/'
html = ('<!doctype html>' + 'x' * 1000000 + '<main class="today-panel upcoming-panel athletics-panel right-rail" data-sports-url="' + sports + '"><footer class="sports-ticker"></footer></main>').encode()
def run(instant):
  manifest = {'schemaVersion':1,'artifactVersion':'dashboard-v2','generatedAt':instant,'artifact':{'key':'dashboard-v2/releases/x/index.html','versionId':'v1','size':len(html),'sha256':hashlib.sha256(html).hexdigest()},'runtime':{'browserOrigin':'http://127.0.0.1:4173','sportsFeedUrl':sports}}
  now = datetime.datetime.fromisoformat(instant.replace('Z','+00:00')) + datetime.timedelta(minutes=5)
  return m.validate(manifest, html, sports, now=now)
print(json.dumps([run('2026-08-16T16:10:00.000Z'), run('2027-01-16T17:10:00.000Z')], sort_keys=True))
`;

test('Pi staging validation is host-timezone independent across EDT and EST instants', () => {
  const outputs = ['UTC', 'America/New_York'].map(TZ => execFileSync('python', ['-c', script], { cwd: process.cwd(), env: { ...process.env, TZ }, encoding: 'utf8' }).trim());
  assert.equal(outputs[0], outputs[1]);
});

test('Phase 4B service activates only after the staging validator succeeds', async () => {
  const { readFile } = await import('node:fs/promises');
  const puller = await readFile('infrastructure/pi-dashboard/pull-dashboard-candidate.py', 'utf8');
  const service = await readFile('infrastructure/pi-dashboard/moore-dashboard-refresh.service', 'utf8');
  const timer = await readFile('infrastructure/pi-dashboard/moore-dashboard-refresh.timer', 'utf8');
  assert.match(puller, /candidate = stage\(/);
  assert.match(puller, /subprocess\.run\(\[str\(helper\), str\(candidate\)\], check=True\)/);
  assert.match(service, /--activate-helper \/home\/pi\/moore-dashboard\/bin\/activate-dashboard-release/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(timer, /OnCalendar=\*-\*-\* 20:20:00/);
  assert.match(timer, /Persistent=true/);
});
