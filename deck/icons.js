const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const Fi = require('react-icons/fi');

async function icon(name, color) {
  const Comp = Fi[name];
  if (!Comp) throw new Error(`no icon ${name}`);
  const svg = renderToStaticMarkup(React.createElement(Comp, { color, size: 256, strokeWidth: 2 }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
module.exports = { icon };
