import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

test('Pi release contract validates and activates both sibling dashboard files', async () => {
  const puller = await readFile('infrastructure/pi-dashboard/pull-dashboard-candidate.py', 'utf8');
  const activate = await readFile('infrastructure/pi-dashboard/activate-dashboard-release', 'utf8');
  assert.match(puller, /temp_dir \/ 'index\.html'/);
  assert.match(puller, /temp_dir \/ 'now-next\.html'/);
  assert.match(puller, /current' \/ 'now-next\.html'/);
  assert.match(puller, /dashboard_now_next_carried_forward/);
  assert.match(activate, /test -f "\$candidate\/index\.html"/);
  assert.match(activate, /test -f "\$candidate\/now-next\.html"/);
  assert.ok(activate.indexOf('now-next.html') < activate.indexOf('mv -Tf "$root/.current-next" "$root/current"'));
});

test('Pi NOW/NEXT validation requires same-origin sports and release reload markers', () => {
  const script = [
    "import importlib.util, pathlib",
    "p=pathlib.Path('infrastructure/pi-dashboard/pull-dashboard-candidate.py')",
    "s=importlib.util.spec_from_file_location('pull',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)",
    "sports='https://sports.example/'",
    "base='<!doctype html>'+('x'*1000000)+'<main class=\"today-panel upcoming-panel athletics-panel right-rail\" data-sports-url=\"'+sports+'\" data-release-manifest-url=\"/release-manifest.json\"><div class=\"now-next now-next-normal\"></div><footer class=\"sports-ticker\"></footer></main>'",
    "e=m.validate_html(base.encode(),sports,m.NOW_NEXT_REQUIRED)",
    "print(e['size'] > 1000000)",
  ].join(';');
  assert.equal(execFileSync('python', ['-c', script], { cwd: process.cwd(), encoding: 'utf8' }).trim(), 'True');
});

test('Pi stages a valid index with the last valid NOW/NEXT sibling when generation falls back', () => {
  const script = [
    "import datetime, hashlib, importlib.util, json, pathlib, tempfile",
    "p=pathlib.Path('infrastructure/pi-dashboard/pull-dashboard-candidate.py')",
    "s=importlib.util.spec_from_file_location('pull',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)",
    "sports='https://sports.example/'",
    "index=('<!doctype html>'+('x'*1000000)+'<main class=\"today-panel upcoming-panel athletics-panel right-rail\" data-sports-url=\"'+sports+'\"><footer class=\"sports-ticker\"></footer></main>').encode()",
    "sibling=('<!doctype html>'+('x'*1000000)+'<main class=\"today-panel upcoming-panel athletics-panel right-rail\" data-sports-url=\"'+sports+'\" data-release-manifest-url=\"/release-manifest.json\"><div class=\"now-next now-next-normal\"></div><footer class=\"sports-ticker\"></footer></main>').encode()",
    "generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')",
    "manifest={'schemaVersion':1,'artifactVersion':'dashboard-v2','generatedAt':generated,'artifact':{'key':'index','versionId':'v1','size':len(index),'sha256':hashlib.sha256(index).hexdigest()},'nowNextStatus':'carry-forward','runtime':{'browserOrigin':'http://127.0.0.1:4173','sportsFeedUrl':sports}}",
    "base=pathlib.Path(tempfile.mkdtemp()); root=base/'staging'; (base/'current').mkdir(); (base/'current'/'now-next.html').write_bytes(sibling)",
    "config=base/'config.json'; config.write_text(json.dumps({'bucket':'b','region':'r','manifestKey':'manifest','sportsFeedUrl':sports}))",
    "credentials=base/'credentials.json'; credentials.write_text('{}')",
    "m.signed_get=lambda bucket,region,key,credentials,version_id=None: json.dumps(manifest).encode() if key=='manifest' else index",
    "release=m.stage(str(config),str(credentials),str(root))",
    "print((release/'index.html').read_bytes()==index and (release/'now-next.html').read_bytes()==sibling and json.loads((release/'ELIGIBLE').read_text())['nowNextSource']=='carry-forward')",
  ].join(';');
  assert.equal(execFileSync('python', ['-c', script], { cwd: process.cwd(), encoding: 'utf8' }).trim().split('\n').at(-1), 'True');
});
