/**
 * scripts/renderTest.js
 *
 * Renders weekly priorities HTML output for visual inspection.
 * Writes two files:
 *   scripts/out-email.html     — renderEmail() "all" tab
 *   scripts/out-dashboard.html — renderTodayCard() wrapped in full dashboard HTML
 *
 * Run: node scripts/renderTest.js
 * Do NOT run npm test against this file — it is not a test file.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderEmail } from '../render/email.js';
import { renderTodayCard } from '../render/dashboard.js';

// ---------------------------------------------------------------------------
// Mock digestData
// ---------------------------------------------------------------------------

const today = new Date(2026, 4, 26); // Tuesday May 26 2026

const digestData = {
  today,

  days: [
    {
      date: today,
      events: [],
      tasks: [
        { time: '7:30 AM', owner: 'wade',  text: 'Drop Myles + Ophelia at school' },
        { time: '4:00 PM', owner: 'alyssa', text: 'Pick up kids from bus (Stopfinder app)' },
      ],
      menuEvent: null,
    },
  ],

  flags: [],

  schoolStrip: {
    myles:   { center: 'Pottery', warningText: null },
    ophelia: { center: 'Art',     warningText: null },
    tomorrowWarnings: [],
  },

  upcomingEvents: [],

  athletics: {
    flagFootballActive: false,
    wavesActive:        false,
    swim757Active:      false,
    sharksActive:       false,
    seasonRecord:       '0-0',
    lastResult:         '',
    currentCaptains:    '',
    currentSnackFamily: '',
    standings:          [],
    hasGameThisWeek:    false,
    thisWeekOpponent:   null,
    thisWeekTime:       null,
    seasonComplete:     false,
    finalRecord:        null,
    mylesSeason:        'Off-Season',
    mylesPBRows:        [],
    mylesFooter:        '',
    opheliaSeason:      'Off-Season',
    opheliaPBRows:      [],
    opheliaFooter:      '',
    opheliaDanceNote:   '',
  },

  menuEvent:    null,
  tomorrowMenu: null,
  nationalsData: null,
  activityComms:   [],
  newsletterItems: [],
  banner: null,

  weeklyPriorities: {
    overdue: [
      { title: 'Schedule HVAC service', assignee: 'Wade',  daysOverdue: 3 },
      { title: 'Call pediatrician',     assignee: 'Robyn', daysOverdue: 1 },
    ],
    active: [
      { title: 'Book hotel for swim meet', assignee: 'Wade + Robyn', dueDay: 'Thursday' },
      { title: 'Pack swim bag',            assignee: 'Ophelia',      dueDay: null },
      { title: 'Review grades',            assignee: 'Myles',        dueDay: null },
    ],
    completed: [
      { title: 'Oil change',   assignee: 'Wade'  },
      { title: 'Grocery run',  assignee: 'Robyn' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Render email
// ---------------------------------------------------------------------------

const { subject, html: emailHtml } = renderEmail(digestData, 'all');

const emailOut = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${subject}</title>
<style>
  body { background: #f4f4f4; padding: 24px; font-family: Arial, sans-serif; }
</style>
</head>
<body>
<p style="font-size:12px;color:#888;margin-bottom:16px;"><strong>Subject:</strong> ${subject}</p>
${emailHtml}
</body>
</html>`;

const __dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(__dir, 'out-email.html'), emailOut, 'utf8');

// ---------------------------------------------------------------------------
// Render dashboard today card
// ---------------------------------------------------------------------------

const todayCardHtml = renderTodayCard(digestData);

const dashboardOut = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dashboard — Today Card (render test)</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#08142e;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}
.card{background:rgba(5,15,45,0.82);border-radius:14px;padding:18px 24px;border:1px solid rgba(100,150,255,0.12);max-width:640px}
.lbl{font-size:15px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:12px}
.section-hdr{font-size:15px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.28);margin:13px 0 8px}
.task-item{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.badge{display:inline-block;font-size:14px;font-weight:700;padding:4px 13px;border-radius:20px;white-space:nowrap;flex-shrink:0;margin-top:2px}
.bw{background:#1A56A0;color:#fff}.br{background:#A0366E;color:#fff}.bc{background:#BA7517;color:#fff}.ba{background:#2D6A3F;color:#fff}
.task-text{font-size:23px;color:rgba(255,255,255,.85);line-height:1.3}
.task-time{font-size:15px;color:rgba(255,255,255,.3);margin-top:2px}
.task-div{height:1px;background:rgba(255,255,255,.08);margin:6px 0}
.school-strip{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.school-strip-text{font-size:21px;color:rgba(255,255,255,.68)}
.school-warn{color:#EF9F27;font-weight:700}
.dinner-strip{margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)}
.dinner-label{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:6px}
.dinner-name{font-size:38px;font-weight:500;color:#fff;margin-bottom:4px}
.dinner-sides{font-size:20px;color:rgba(255,255,255,.38)}
.dinner-tmr{font-size:17px;color:rgba(255,255,255,.28);margin-top:6px}
.event-item{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.event-time{font-size:20px;color:rgba(255,255,255,.38);width:74px;flex-shrink:0;padding-top:3px}
.event-title{font-size:34px;font-weight:600;color:#fff;margin-bottom:5px}
.event-sub{font-size:19px;color:rgba(255,255,255,.42)}
</style>
</head>
<body>
${todayCardHtml}
</body>
</html>`;

writeFileSync(join(__dir, 'out-dashboard.html'), dashboardOut, 'utf8');

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log('Done — check scripts/out-email.html and scripts/out-dashboard.html');
