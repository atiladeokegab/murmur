import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLink } from '../public/lib/links.js';

test('deep links open the right app at the right screen', () => {
  assert.equal(buildLink({ kind: 'whatsapp', text: "I'll be there at 1 & bring cake" }),
    'https://wa.me/?text=I\'ll%20be%20there%20at%201%20%26%20bring%20cake');
  assert.equal(buildLink({ kind: 'whatsapp', phone: '+44 7700 900461', text: 'hi' }), 'https://wa.me/447700900461?text=hi');
  assert.equal(buildLink({ kind: 'uber', place: 'Stratford, London' }),
    'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=Stratford%2C%20London');
  assert.equal(buildLink({ kind: 'transit', place: 'UCL East' }),
    'https://www.google.com/maps/dir/?api=1&destination=UCL%20East&travelmode=transit');
  assert.equal(buildLink({ kind: 'citymapper', place: 'UCL East' }), 'https://citymapper.com/directions?endname=UCL%20East');
  assert.equal(buildLink({ kind: 'tel', phone: '+44 (0)7700 900123' }), 'tel:+4407700900123');
  assert.equal(buildLink({ kind: 'sms', phone: '+447700900123', text: 'on my way' }), 'sms:+447700900123?&body=on%20my%20way');
  assert.throws(() => buildLink({ kind: 'bank' }));
});
