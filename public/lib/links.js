// Deep links that open the right app at the right screen. Pure; tested in test/links.test.js.

const enc = encodeURIComponent;
const digits = (phone) => String(phone || '').replace(/[^\d+]/g, '');

export function buildLink(a) {
  switch (a.kind) {
    case 'whatsapp': return `https://wa.me/${digits(a.phone).replace('+', '')}?text=${enc(a.text || '')}`;
    case 'uber':
      return 'https://m.uber.com/ul/?action=setPickup&pickup=my_location' +
        `&dropoff[formatted_address]=${enc(a.place)}`;
    case 'transit':
      return `https://www.google.com/maps/dir/?api=1&destination=${enc(a.place)}&travelmode=transit`;
    case 'citymapper': return `https://citymapper.com/directions?endname=${enc(a.place)}`;
    case 'tel': return `tel:${digits(a.phone)}`;
    case 'sms': return `sms:${digits(a.phone)}${a.text ? `?&body=${enc(a.text)}` : ''}`;
    default: throw new Error(`unknown link kind: ${a.kind}`);
  }
}
