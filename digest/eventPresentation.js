import { normalizeDashboardText } from './displayNormalization.js';

const CALENDAR_OWNERS = Object.freeze({
  'Wade Personal': 'Wade',
  'Wade On-Call': 'Wade',
  Robyn: 'Robyn',
  Myles: 'Myles',
  Ophelia: 'Ophelia',
});

const PEOPLE = ['Wade', 'Robyn', 'Myles', 'Ophelia'];
const KNOWN_EVENT_OWNERS = Object.freeze({
  'spa u': 'Robyn',
});

function explicitOwner(event) {
  const description = String(event?.raw?.description || event?.description || '');
  const match = description.match(/(?:^|\n)\s*(?:for|owner)\s*:\s*(Wade|Robyn|Myles|Ophelia)\s*(?:$|\n)/i);
  if (!match) return '';
  return PEOPLE.find(person => person.toLowerCase() === match[1].toLowerCase()) || '';
}

function calendarOwner(event) {
  return CALENDAR_OWNERS[event?._calName || event?.calendarName || ''] || '';
}

function namedPeople(value) {
  const text = String(value || '');
  return PEOPLE.filter(person => new RegExp(`\\b${person}\\b`, 'i').test(text));
}

function presentationOwner(event) {
  const title = String(event?.title || event?.summary || '').trim();
  return explicitOwner(event)
    || calendarOwner(event)
    || namedPeople(title)[0]
    || KNOWN_EVENT_OWNERS[title.toLowerCase()]
    || '';
}

function eventDisplayTitle(event) {
  const title = normalizeDashboardText(event?.title || event?.summary || 'Scheduled item');
  const owner = presentationOwner(event);
  if (!owner || namedPeople(title).length) return title;
  return `${owner} — ${title}`;
}

export { CALENDAR_OWNERS, KNOWN_EVENT_OWNERS, calendarOwner, eventDisplayTitle, explicitOwner, namedPeople, presentationOwner };
