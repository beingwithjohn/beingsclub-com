# Beings Club email system

Beings Club member mail should feel like one dependable correspondence, not a
collection of unrelated templates. The source of truth is
`src/mail/send.js`; the original Invite, Field Notes and Noteboard designs are
the visual reference.

## The recognisable form

Every member-area email uses the same email-safe table shell:

- warm outer ground `#F7F5EF` and 600px paper `#FDFCF9`
- the outlined Beings Club mark at the top
- Helvetica/Arial body type, black `#171916`, violet `#5A4B7C` and lilac
  `#F2ECFF`
- one clear 34px headline, short prose, and at most one primary black button
- ruled secondary information; Georgia italic only for a deliberate offering
  or quotation
- the quiet closing: “for the benefit of all beings”, followed by a relevant
  entrance or settings link

The HTML and plain-text versions must say the same thing. The subject says
what happened; the preheader adds useful context rather than repeating it.
Links point to `https://beingsclub.com`, and the email must remain intelligible
if images do not load.

Membership invitations and welcomes are sent as **Beings Club** from
`practice@beingsclub.com`; replies still go privately to John.
After John grants membership, the welcome button carries a one-use private
entrance that expires after seven days and opens the first-entry welcome without
asking for another email code. The token lives in the URL fragment, is removed
from the address bar before exchange, and the ordinary email-link GET writes
nothing.

`clubEmailLayout` is the shared implementation. Special messages, including
the welcome, add sections through that shell instead of copying a second page.
The older Practice Log sequence keeps its deliberately compact rhythm and dark
private-reply variation, but uses the same mark, palette, button language and
quiet closing.

## Sender identity

Automated member mail is from `Beings Club <practice@beingsclub.com>`.
Personal decisions or letters may show `John Ooi` at the same address, but
they retain the same visual shell. Every message replies to
`john@spacetobe.xyz`, where John can actually receive it.

## Delivery contract

DNS observed on 2 September 2026:

- DKIM is published at `resend._domainkey.beingsclub.com`
- the Resend return path `send.beingsclub.com` publishes SPF and MX
- DMARC is published at `_dmarc.beingsclub.com` with `p=none`
- the root domain has no MX, so `Reply-To` must remain on a receiving domain

Before tightening DMARC, inspect a real received message and confirm that SPF,
DKIM and DMARC pass with aligned domains. Move from monitoring to enforcement
in stages; do not jump straight to `p=reject` without evidence.

For healthy inbox placement:

- send only expected transactional mail and member-chosen Salon or Field Note
  notices
- keep both HTML and plain text, keep messages small, and use honest subjects
- keep links on the sending domain and avoid link shorteners
- disable open and click tracking for these messages in Resend
- start with low, steady volume; do not suddenly send a new domain a large list
- monitor bounces and complaints, and stop sending non-essential mail to those
  addresses
- retain visible settings controls for optional mail

No implementation can guarantee the inbox. Authentication, wanted mail,
consistent identity, low complaint rates and gradual sending together give the
best chance of reaching it.
