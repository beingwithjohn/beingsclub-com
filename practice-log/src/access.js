// Course access is an entitlement on a person, not a separate copy of the log.
// Dates are inclusive local calendar dates. They compare lexically because the
// stored shape is YYYY-MM-DD.

import { isDate } from './days.js';

export function messageAccess(person, today) {
  const from = person.message_from;
  const until = person.message_until;
  const active = isDate(today)
    && isDate(from)
    && isDate(until)
    && from <= today
    && today <= until;

  return { active, from: from || null, until: until || null };
}

