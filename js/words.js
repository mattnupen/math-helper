// Numbers as spoken words, so text-to-speech says exactly what we mean.

const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${SMALL[hundreds]} hundred`);
  if (rest) {
    if (rest < 20) parts.push(SMALL[rest]);
    else parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${SMALL[rest % 10]}` : ''));
  }
  return parts.join(' ');
}

// 1074 -> "one thousand seventy-four". Supports 0 to 999,999.
export function numberWords(n) {
  if (n === 0) return 'zero';
  const parts = [];
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands) parts.push(`${under1000(thousands)} thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}

// 3 -> "threes", 6 -> "sixes", 20 -> "twenties"
export function pluralWords(n) {
  const w = numberWords(n);
  if (w.endsWith('x')) return `${w}es`;
  if (w.endsWith('y')) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}
