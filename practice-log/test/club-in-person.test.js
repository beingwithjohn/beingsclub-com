import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInPersonEvent, publishHostInPersonEvent } from '../src/club/in-person.js';

const complete = {
  title: 'A gathering in London',
  description: 'A day to practise curiosity together.',
  startsAt: '2026-10-18T10:00:00.000Z',
  endsAt: '2026-10-18T16:00:00.000Z',
  location: 'London · exact place after booking',
  bookingUrl: 'https://lu.ma/beingsclub',
};

test('in-person event input requires complete ordered times and an https booking link', () => {
  const parsed = parseInPersonEvent(complete);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, complete.title);
  assert.equal(parsed.bookingUrl, 'https://lu.ma/beingsclub');
  assert.equal(parseInPersonEvent({ ...complete, endsAt: complete.startsAt }).error, 'date and time');
  assert.equal(parseInPersonEvent({ ...complete, bookingUrl: 'http://example.com' }).error, 'booking link');
  assert.equal(parseInPersonEvent({ ...complete, title: '' }).error, 'title');
});

test('in-person event images reject active GIFs', () => {
  assert.equal(parseInPersonEvent({
    ...complete, imageData: 'data:image/png;base64,aGVsbG8=',
  }).image.type, 'image/png');
  assert.equal(parseInPersonEvent({
    ...complete, imageData: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
  }).error, 'image');
});

test('publishing refuses an event that has already ended', async () => {
  const env = {
    MEMBERS: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('SELECT * FROM in_person_event')) return {
                  id: 4, status: 'draft', ends_at: 900,
                };
                return null;
              },
            };
          },
        };
      },
    },
  };
  const response = await publishHostInPersonEvent(env, 4, 1000);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'event must end in the future');
});
