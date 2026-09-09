import { readFile } from 'node:fs/promises';
const template = JSON.parse(await readFile(new URL('../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
const r = template.Resources || {}, bucket = r.ArtifactBucket?.Properties, fn = r.GeneratorFunction?.Properties, user = r.PiReader?.Properties;
const failures = [];
if (template.Transform !== 'AWS::Serverless-2016-10-31') failures.push('SAM transform missing');
if (!bucket?.VersioningConfiguration || bucket.VersioningConfiguration.Status !== 'Enabled') failures.push('bucket versioning missing');
if (Object.values(bucket?.PublicAccessBlockConfiguration || {}).some(v => v !== true)) failures.push('public access is not fully blocked');
if (!r.TlsOnlyBucketPolicy) failures.push('TLS-only bucket policy missing');
if ('ReservedConcurrentExecutions' in (fn || {})) failures.push('reserved concurrency must remain unset');
if (fn?.Environment?.Variables?.GOOGLE_AUTH_READ_ONLY !== '1') failures.push('generator Google auth must be read-only');
if (template.Parameters?.FirstDayLevel3Enabled?.Default !== '0' || fn?.Environment?.Variables?.FIRST_DAY_LEVEL3_ENABLED?.Ref !== 'FirstDayLevel3Enabled') failures.push('first-day takeover kill switch must exist and default off');
// The ambient Holiday Theme kill switch. Independent of the Family Spotlight
// switch, constrained to exactly 0 or 1 by the template itself, and defaulting
// off so a new or recreated stack comes up fail-closed regardless of what the
// repository variable says.
const holiday = template.Parameters?.HolidayThemesEnabled;
if (holiday?.Default !== '0' || fn?.Environment?.Variables?.HOLIDAY_THEMES_ENABLED?.Ref !== 'HolidayThemesEnabled') failures.push('holiday theme kill switch must exist and default off');
if (JSON.stringify(holiday?.AllowedValues) !== JSON.stringify(['0', '1'])) failures.push('holiday theme kill switch must accept only 0 or 1');
if (fn?.Environment?.Variables?.HOLIDAY_THEMES_ENABLED?.Ref === fn?.Environment?.Variables?.FAMILY_SPOTLIGHT_ENABLED?.Ref) failures.push('holiday theme and family spotlight switches must be independent parameters');
if (template.Parameters?.FirstDayLevel3Departure?.Default !== '07:30' || template.Parameters?.FirstDayLevel3Handoff?.Default !== '07:45') failures.push('first-day operational timing defaults are incorrect');
if (template.Parameters?.FirstDayLevel3Coda?.Default !== '16:00' || fn?.Environment?.Variables?.FIRST_DAY_LEVEL3_CODA?.Ref !== 'FirstDayLevel3Coda') failures.push('first-day welcome-home coda must default to 4:00 PM');
const readerStatement = user?.Policies?.[0]?.PolicyDocument?.Statement?.[0];
if (JSON.stringify(readerStatement?.Action) !== JSON.stringify(['s3:GetObject', 's3:GetObjectVersion'])) failures.push('Pi reader actions are broader than required');
if (JSON.stringify(readerStatement?.Action || []).match(/ListBucket|PutObject|DeleteObject|s3:\*/)) failures.push('Pi reader contains broad permissions');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; } else console.log('dashboard artifact refresh template: valid (local structural validation only)');
