import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { maxScheduleGapMinutes } from '../../dashboard-artifact/mobile-contract.js';
import { publishAll } from '../../dashboard-artifact/generator.js';
import { renderDashboardMobile } from '../../render/dashboard-mobile.js';
import { mobilePreviewStates } from '../../render/dashboard-mobile.sample-data.js';

const template = JSON.parse(await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8'));
const templateText = await readFile(new URL('../../infrastructure/dashboard-artifact-refresh/template.json', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/deploy-dashboard-v2-artifact.yml', import.meta.url), 'utf8');
const R = template.Resources;
const TOPIC = { Ref: 'GeneratorAlertTopic' };

const NOW = new Date('2026-09-09T20:10:00.000Z');
const SPORTS = 'https://example.lambda-url.us-east-2.on.aws/';
const DISPLAY_HTML = '<!doctype html>' + 'x'.repeat(1_000_000)
  + '<main class="today-panel upcoming-panel athletics-panel right-rail" data-sports-url="' + SPORTS
  + '"><section class="now-next now-next-calm"></section><section class="centers-block"></section><footer class="sports-ticker"></footer></main>';

function scheduleFromTemplate() {
  return Object.values(R.GeneratorFunction.Properties.Events).flatMap(event => {
    const [minute, hour] = /^cron\(([^ ]+) ([^ ]+) /.exec(event.Properties.ScheduleExpression).slice(1);
    return hour.split(',').map(value => `${String(Number(value)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`);
  }).sort();
}

function filterTerm(logicalId) {
  const pattern = R[logicalId].Properties.FilterPattern;
  const match = /^"([^"]+)"$/.exec(pattern);
  assert.ok(match, `${logicalId} must be a single quoted term`);
  return match[1];
}

function metricOf(logicalId) {
  const [transformation] = R[logicalId].Properties.MetricTransformations;
  return { Namespace: transformation.MetricNamespace, MetricName: transformation.MetricName };
}

async function capturedRun({ displayRender = () => DISPLAY_HTML, mobileRender = renderDashboardMobile } = {}) {
  const lines = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  const put = async () => ({ VersionId: 'v' });
  try {
    await publishAll({
      fetchData: async () => mobilePreviewStates().everyday,
      display: { now: NOW, bucket: 'private', sportsFeedUrl: SPORTS, sourceRevision: 'test', render: displayRender, putObject: put },
      mobile: { now: NOW, bucket: 'private', enabled: true, sourceRevision: 'test', render: mobileRender, putObject: put },
    }).catch(() => {});
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  const eventOf = line => { try { return JSON.parse(line).event; } catch { return undefined; } };
  const count = logicalId => {
    const term = filterTerm(logicalId);
    const matched = lines.filter(line => line.includes(term));
    assert.deepEqual(matched, lines.filter(line => eventOf(line) === term));
    return matched.length;
  };
  return { display: count('DisplayPublishedMetricFilter'), mobileFailed: count('MobileFailedMetricFilter') };
}

test('alerts go to one email subscription whose address is a stack parameter, not committed text', () => {
  assert.deepEqual(template.Parameters.AlertEmail, { Type: 'String', Default: '', NoEcho: true });
  assert.deepEqual(template.Conditions.HasAlertEmail, { 'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'AlertEmail' }, ''] }] });
  assert.equal(R.GeneratorAlertTopic.Type, 'AWS::SNS::Topic');
  const subscriptions = Object.values(R).filter(resource => resource.Type === 'AWS::SNS::Subscription');
  assert.deepEqual(subscriptions, [{
    Type: 'AWS::SNS::Subscription',
    Condition: 'HasAlertEmail',
    Properties: { TopicArn: TOPIC, Protocol: 'email', Endpoint: { Ref: 'AlertEmail' } },
  }]);
  assert.doesNotMatch(templateText, /@/);
  assert.doesNotMatch(workflow, /AlertEmail/);
});

test('alerting does not run through the generator role or invocation config', () => {
  const statements = R.GeneratorFunction.Properties.Policies.flatMap(policy => policy.Statement);
  assert.ok(statements.every(statement => ![].concat(statement.Action).some(action => /^sns:/i.test(action))));
  assert.ok(!('EventInvokeConfig' in R.GeneratorFunction.Properties));
  assert.ok(!('DeadLetterQueue' in R.GeneratorFunction.Properties));
  const alarms = Object.values(R).filter(resource => resource.Type === 'AWS::CloudWatch::Alarm');
  assert.equal(alarms.length, 3);
  for (const alarm of alarms) {
    for (const key of ['AlarmActions', 'OKActions', 'InsufficientDataActions']) {
      for (const action of alarm.Properties[key] || []) assert.deepEqual(action, TOPIC);
    }
    assert.deepEqual(alarm.Properties.AlarmActions, [TOPIC]);
  }
});

test('the failure alarm fires only when every scheduled attempt of one run errored', () => {
  const alarm = R.GeneratorFailedAlarm.Properties;
  assert.equal(alarm.Namespace, 'AWS/Lambda');
  assert.equal(alarm.MetricName, 'Errors');
  assert.deepEqual(alarm.Dimensions, [{ Name: 'FunctionName', Value: { Ref: 'GeneratorFunction' } }]);
  assert.equal(alarm.Statistic, 'Sum');
  assert.equal(alarm.Period, 3600);
  assert.equal(alarm.EvaluationPeriods, 1);
  assert.equal(alarm.ComparisonOperator, 'GreaterThanOrEqualToThreshold');
  assert.equal(alarm.TreatMissingData, 'notBreaching');
  for (const event of Object.values(R.GeneratorFunction.Properties.Events)) {
    assert.equal(alarm.Threshold, 1 + event.Properties.RetryPolicy.MaximumRetryAttempts);
  }
});

test('the staleness window is derived from the deployed schedule and missing data breaches', () => {
  const alarm = R.GeneratorStaleAlarm.Properties;
  const schedule = scheduleFromTemplate();
  assert.equal(alarm.Period, 3600);
  assert.equal(alarm.EvaluationPeriods, Math.ceil(maxScheduleGapMinutes(schedule) / 60));
  assert.equal(alarm.DatapointsToAlarm, alarm.EvaluationPeriods);
  const hours = schedule.map(time => Number(time.slice(0, 2)));
  const longestRunFreeHours = Math.max(...hours.map((hour, i) => ((hours[(i + 1) % hours.length] - hour + 24) % 24 || 24) - 1));
  assert.ok(longestRunFreeHours + 1 < alarm.EvaluationPeriods);
  assert.equal(alarm.TreatMissingData, 'breaching');
  assert.equal(alarm.ComparisonOperator, 'LessThanThreshold');
  assert.equal(alarm.Threshold, 1);
  assert.equal(alarm.Statistic, 'Sum');
  assert.deepEqual({ Namespace: alarm.Namespace, MetricName: alarm.MetricName }, metricOf('DisplayPublishedMetricFilter'));
  assert.deepEqual(alarm.OKActions, [TOPIC]);
});

test('metric filters read the generator log group and emit nothing when nothing matches', () => {
  for (const id of ['DisplayPublishedMetricFilter', 'MobileFailedMetricFilter']) {
    const properties = R[id].Properties;
    assert.deepEqual(properties.LogGroupName, { Ref: 'GeneratorLogGroup' });
    assert.equal(properties.MetricTransformations.length, 1);
    assert.equal(properties.MetricTransformations[0].MetricValue, '1');
    assert.ok(!('DefaultValue' in properties.MetricTransformations[0]));
  }
});

test('the mobile alarm requires a published wall and a mobile failure in the same period', () => {
  const alarm = R.MobileFailedAlarm.Properties;
  const byId = Object.fromEntries(alarm.Metrics.map(metric => [metric.Id, metric]));
  assert.deepEqual(byId.display.MetricStat.Metric, metricOf('DisplayPublishedMetricFilter'));
  assert.deepEqual(byId.mobile.MetricStat.Metric, metricOf('MobileFailedMetricFilter'));
  for (const id of ['display', 'mobile']) {
    assert.equal(byId[id].MetricStat.Period, 3600);
    assert.equal(byId[id].MetricStat.Stat, 'Sum');
    assert.equal(byId[id].ReturnData, false);
  }
  assert.deepEqual(alarm.Metrics.filter(metric => metric.ReturnData !== false).map(metric => metric.Id), ['wallPublishedMobileFailed']);
  assert.equal(byId.wallPublishedMobileFailed.Expression, 'IF(FILL(display, 0) > 0 AND FILL(mobile, 0) > 0, 1, 0)');
  assert.equal(alarm.Threshold, 1);
  assert.equal(alarm.ComparisonOperator, 'GreaterThanOrEqualToThreshold');
  assert.equal(alarm.TreatMissingData, 'notBreaching');
});

test('the filter terms match the records a real run writes, and only in the runs they name', async () => {
  const healthy = await capturedRun();
  assert.deepEqual(healthy, { display: 1, mobileFailed: 0 });

  const mobileBroken = await capturedRun({ mobileRender: () => { throw new Error('mobile render broke'); } });
  assert.deepEqual(mobileBroken, { display: 1, mobileFailed: 1 });

  const displayBroken = await capturedRun({ displayRender: () => { throw new Error('display render broke'); } });
  assert.deepEqual(displayBroken, { display: 0, mobileFailed: 0 });
});
