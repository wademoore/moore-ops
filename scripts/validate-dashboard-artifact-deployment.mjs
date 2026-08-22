import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve('.');
const workflowPath = '.github/workflows/deploy-dashboard-v2-artifact.yml';
const workflow = await readFile(resolve(workflowPath), 'utf8');
const deployRolePolicy = JSON.parse(await readFile(resolve('infrastructure/dashboard-artifact-refresh/github-deploy-role-policy.json'), 'utf8'));
const inputs = JSON.parse(await readFile(new URL('../dashboard-artifact/package-inputs.json', import.meta.url), 'utf8'));
const pathsBlock = /\n\s{4}paths:\s*\n((?:\s{6}-[^\n]+\n)+)/.exec(workflow)?.[1] || '';
const triggers = [...pathsBlock.matchAll(/-\s+['"]?([^'"\r\n]+)['"]?/g)].map(match => match[1].trim());
const failures = [];

function covered(path) {
  return triggers.some(pattern => {
    if (pattern === path) return true;
    if (pattern === '*.js') return !path.includes('/') && path.endsWith('.js');
    if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -3));
    return false;
  });
}

const bundle = await build({
  entryPoints: ['dashboard-artifact/generator.js'], bundle: true, metafile: true,
  platform: 'node', target: 'node22', write: false, logLevel: 'silent',
});
const localBundleInputs = Object.keys(bundle.metafile.inputs)
  .map(path => relative(root, resolve(path)).replaceAll('\\', '/'))
  .filter(path => !path.startsWith('node_modules/'));
const allBundleInputs = Object.keys(bundle.metafile.inputs).map(path => path.replaceAll('\\', '/'));

for (const path of localBundleInputs) if (!covered(path)) failures.push(`bundle input is not covered by deployment paths: ${path}`);
for (const path of inputs.requiredBundleInputs) if (!localBundleInputs.includes(path)) failures.push(`required generator input is absent from bundle graph: ${path}`);
for (const dependency of ['@googleapis/calendar', 'google-auth-library']) {
  if (!allBundleInputs.some(path => path.includes(`/node_modules/${dependency}/`) || path.startsWith(`node_modules/${dependency}/`))) failures.push(`required runtime dependency is absent from bundle graph: ${dependency}`);
}
for (const directory of inputs.assetDirectories) if (!covered(directory + '/placeholder')) failures.push(`asset directory is not covered by deployment paths: ${directory}`);
for (const path of inputs.requiredAssetFiles || []) if (!inputs.assetDirectories.some(directory => `render/${path}`.startsWith(`${directory}/`))) failures.push(`required asset is outside packaged directories: ${path}`);
for (const name of inputs.dataFiles) if (!covered(`data/${name}`)) failures.push(`data file is not covered by deployment paths: data/${name}`);
for (const path of [workflowPath, 'package.json', 'package-lock.json', 'infrastructure/dashboard-artifact-refresh/template.json', 'scripts/prepare-dashboard-artifact-package.mjs', 'scripts/validate-dashboard-artifact-deployment.mjs', 'scripts/validate-dashboard-artifact-package.mjs']) {
  if (!covered(path)) failures.push(`deployment control is not self-covered: ${path}`);
}
if (!workflow.includes('"SourceRevision=$GITHUB_SHA"')) failures.push('deployment does not pin SourceRevision to the integrated commit');
if (!/--capabilities\s+CAPABILITY_NAMED_IAM(?:\s|\\)/.test(workflow)) failures.push('deployment must acknowledge CAPABILITY_NAMED_IAM for the existing named IAM resources');
if (/--capabilities\s+CAPABILITY_IAM(?:\s|\\)/.test(workflow)) failures.push('deployment must not use insufficient CAPABILITY_IAM acknowledgement');
if (/FamilyContextFileId|DRIVE_FAMILY_CONTEXT_FILE_ID/.test(workflow)) failures.push('deployment workflow must not read or restate the private calendar-related parameter');
const actions = statement => Array.isArray(statement.Action) ? statement.Action : [statement.Action];
const statementAllows = (action, resource) => deployRolePolicy.Statement?.some(statement => statement.Effect === 'Allow' && actions(statement).includes(action) && statement.Resource === resource);
const stackArn = 'arn:aws:cloudformation:us-east-2:785157630803:stack/moore-ops-dashboard-v2-artifact-refresh/*';
const changeSetArn = 'arn:aws:cloudformation:us-east-2:785157630803:changeSet/samcli-deploy*/*';
const transformArn = 'arn:aws:cloudformation:us-east-2:aws:transform/Serverless-2016-10-31';
for (const action of ['cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet']) if (!statementAllows(action, stackArn)) failures.push(`GitHub deployment role policy is missing ${action} on the dashboard stack`);
for (const action of ['cloudformation:CreateChangeSet', 'cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet']) if (!statementAllows(action, changeSetArn)) failures.push(`GitHub deployment role policy is missing ${action} on SAM deployment change sets`);
if (!statementAllows('cloudformation:CreateChangeSet', transformArn)) failures.push('GitHub deployment role policy is missing SAM transform access');
for (const action of ['s3:PutObject', 's3:GetObject']) if (!statementAllows(action, 'arn:aws:s3:::moore-ops-lambda/*')) failures.push(`GitHub deployment role policy is missing ${action} on the package bucket`);

const output = bundle.outputFiles.map(file => file.text).join('\n');
for (const marker of ['Emma Unavailable', 'emma_unavailability_calendar_read_succeeded']) {
  if (!output.includes(marker)) failures.push(`generator bundle is missing required marker: ${marker}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`dashboard artifact deployment coverage: valid (${localBundleInputs.length} local bundle inputs, ${triggers.length} trigger paths)`);
}
