import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventDisplayTitle, presentationOwner } from './eventPresentation.js';

const event = (title, calendar, description = '') => ({ title, _calName: calendar, raw: { description } });

describe('event presentation ownership', () => {
  it('uses person-specific source calendars', () => {
    assert.equal(eventDisplayTitle(event('On-Call', 'Wade On-Call')), 'Wade — On-Call');
    assert.equal(eventDisplayTitle(event('Spa U', 'Robyn')), 'Robyn — Spa U');
    assert.equal(eventDisplayTitle(event('Ortho', 'Myles')), 'Myles — Ortho');
    assert.equal(eventDisplayTitle(event('Dance', 'Ophelia')), 'Ophelia — Dance');
  });

  it('does not guess ownership for shared calendars', () => {
    assert.equal(eventDisplayTitle(event('Doctor', 'Family')), 'Doctor');
    assert.equal(presentationOwner(event('Doctor', 'Family')), '');
  });

  it('supports narrow reviewed mappings for recurring shared-calendar shorthand', () => {
    assert.equal(eventDisplayTitle(event('Spa U', 'Family')), 'Robyn — Spa U');
  });

  it('uses an explicit override before the source calendar', () => {
    assert.equal(eventDisplayTitle(event('Doctor', 'Wade Personal', 'For: Robyn')), 'Robyn — Doctor');
  });

  it('does not duplicate a person already named in the title', () => {
    assert.equal(eventDisplayTitle(event('Myles — Ortho', 'Myles')), 'Myles — Ortho');
    assert.equal(eventDisplayTitle(event('Robyn Doctor', 'Robyn')), 'Robyn Doctor');
  });
});
