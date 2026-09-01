import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementAccepted, MEMBER_AGREEMENT_VERSION,
} from '../src/club/agreement.js';

test('the current member agreement requires both its exact version and an acceptance time', () => {
  assert.equal(agreementAccepted({
    agreement_version: MEMBER_AGREEMENT_VERSION,
    agreement_accepted_at: 1,
  }), true);
  assert.equal(agreementAccepted({
    agreement_version: MEMBER_AGREEMENT_VERSION,
    agreement_accepted_at: null,
  }), false);
  assert.equal(agreementAccepted({
    agreement_version: 'older-version',
    agreement_accepted_at: 1,
  }), false);
});
