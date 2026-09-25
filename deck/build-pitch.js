const pptxgen = require('pptxgenjs');
const { icon } = require('./icons.js');

const SAGE = '3F6F52', DEEP = '294C39', SOFT = 'E7EFE9', CREAM = 'FAF7F2';
const INK = '2C2A26', MUTED = '6F6A61', CLAY = 'C4643C', CLAY_SOFT = 'FBEEE7';
const LINE = 'E6E0D6', SUN_SOFT = 'FDF4E2', SUN_INK = '8A6414';
const HEAD = 'Cambria', BODY = 'Calibri';
const card = () => ({ type: 'outer', color: '9A9384', blur: 12, offset: 2, angle: 90, opacity: 0.18 });

(async () => {
  const I = {};
  for (const [k, n] of Object.entries({
    mail: 'FiMail', board: 'FiGrid', clock: 'FiClock', empty: 'FiAlertCircle',
    calendar: 'FiCalendar', tap: 'FiCheckCircle', user: 'FiUser', bell: 'FiBell',
    upload: 'FiUpload', eye: 'FiEye', users: 'FiUsers', plus: 'FiUserPlus',
    dollar: 'FiDollarSign', globe: 'FiGlobe', at: 'FiAtSign', phone: 'FiSmartphone',
    check: 'FiCheck', arrow: 'FiArrowRight', shield: 'FiShield',
  })) I[k] = await icon(n, 'FFFFFF');

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'Burlington Montessori School';
  pres.title = 'BMS Families — a proposal';

  const title = (s, text, opts = {}) => s.addText(text, {
    x: 0.7, y: 0.55, w: 11.9, h: 0.8, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: INK, ...opts,
  });
  const sub = (s, text, opts = {}) => s.addText(text, {
    x: 0.7, y: 1.35, w: 11, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: MUTED, ...opts,
  });
  const iconCircle = (s, img, x, y, d = 0.68, color = SAGE) => {
    s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { width: 0 } });
    s.addImage({ data: img, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52 });
  };

  /* -------------------------------------------------------------- 1 title */
  const s1 = pres.addSlide();
  s1.background = { color: DEEP };
  s1.addText('BMS Families', {
    x: 0.9, y: 1.9, w: 8.5, h: 1.0, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 54, bold: true, color: 'FFFFFF',
  });
  s1.addText('A proposal for Burlington Montessori School', {
    x: 0.9, y: 2.9, w: 8.5, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 20, color: SOFT,
  });
  s1.addText(
    'Replace the snack whiteboard and the email chase with one small app parents keep on their phone — '
    + 'built for this school, already running on its roster.',
    {
      x: 0.9, y: 3.55, w: 8.3, h: 0.9, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 15, color: '9DBFAB', lineSpacingMultiple: 1.2,
    },
  );
  [['81', 'parent accounts'], ['62', 'children'], ['3', 'classrooms'], ['123', 'snack days published']]
    .forEach(([n, l], i) => {
      const x = 0.9 + i * 2.75;
      s1.addText(n, { x, y: 5.2, w: 2.5, h: 0.7, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 38, bold: true, color: 'FFFFFF' });
      s1.addText(l, { x, y: 5.9, w: 2.6, h: 0.35, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: '9DBFAB' });
    });
  s1.addShape(pres.ShapeType.roundRect, { x: 9.9, y: 2.0, w: 2.7, h: 2.35, rectRadius: 0.18, fill: { color: SAGE }, line: { color: '4F8463', width: 1 } });
  s1.addText('Wed', { x: 10.15, y: 2.22, w: 2.2, h: 0.3, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12, color: 'BFD6C7' });
  s1.addText('16', { x: 10.15, y: 2.5, w: 2.2, h: 0.85, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 48, bold: true, color: 'FFFFFF' });
  s1.addText('Amelia', { x: 10.15, y: 3.4, w: 2.2, h: 0.38, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 19, bold: true, color: 'FFFFFF' });
  s1.addText('is bringing snacks', { x: 10.15, y: 3.78, w: 2.3, h: 0.32, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12, color: 'BFD6C7' });
  s1.addNotes('Open with the numbers: this is not a mock-up, the real roster is already loaded.');

  /* ------------------------------------------------------------ 2 problem */
  const s2 = pres.addSlide();
  s2.background = { color: CREAM };
  title(s2, 'What snack days cost the office today');
  sub(s2, 'Four small frictions that add up to chased parents and empty snack days.');
  [
    [I.mail, 'It all runs on email', 'Sign-ups, reminders and swaps go out as email. Threads get buried, and a parent who missed one has no way to catch up.'],
    [I.board, 'The list is on a wall', 'You can only see the whiteboard by standing in front of it. Nobody knows what is free without asking the office.'],
    [I.clock, 'Nothing reminds anyone', 'Signing up in September for a day in November means remembering it unaided. Some families simply forget.'],
    [I.empty, 'Some days have nobody', 'A blank day is only noticed when it arrives — and by then the class has no snack.'],
  ].forEach(([img, t, b], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 2.1 + Math.floor(i / 2) * 2.15;
    s2.addShape(pres.ShapeType.roundRect, { x, y, w: 5.75, h: 1.85, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card() });
    iconCircle(s2, img, x + 0.35, y + 0.35, 0.72, CLAY);
    s2.addText(t, { x: x + 1.28, y: y + 0.36, w: 4.1, h: 0.4, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
    s2.addText(b, { x: x + 1.28, y: y + 0.82, w: 4.15, h: 0.95, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 13, color: MUTED, lineSpacingMultiple: 1.15 });
  });

  /* ------------------------------------------------------------ 3 parents */
  const s3 = pres.addSlide();
  s3.background = { color: CREAM };
  title(s3, 'What parents get');
  sub(s3, 'The whiteboard, on their phone — and it does the reminding.');
  [
    [I.calendar, 'One tap to take a day', 'The whole term at a glance, holidays already removed. Free days are obvious; taken days show who has them.'],
    [I.user, "Their child's name on the board", 'A family with two children picks the child; the classroom follows. Exactly what the whiteboard said.'],
    [I.bell, 'Reminded without being nagged', 'The evening before their day, a week ahead, and when days need a family. Never to someone already booked.'],
    [I.phone, 'On the home screen like an app', 'Sign in with the email the school holds. No app store, no password to forget.'],
  ].forEach(([img, t, b], i) => {
    const y = 2.05 + i * 1.18;
    iconCircle(s3, img, 0.7, y + 0.02, 0.6);
    s3.addText(t, { x: 1.5, y, w: 5.5, h: 0.36, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 17, bold: true, color: INK });
    s3.addText(b, { x: 1.5, y: y + 0.38, w: 5.6, h: 0.72, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: MUTED, lineSpacingMultiple: 1.12 });
  });
  // Calendar mock with the child selector.
  const CX = 7.85, CY = 2.55, CW = 0.86, CH = 0.66, G = 0.09;
  s3.addShape(pres.ShapeType.roundRect, { x: CX - 0.35, y: 1.95, w: 5 * CW + 4 * G + 0.7, h: 4 * CH + 3 * G + 1.7, rectRadius: 0.14, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card() });
  // selector pill
  s3.addShape(pres.ShapeType.roundRect, { x: CX - 0.1, y: 2.12, w: 4.65, h: 0.42, rectRadius: 0.21, fill: { color: 'EFECE6' }, line: { width: 0 } });
  s3.addShape(pres.ShapeType.roundRect, { x: CX - 0.05, y: 2.16, w: 2.28, h: 0.34, rectRadius: 0.17, fill: { color: 'FFFFFF' }, line: { width: 0 } });
  s3.addText([{ text: 'Noor', options: { bold: true, color: INK } }, { text: '  Classroom 3', options: { color: MUTED, fontSize: 9 } }], { x: CX - 0.05, y: 2.16, w: 2.28, h: 0.34, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 11, align: 'center', valign: 'middle' });
  s3.addText([{ text: 'Zara', options: { bold: true, color: MUTED } }, { text: '  Classroom 2', options: { color: '9A948A', fontSize: 9 } }], { x: CX + 2.27, y: 2.16, w: 2.28, h: 0.34, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 11, align: 'center', valign: 'middle' });
  s3.addText('October · Classroom 3', { x: CX - 0.1, y: 2.68, w: 3.5, h: 0.28, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 13, bold: true, color: INK });
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((d, i) => s3.addText(d, { x: CX + i * (CW + G), y: 3.0, w: CW, h: 0.24, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 9.5, color: MUTED, align: 'center' }));
  [['5', 'Open'], ['6', 'Open'], ['7', 'Bo'], ['8', 'Open'], ['9', 'Diya'],
   ['12', 'Closed'], ['13', 'Open'], ['14', 'Noor'], ['15', 'Open'], ['16', 'Amelia'],
   ['19', 'Open'], ['20', 'Open'], ['21', 'Mateo'], ['22', 'Open'], ['23', 'Closed'],
   ['26', 'Elif'], ['27', 'Open'], ['28', 'Open'], ['29', 'Zara'], ['30', 'Open']]
    .forEach(([day, label], i) => {
      const x = CX + (i % 5) * (CW + G), y = 3.3 + Math.floor(i / 5) * (CH + G);
      const closed = label === 'Closed', open = label === 'Open', mine = label === 'Noor';
      s3.addShape(pres.ShapeType.roundRect, { x, y, w: CW, h: CH, rectRadius: 0.08, fill: { color: mine ? SAGE : closed ? CLAY_SOFT : open ? 'FFFFFF' : SOFT }, line: { color: mine ? SAGE : open ? LINE : closed ? 'F0D9CD' : 'CFE0D5', width: 1 } });
      s3.addText(day, { x, y: y + 0.05, w: CW, h: 0.25, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 10.5, bold: true, align: 'center', color: mine ? 'FFFFFF' : closed ? CLAY : INK });
      s3.addText(label, { x, y: y + 0.31, w: CW, h: 0.25, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 8.5, align: 'center', color: mine ? 'FFFFFF' : closed ? CLAY : open ? MUTED : SAGE });
    });
  s3.addNotes('Closures come straight from the published school calendar, so no snack day is ever scheduled on a day off.');

  /* ------------------------------------------------------------- 4 office */
  const s4 = pres.addSlide();
  s4.background = { color: CREAM };
  title(s4, 'What the office gets');
  sub(s4, 'Less chasing, and a roster that came from the spreadsheet you already keep.');
  [
    [I.upload, 'Import the roster you have', 'Drop in the contact spreadsheet as it is. It reads the layout, flags anything it cannot use, and never creates a record you have not seen first.'],
    [I.eye, 'See the gaps before they arrive', 'Per classroom: how many days are filled, which are still open, and which children have nothing booked.'],
    [I.plus, 'Add a child in a minute', 'Child first, then parents — if a parent is already on the roster, the child is simply linked to them.'],
    [I.shield, 'Rules the school actually has', 'Siblings are never placed in one classroom. Days lock two days out. Parents can\'t swap once a term is full. Staff can always override.'],
  ].forEach(([img, t, b], i) => {
    const x = 0.7 + (i % 2) * 6.2, y = 2.1 + Math.floor(i / 2) * 2.15;
    s4.addShape(pres.ShapeType.roundRect, { x, y, w: 5.75, h: 1.85, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card() });
    iconCircle(s4, img, x + 0.35, y + 0.35, 0.72);
    s4.addText(t, { x: x + 1.28, y: y + 0.36, w: 4.2, h: 0.4, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 18, bold: true, color: INK });
    s4.addText(b, { x: x + 1.28, y: y + 0.8, w: 4.2, h: 0.98, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: MUTED, lineSpacingMultiple: 1.12 });
  });

  /* -------------------------------------------------------------- 5 proof */
  const s5 = pres.addSlide();
  s5.background = { color: CREAM };
  title(s5, 'It already runs on your roster');
  sub(s5, 'Built against the real contact sheet, not a demo. Nothing here is invented.');
  [['81', 'parent accounts', 'every one traced back to a row on the sheet'], ['62', 'children', '21 · 20 · 21 across three classrooms'], ['123', 'snack days', 'published, holidays removed'], ['71', 'can sign in today', 'have an email on file; 10 still need one']]
    .forEach(([n, l, d], i) => {
      const x = 0.7 + i * 3.05;
      s5.addShape(pres.ShapeType.roundRect, { x, y: 2.1, w: 2.8, h: 2.0, rectRadius: 0.14, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card() });
      s5.addText(n, { x: x + 0.3, y: 2.3, w: 2.3, h: 0.8, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 44, bold: true, color: SAGE });
      s5.addText(l, { x: x + 0.3, y: 3.1, w: 2.3, h: 0.3, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 14, bold: true, color: INK });
      s5.addText(d, { x: x + 0.3, y: 3.42, w: 2.35, h: 0.55, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 11, color: MUTED, lineSpacingMultiple: 1.1 });
    });
  s5.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 4.5, w: 11.95, h: 1.7, rectRadius: 0.14, fill: { color: SOFT }, line: { width: 0 } });
  iconCircle(s5, I.check, 1.0, 4.85, 0.6);
  s5.addText('The import matched the spreadsheet on every child', { x: 1.8, y: 4.8, w: 10.5, h: 0.36, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 17, bold: true, color: INK });
  s5.addText(
    'Two parents per child, two children per family, a phone typed as a number, a second contact on the next row, '
    + 'a classroom heading above the column titles — all read correctly. What it could not use, it listed by row number '
    + 'for the office to fix, rather than guessing.',
    { x: 1.8, y: 5.18, w: 10.5, h: 0.9, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: '4A6B57', lineSpacingMultiple: 1.15 },
  );

  /* --------------------------------------------------------- 6 cost & asks */
  const s6 = pres.addSlide();
  s6.background = { color: CREAM };
  title(s6, 'What it costs, and what we need');
  sub(s6, 'No per-family fees. It runs on the school’s own cloud account.');
  s6.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 2.05, w: 5.4, h: 3.55, rectRadius: 0.14, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card() });
  iconCircle(s6, I.dollar, 1.05, 2.4, 0.6);
  s6.addText('Running cost', { x: 1.85, y: 2.45, w: 3.5, h: 0.4, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
  s6.addText('under $5 a month', { x: 1.05, y: 3.15, w: 4.8, h: 0.7, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 32, bold: true, color: SAGE });
  s6.addText(
    [
      { text: 'Almost all of it is a fixed fee for storing two secrets securely.', options: { bullet: true, breakLine: true } },
      { text: 'Email reminders cost fractions of a cent each.', options: { bullet: true, breakLine: true } },
      { text: 'No licences, no per-parent pricing, no contract.', options: { bullet: true, breakLine: true } },
      { text: 'Text messages, if switched on later: about $2 a month for a number plus roughly a cent per text.', options: { bullet: true } },
    ],
    { x: 1.05, y: 3.95, w: 4.8, h: 2.1, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: MUTED, paraSpaceAfter: 6, lineSpacingMultiple: 1.1 },
  );
  s6.addText('Three things only the school can do', { x: 6.6, y: 2.1, w: 6, h: 0.4, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 19, bold: true, color: INK });
  [
    [I.globe, 'Add three lines to the school’s domain', 'So email comes from @burlingtonmontessori.org and lands in the inbox, not spam. Ten minutes for whoever manages the website.'],
    [I.at, 'Collect ten missing email addresses', 'Ten families have no email on file and cannot sign in until they do. The app lists exactly who.'],
    [I.phone, 'Decide on text messages', 'Optional. Email works today; texts need a registered number (~$2/month) and a few days of carrier paperwork.'],
  ].forEach(([img, t, b], i) => {
    const y = 2.7 + i * 1.2;
    iconCircle(s6, img, 6.6, y + 0.02, 0.56, CLAY);
    s6.addText(t, { x: 7.35, y, w: 5.3, h: 0.34, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
    s6.addText(b, { x: 7.35, y: y + 0.36, w: 5.3, h: 0.78, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12, color: MUTED, lineSpacingMultiple: 1.1 });
  });

  /* ----------------------------------------------------------- 7 the ask */
  const s7 = pres.addSlide();
  s7.background = { color: DEEP };
  s7.addText('The proposal', { x: 0.9, y: 0.75, w: 9, h: 0.8, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF' });
  s7.addText('Run snack days on the app for the autumn term, alongside the whiteboard, and judge it on one question: did fewer days go unfilled?', { x: 0.9, y: 1.55, w: 11, h: 0.8, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 16, color: '9DBFAB', lineSpacingMultiple: 1.2 });
  [
    ['1', 'This week', 'Add the three DNS lines. Office adds the ten missing emails. Parents get a one-page “add it to your phone” note.'],
    ['2', 'Autumn term', 'Families sign up on the app. Reminders run. Office keeps the whiteboard as a fallback and watches the coverage view.'],
    ['3', 'December', 'Compare unfilled days and office hours spent chasing against last year. Decide whether to keep it.'],
  ].forEach(([n, t, b], i) => {
    const x = 0.9 + i * 4.0;
    s7.addShape(pres.ShapeType.roundRect, { x, y: 2.7, w: 3.7, h: 2.25, rectRadius: 0.14, fill: { color: '31563F' }, line: { color: '406B4F', width: 1 } });
    s7.addText(n, { x: x + 0.3, y: 2.85, w: 1, h: 0.6, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 34, bold: true, color: '9DBFAB' });
    s7.addText(t, { x: x + 0.3, y: 3.45, w: 3.1, h: 0.35, isTextBox: true, margin: 0, fontFace: HEAD, fontSize: 17, bold: true, color: 'FFFFFF' });
    s7.addText(b, { x: x + 0.3, y: 3.85, w: 3.15, h: 1.35, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 12.5, color: SOFT, lineSpacingMultiple: 1.15 });
  });
  s7.addText('If it earns its place: tuition reminders, important-dates notices and a parent Q&A assistant reuse everything already built.', { x: 0.9, y: 5.4, w: 11.5, h: 0.6, isTextBox: true, margin: 0, fontFace: BODY, fontSize: 13, italic: true, color: '9DBFAB' });
  s7.addNotes('Ask for a term, not a commitment. The whiteboard stays up as the safety net.');

  await pres.writeFile({ fileName: 'BMS Families - School Pitch.pptx' });
  console.log('written');
})();
