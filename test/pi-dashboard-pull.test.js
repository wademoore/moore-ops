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

test('Pi validator recognizes first-day candidates only with a Level-2 fallback', () => {
  const firstDayScript = String.raw`
import datetime, hashlib, importlib.util, pathlib
p = pathlib.Path('infrastructure/pi-dashboard/pull-dashboard-candidate.py')
s = importlib.util.spec_from_file_location('pull', p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
sports = 'https://example.lambda-url.us-east-2.on.aws/'
html = ('<!doctype html>' + 'x' * 1000000 + '<main class="first-day-dashboard" data-dashboard-mode="first-day-level3" data-first-day-coda="true"><div data-fd-slot="now">Welcome home, Myles + Ophelia</div><div data-fd-slot="next"></div><script>updateFirstDayLevel3</script></main>').encode()
artifact = {'key':'dashboard-v2/releases/x/index.html','versionId':'v1','size':len(html),'sha256':hashlib.sha256(html).hexdigest()}
fallback = {'key':'dashboard-v2/releases/x/level2.html','versionId':'v2','size':1000000,'sha256':'x'}
manifest = {'schemaVersion':1,'artifactVersion':'dashboard-v2','generatedAt':'2026-08-24T11:00:00.000Z','artifact':artifact,'level2Artifact':fallback,'runtime':{'browserOrigin':'http://127.0.0.1:4173','sportsFeedUrl':sports}}
m.validate(manifest, html, sports, now=datetime.datetime.fromisoformat('2026-08-24T11:05:00+00:00'))
print('ok')
`;
  assert.equal(execFileSync('python', ['-c', firstDayScript], { cwd: process.cwd(), encoding: 'utf8' }).trim(), 'ok');
});

test('Pi stages and validates both version-pinned directions for afternoon re-entry', () => {
  const stageScript = String.raw`
import datetime, hashlib, importlib.util, json, pathlib, tempfile
p=pathlib.Path('infrastructure/pi-dashboard/pull-dashboard-candidate.py');s=importlib.util.spec_from_file_location('pull',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
sports='https://example.lambda-url.us-east-2.on.aws/'
first=('<!doctype html>'+'x'*1000000+'<main class="first-day-dashboard" data-dashboard-mode="first-day-level3" data-first-day-coda="true"><div data-fd-slot="now">Welcome home, Myles + Ophelia</div><div data-fd-slot="next"></div><script>updateFirstDayLevel3</script></main>').encode()
level2=('<!doctype html>'+'x'*1000000+'<main class="today-panel upcoming-panel athletics-panel right-rail" data-sports-url="'+sports+'" data-first-day-coda-url="index.html" data-first-day-coda-start="2026-08-24T16:00:00-04:00" data-first-day-coda-end="2026-08-24T19:00:00-04:00"><footer class="sports-ticker"></footer><script>updateFirstDayLevel2Transition</script></main>').encode()
art=lambda key,version,body:{'key':key,'versionId':version,'size':len(body),'sha256':hashlib.sha256(body).hexdigest()}
generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
manifest={'schemaVersion':1,'artifactVersion':'dashboard-v2','generatedAt':generated,'artifact':art('dashboard-v2/releases/x/index.html','v1',first),'level2Artifact':art('dashboard-v2/releases/x/level2.html','v2',level2),'runtime':{'browserOrigin':'http://127.0.0.1:4173','sportsFeedUrl':sports}}
with tempfile.TemporaryDirectory() as root:
  root=pathlib.Path(root);config=root/'config.json';credentials=root/'credentials.json';staging=root/'staging'
  config.write_text(json.dumps({'bucket':'test','region':'us-east-2','manifestKey':'dashboard-v2/current/manifest.json','sportsFeedUrl':sports}));credentials.write_text(json.dumps({'accessKeyId':'x','secretAccessKey':'y'}))
  blobs={'dashboard-v2/current/manifest.json':json.dumps(manifest).encode(),manifest['artifact']['key']:first,manifest['level2Artifact']['key']:level2}
  m.signed_get=lambda bucket,region,key,credentials,version_id=None:blobs[key]
  candidate=m.stage(config,credentials,staging)
  assert (candidate/'index.html').read_bytes()==first and (candidate/'level2.html').read_bytes()==level2
print('ok')
`;
  assert.match(execFileSync('python', ['-c', stageScript], { cwd: process.cwd(), encoding: 'utf8' }), /ok/);
});
