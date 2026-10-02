// Gyerekrajz-stílusú demó SVG-k generálása a web/assets/demo mappába.
// Futtatás: node web/tools/gen-demo-art.js
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'assets', 'demo');

const filter = (seed, scale = 7) => `<defs><filter id="c" x="-8%" y="-8%" width="116%" height="116%">
<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed}" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="${seed + 5}" result="g"/>
<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.6 1.45" result="ga"/>
<feComposite in="d" in2="ga" operator="in"/>
</filter></defs>`;

const svg = (w, h, body, seed = 3, bg = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${filter(seed)}${bg}<g filter="url(#c)" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`;

const ink = '#2b2b33';
const S = (c = ink, w = 9) => `stroke="${c}" stroke-width="${w}"`;

const art = {
  // ---------------------------------------------------------------- elemek
  cat: [260, 210, `
    <path d="M40 132 C 10 110, 8 60, 30 40" fill="none" ${S('#6f7480', 14)}/>
    <ellipse cx="112" cy="140" rx="80" ry="48" fill="#a9adb8" ${S()}/>
    <path d="M70 178 L66 200 M100 184 L100 202 M135 184 L137 202 M162 176 L170 198" ${S(ink, 10)}/>
    <path d="M160 58 L170 18 L192 44 Z" fill="#a9adb8" ${S()}/>
    <path d="M206 42 L228 16 L236 58 Z" fill="#a9adb8" ${S()}/>
    <circle cx="198" cy="86" r="48" fill="#a9adb8" ${S()}/>
    <circle cx="184" cy="80" r="7" fill="${ink}"/><circle cx="214" cy="80" r="7" fill="${ink}"/>
    <path d="M193 96 L203 96 L198 104 Z" fill="#f08aa0" ${S('#f08aa0', 4)}/>
    <path d="M186 112 Q198 120 210 112" fill="none" ${S(ink, 5)}/>
    <path d="M150 96 L178 100 M150 108 L178 106 M246 96 L220 100 M246 108 L220 106" ${S(ink, 4)}/>`, 11],
  sun: [240, 240, `
    <g ${S('#f2a516', 12)}>
      <path d="M120 14 L120 44 M120 196 L120 226 M14 120 L44 120 M196 120 L226 120 M45 45 L66 66 M174 174 L195 195 M195 45 L174 66 M66 174 L45 195"/>
    </g>
    <circle cx="120" cy="120" r="62" fill="#ffd23f" ${S('#f2a516', 10)}/>
    <circle cx="100" cy="110" r="7" fill="${ink}"/><circle cx="140" cy="110" r="7" fill="${ink}"/>
    <path d="M96 138 Q120 158 144 138" fill="none" ${S(ink, 6)}/>`, 4],
  butterfly: [150, 120, `
    <path d="M75 60 C 40 0, 4 20, 20 58 C 0 90, 40 112, 75 70 Z" fill="#ff7bbd" ${S('#c43d86', 7)}/>
    <path d="M75 60 C 110 0, 146 20, 130 58 C 150 90, 110 112, 75 70 Z" fill="#9b7bff" ${S('#5b3fc4', 7)}/>
    <circle cx="40" cy="52" r="8" fill="#fff59a"/><circle cx="110" cy="52" r="8" fill="#fff59a"/>
    <path d="M75 30 L75 98" ${S(ink, 9)}/>
    <path d="M75 32 Q66 14 58 10 M75 32 Q84 14 92 10" fill="none" ${S(ink, 4)}/>`, 6],
  bird: [190, 130, `
    <path d="M30 70 Q60 30 110 60 Q150 40 168 62 Q150 100 100 100 Q50 105 30 70 Z" fill="#3fa7f2" ${S('#1d6fb3', 8)}/>
    <path d="M70 66 Q90 14 124 34 Q106 60 86 74 Z" fill="#7cc9ff" ${S('#1d6fb3', 7)}/>
    <path d="M168 62 L186 66 L168 74 Z" fill="#ffb12a" ${S('#e08b00', 5)}/>
    <circle cx="150" cy="60" r="6" fill="${ink}"/>
    <path d="M30 70 L10 58 M30 74 L10 84" ${S('#1d6fb3', 7)}/>`, 8],
  cloud: [300, 160, `
    <path d="M50 120 C 10 120, 14 70, 56 74 C 56 30, 120 22, 140 56 C 160 20, 230 26, 228 76 C 280 70, 290 128, 246 128 Z" fill="#ffffff" ${S('#8fb0d9', 9)}/>`, 9],
  moon: [200, 220, `
    <path d="M128 20 C 40 30, 30 190, 140 200 C 70 160, 70 70, 128 20 Z" fill="#fff1a8" ${S('#e2bf2a', 10)}/>
    <circle cx="92" cy="96" r="6" fill="${ink}"/>
    <path d="M86 132 Q96 140 106 132" fill="none" ${S(ink, 5)}/>`, 12],
  star: [130, 130, `
    <path d="M65 10 L80 48 L120 50 L89 74 L100 114 L65 91 L30 114 L41 74 L10 50 L50 48 Z" fill="#ffe04a" ${S('#e6a700', 8)}/>`, 13],
  fish: [230, 140, `
    <path d="M30 70 Q90 8 170 70 Q90 132 30 70 Z" fill="#ff8c42" ${S('#c4561a', 8)}/>
    <path d="M170 70 L218 34 L208 70 L218 106 Z" fill="#ffb347" ${S('#c4561a', 8)}/>
    <path d="M86 40 Q96 70 86 100 M112 36 Q122 70 112 104" fill="none" ${S('#c4561a', 6)}/>
    <circle cx="58" cy="62" r="8" fill="${ink}"/>
    <path d="M36 80 Q44 86 52 80" fill="none" ${S(ink, 4)}/>`, 14],
  crab: [230, 160, `
    <path d="M40 110 L14 140 M60 120 L44 150 M190 110 L216 140 M170 120 L186 150" ${S('#c4321e', 9)}/>
    <ellipse cx="115" cy="100" rx="78" ry="46" fill="#ff5a3c" ${S('#c4321e', 9)}/>
    <path d="M60 70 L36 34 M170 70 L194 34" ${S('#c4321e', 9)}/>
    <path d="M18 34 C 18 6, 54 6, 50 30 L36 30 Z" fill="#ff5a3c" ${S('#c4321e', 8)}/>
    <path d="M212 34 C 212 6, 176 6, 180 30 L194 30 Z" fill="#ff5a3c" ${S('#c4321e', 8)}/>
    <path d="M96 62 L92 36 M134 62 L138 36" ${S(ink, 6)}/>
    <circle cx="92" cy="32" r="9" fill="#fff" ${S(ink, 5)}/><circle cx="138" cy="32" r="9" fill="#fff" ${S(ink, 5)}/>
    <path d="M96 114 Q115 128 134 114" fill="none" ${S(ink, 6)}/>`, 15],
  starfish: [170, 170, `
    <path d="M85 12 Q96 56 152 62 Q108 88 124 152 Q86 118 46 152 Q62 92 18 62 Q74 56 85 12 Z" fill="#ff7ab0" ${S('#c43d7a', 8)}/>
    <circle cx="74" cy="76" r="6" fill="${ink}"/><circle cx="98" cy="76" r="6" fill="${ink}"/>
    <path d="M74 98 Q86 108 98 98" fill="none" ${S(ink, 5)}/>`, 16],
  bubble: [90, 90, `
    <circle cx="45" cy="45" r="32" fill="#d8f3ff" fill-opacity="0.6" ${S('#5fb8e6', 7)}/>
    <path d="M30 34 Q36 24 46 22" fill="none" ${S('#ffffff', 6)}/>`, 17],
  jellyfish: [170, 200, `
    <path d="M20 90 C 20 10, 150 10, 150 90 Z" fill="#c9a7ff" ${S('#7a4fd1', 8)}/>
    <path d="M40 92 Q30 130 44 160 Q54 180 40 196 M70 92 Q80 130 66 170 M100 92 Q90 130 104 170 M130 92 Q140 130 126 160 Q118 180 130 196" fill="none" ${S('#7a4fd1', 7)}/>
    <circle cx="66" cy="60" r="7" fill="${ink}"/><circle cx="104" cy="60" r="7" fill="${ink}"/>`, 18],
  rocket: [260, 170, `
    <path d="M40 85 Q120 20 210 85 Q120 150 40 85 Z" fill="#f2f2f2" ${S('#5a6270', 9)}/>
    <path d="M210 85 Q236 80 250 85 Q236 92 210 88" fill="#ff4f4f" ${S('#c42f2f', 7)}/>
    <path d="M78 55 L40 20 L58 66 Z M78 115 L40 150 L58 104 Z" fill="#ff4f4f" ${S('#c42f2f', 7)}/>
    <circle cx="140" cy="85" r="22" fill="#7cc9ff" ${S('#5a6270', 8)}/>
    <path d="M36 70 Q6 85 36 100 M30 78 Q16 85 30 92" fill="#ffb12a" ${S('#ff7a00', 7)}/>`, 19],
  alien: [180, 230, `
    <path d="M60 40 L44 8 M120 40 L136 8" ${S('#3a9b3a', 8)}/>
    <circle cx="44" cy="8" r="8" fill="#ffe04a"/><circle cx="136" cy="8" r="8" fill="#ffe04a"/>
    <ellipse cx="90" cy="80" rx="62" ry="54" fill="#7ee07e" ${S('#3a9b3a', 9)}/>
    <ellipse cx="90" cy="76" rx="22" ry="26" fill="#fff" ${S(ink, 6)}/><circle cx="94" cy="80" r="10" fill="${ink}"/>
    <path d="M70 108 Q90 120 110 108" fill="none" ${S(ink, 6)}/>
    <path d="M58 132 L48 210 L132 210 L122 132 Z" fill="#7ee07e" ${S('#3a9b3a', 9)}/>
    <path d="M58 150 L18 128 M122 150 L162 120" ${S('#3a9b3a', 10)}/>`, 20],
  planet: [240, 170, `
    <circle cx="120" cy="85" r="56" fill="#ffa94d" ${S('#d9761a', 9)}/>
    <path d="M86 70 Q120 60 150 74 M80 100 Q120 92 160 104" fill="none" ${S('#d9761a', 7)}/>
    <ellipse cx="120" cy="92" rx="108" ry="26" fill="none" ${S('#8b5cf6', 10)} transform="rotate(-12 120 92)"/>`, 21],
  flower: [110, 220, `
    <path d="M55 214 Q50 150 56 100" fill="none" ${S('#3a9b3a', 10)}/>
    <path d="M54 170 Q24 150 18 128 Q44 132 54 160" fill="#7ee07e" ${S('#3a9b3a', 7)}/>
    <g fill="#ff6fa8" ${S('#c43d7a', 7)}>
      <circle cx="55" cy="38" r="22"/><circle cx="84" cy="62" r="22"/><circle cx="26" cy="62" r="22"/>
      <circle cx="40" cy="94" r="22"/><circle cx="72" cy="94" r="22"/>
    </g>
    <circle cx="55" cy="68" r="18" fill="#ffe04a" ${S('#e6a700', 6)}/>`, 22]
};

// --------------------------------------------------------------- hátterek
const paper = (seed) => `<rect width="1600" height="1200" fill="#fbf6ea"/>
<filter id="p"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.55 0 0 0 0 0.48 0 0 0 0 0.35 0 0 0 0.10 0"/></filter>
<rect width="1600" height="1200" filter="url(#p)"/>`;

const grass = (y0) => {
  let s = '';
  for (let x = 30; x < 1600; x += 46) {
    const y = y0 + 18 * Math.sin(x / 140);
    s += `M${x} ${y + 30} L${x - 10} ${y - 4} M${x + 8} ${y + 30} L${x + 14} ${y - 10} `;
  }
  return `<path d="${s}" ${S('#3fae4a', 7)}/>`;
};
const ground = (y0, fill = '#bfe8a2') =>
  `<path d="M0 ${y0} Q200 ${y0 - 30} 400 ${y0} T800 ${y0} T1200 ${y0} T1600 ${y0} L1600 1200 L0 1200 Z" fill="${fill}" ${S('#3fae4a', 10)}/>`;
const tree = (x, y) => `
  <path d="M${x - 26} ${y} L${x - 20} ${y - 230} L${x + 20} ${y - 230} L${x + 26} ${y} Z" fill="#a0612d" ${S('#6b3a14', 9)}/>
  <path d="M${x - 150} ${y - 260} C ${x - 210} ${y - 380}, ${x - 80} ${y - 470}, ${x} ${y - 430} C ${x + 90} ${y - 480}, ${x + 210} ${y - 380}, ${x + 150} ${y - 270} C ${x + 120} ${y - 200}, ${x - 110} ${y - 190}, ${x - 150} ${y - 260} Z" fill="#62c46a" ${S('#2f8a3a', 10)}/>
  <circle cx="${x - 60}" cy="${y - 330}" r="14" fill="#ff4f4f"/><circle cx="${x + 50}" cy="${y - 300}" r="14" fill="#ff4f4f"/><circle cx="${x + 10}" cy="${y - 390}" r="14" fill="#ff4f4f"/>`;
const house = (x, y, k = 1) => {
  const w = 420 * k, h = 300 * k;
  return `
  <path d="M${x} ${y} L${x} ${y - h} L${x + w} ${y - h} L${x + w} ${y} Z" fill="#ff8a7a" ${S('#b8402f', 10)}/>
  <path d="M${x - 40 * k} ${y - h} L${x + w / 2} ${y - h - 220 * k} L${x + w + 40 * k} ${y - h} Z" fill="#c0392b" ${S('#7a1f14', 10)}/>
  <path d="M${x + 160 * k} ${y} L${x + 160 * k} ${y - 160 * k} L${x + 260 * k} ${y - 160 * k} L${x + 260 * k} ${y}" fill="#8a4b20" ${S('#5a2e0f', 9)}/>
  <rect x="${x + 40 * k}" y="${y - 250 * k}" width="${90 * k}" height="${80 * k}" fill="#bfe6ff" ${S('#5a6270', 8)}/>
  <rect x="${x + 290 * k}" y="${y - 250 * k}" width="${90 * k}" height="${80 * k}" fill="#bfe6ff" ${S('#5a6270', 8)}/>
  <path d="M${x + 85 * k} ${y - 250 * k} L${x + 85 * k} ${y - 170 * k} M${x + 335 * k} ${y - 250 * k} L${x + 335 * k} ${y - 170 * k}" ${S('#5a6270', 6)}/>`;
};
const scribbleFill = (y0, y1, color, w = 26, seed = 1) => {
  // gyerekes, firkált égbolt / víz
  let d = '';
  let dir = 0;
  for (let y = y0; y < y1; y += w * 0.8) {
    const jitter = ((y * 7919 + seed * 31) % 23) - 11;
    d += dir ? `M1580 ${y} L20 ${y + jitter} ` : `M20 ${y} L1580 ${y + jitter} `;
    dir = 1 - dir;
  }
  return `<rect x="14" y="${y0}" width="1572" height="${y1 - y0}" fill="${color}" opacity="0.7"/><path d="${d}" ${S(color, w)} stroke-opacity="0.9"/>`;
};
const seaweed = (x, y) => `<path d="M${x} ${y} Q${x - 40} ${y - 80} ${x} ${y - 160} T${x} ${y - 320}" fill="none" ${S('#2f9a6a', 16)}/>`;
const rock = (x, y) => `<path d="M${x} ${y} Q${x + 20} ${y - 90} ${x + 110} ${y - 80} Q${x + 190} ${y - 70} ${x + 200} ${y} Z" fill="#9aa3ad" ${S('#5a6270', 9)}/>`;

const bgs = {
  'bg-meadow': [
    `${ground(930)}${grass(930)}${tree(230, 960)}
     <g transform="translate(980 840)"><path d="M0 0" /></g>`, 31],
  'bg-meadow-house': [`${ground(930)}${grass(930)}${house(980, 960, 1)}${tree(250, 960)}`, 32],
  'bg-house-big': [`${ground(1010)}${grass(1010)}${house(500, 1040, 1.45)}`, 33],
  'bg-night': [`${scribbleFill(20, 900, '#2d3a8c', 34, 4)}${ground(960, '#2f6b3a')}${house(540, 1000, 1.2)}
     <rect x="${540 + 40 * 1.2}" y="${1000 - 250 * 1.2}" width="${90 * 1.2}" height="${80 * 1.2}" fill="#ffe680"/>`, 34],
  'bg-sea': [`${scribbleFill(20, 1000, '#4fb3e8', 34, 2)}
     <path d="M0 1000 Q300 960 600 1000 T1200 1000 T1600 990 L1600 1200 L0 1200 Z" fill="#f3d58a" ${S('#c9a24a', 10)}/>
     ${seaweed(160, 1010)}${seaweed(230, 1020)}${seaweed(1420, 1010)}${rock(1100, 1030)}`, 35],
  'bg-space': [`${scribbleFill(20, 1180, '#1d1f4f', 40, 7)}
     <g fill="#fff">${Array.from({ length: 46 }, (_, i) => `<circle cx="${(i * 337) % 1560 + 20}" cy="${(i * 211) % 1140 + 30}" r="${4 + (i % 3) * 2}"/>`).join('')}</g>
     <circle cx="1380" cy="1050" r="230" fill="#d9d9e0" ${S('#8a8a99', 10)}/>
     <circle cx="1300" cy="1000" r="40" fill="#bdbdc8" ${S('#8a8a99', 7)}/><circle cx="1450" cy="960" r="28" fill="#bdbdc8" ${S('#8a8a99', 7)}/>`, 36]
};

for (const [name, [w, h, body, seed]] of Object.entries(art)) {
  fs.writeFileSync(path.join(out, name + '.svg'), svg(w, h, body, seed));
}
for (const [name, [body, seed]] of Object.entries(bgs)) {
  fs.writeFileSync(path.join(out, name + '.svg'), svg(1600, 1200, body, seed, paper(seed)));
}
console.log('ok', Object.keys(art).length + Object.keys(bgs).length);
