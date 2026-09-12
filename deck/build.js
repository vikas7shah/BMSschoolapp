const pptxgen = require('pptxgenjs');
const { icon } = require('./icons.js');

// The app's own palette, so the deck looks like the product it describes.
const SAGE = '3F6F52';
const DEEP = '294C39';
const SOFT = 'E7EFE9';
const CREAM = 'FAF7F2';
const INK = '2C2A26';
const MUTED = '6F6A61';
const CLAY = 'C4643C';
const CLAY_SOFT = 'FBEEE7';
const LINE = 'E6E0D6';

const HEAD = 'Cambria';
const BODY = 'Calibri';

const card = () => ({ type: 'outer', color: '9A9384', blur: 12, offset: 2, angle: 90, opacity: 0.18 });

(async () => {
  const I = {
    mail: await icon('FiMail', 'FFFFFF'),
    board: await icon('FiGrid', 'FFFFFF'),
    clock: await icon('FiClock', 'FFFFFF'),
    empty: await icon('FiAlertCircle', 'FFFFFF'),
    calendar: await icon('FiCalendar', 'FFFFFF'),
    tap: await icon('FiCheckCircle', 'FFFFFF'),
    user: await icon('FiUser', 'FFFFFF'),
    bell: await icon('FiBell', 'FFFFFF'),
    sun: await icon('FiSunrise', 'FFFFFF'),
    ahead: await icon('FiCalendar', 'FFFFFF'),
    gap: await icon('FiAlertCircle', 'FFFFFF'),
    nudge: await icon('FiUserPlus', 'FFFFFF'),
    send: await icon('FiSend', 'FFFFFF'),
    eye: await icon('FiEye', 'FFFFFF'),
  };

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';               // 13.333 x 7.5
  pres.author = 'Burlington Montessori School';
  pres.title = 'Snack Days';

  const W = 13.333;

  /* ---------------------------------------------------------- slide 1 */
  const s1 = pres.addSlide();
  s1.background = { color: DEEP };

  s1.addText('Snack Days', {
    x: 0.9, y: 2.15, w: 8.5, h: 1.0, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 54, bold: true, color: 'FFFFFF',
  });
  s1.addText('Replacing the snack whiteboard at Burlington Montessori School', {
    x: 0.9, y: 3.15, w: 8.2, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 19, color: SOFT,
  });
  s1.addText('A sign-up sheet that remembers, and reminds.', {
    x: 0.9, y: 3.75, w: 8.2, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, italic: true, color: '9DBFAB',
  });

  const stats = [
    ['61', 'children'],
    ['3', 'classrooms'],
    ['81', 'parent accounts'],
  ];
  stats.forEach(([n, label], i) => {
    const x = 0.9 + i * 2.5;
    s1.addText(n, {
      x, y: 5.25, w: 2.2, h: 0.7, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF',
    });
    s1.addText(label, {
      x, y: 5.95, w: 2.2, h: 0.35, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: '9DBFAB',
    });
  });

  // A quiet nod to the product: one claimed day, on a dark ground.
  s1.addShape(pres.ShapeType.roundRect, {
    x: 9.7, y: 2.3, w: 2.9, h: 2.5, rectRadius: 0.18,
    fill: { color: SAGE }, line: { color: '4F8463', width: 1 },
  });
  s1.addText('Wed', {
    x: 9.95, y: 2.55, w: 2.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, color: 'BFD6C7',
  });
  s1.addText('16', {
    x: 9.95, y: 2.85, w: 2.4, h: 0.9, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 52, bold: true, color: 'FFFFFF',
  });
  s1.addText('Amelia', {
    x: 9.95, y: 3.8, w: 2.4, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 20, bold: true, color: 'FFFFFF',
  });
  s1.addText('is bringing snacks', {
    x: 9.95, y: 4.2, w: 2.4, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, color: 'BFD6C7',
  });

  s1.addNotes('Snack days at BMS run on a whiteboard and a lot of email. This is what replaced it.');

  /* ---------------------------------------------------------- slide 2 */
  const s2 = pres.addSlide();
  s2.background = { color: CREAM };
  s2.addText('What was going wrong', {
    x: 0.7, y: 0.55, w: 9, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: INK,
  });
  s2.addText('Four small frictions that added up to chased-down parents and empty snack days.', {
    x: 0.7, y: 1.3, w: 9.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: MUTED,
  });

  const problems = [
    [I.mail, 'Everything lived in email', 'Sign-ups, reminders and swaps all went out as email. Threads got buried, and a parent who missed one had no way to catch up.'],
    [I.board, 'The list was on a wall', 'You could only see the whiteboard by standing in front of it. Nobody knew what was free without asking the office.'],
    [I.clock, 'Nothing reminded anyone', 'Signing up in September for a day in November meant remembering it unaided. Some families simply forgot.'],
    [I.empty, 'Some days had nobody', 'A blank day was only noticed when it arrived — and by then the class had no snack.'],
  ];

  problems.forEach(([img, title, body], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.7 + col * 6.2;
    const y = 2.1 + row * 2.15;

    s2.addShape(pres.ShapeType.roundRect, {
      x, y, w: 5.75, h: 1.85, rectRadius: 0.12,
      fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card(),
    });
    s2.addShape(pres.ShapeType.ellipse, {
      x: x + 0.35, y: y + 0.35, w: 0.72, h: 0.72, fill: { color: CLAY }, line: { width: 0 },
    });
    s2.addImage({ data: img, x: x + 0.52, y: y + 0.52, w: 0.38, h: 0.38 });
    s2.addText(title, {
      x: x + 1.28, y: y + 0.36, w: 4.1, h: 0.4, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: INK,
    });
    s2.addText(body, {
      x: x + 1.28, y: y + 0.82, w: 4.15, h: 1.1, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED, lineSpacingMultiple: 1.15,
    });
  });

  s2.addNotes('The whiteboard was fine as a list. It just could not tell anyone anything.');

  /* ---------------------------------------------------------- slide 3 */
  const s3 = pres.addSlide();
  s3.background = { color: CREAM };
  s3.addText('One calendar, on every phone', {
    x: 0.7, y: 0.55, w: 11.5, h: 0.8, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: INK,
  });
  s3.addText('The whiteboard, but visible from the school run.', {
    x: 0.7, y: 1.3, w: 6.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: MUTED,
  });

  const points = [
    [I.calendar, 'See the whole term', 'Every snack day for the classroom, with school holidays already taken out.'],
    [I.tap, 'Take a day in one tap', 'No email, no asking the office. Free days are obvious; taken days show who has them.'],
    [I.user, "The child's name, not the parent's", 'Exactly what the whiteboard said — so the board still reads the way staff think.'],
  ];
  points.forEach(([img, title, body], i) => {
    const y = 2.1 + i * 1.55;
    s3.addShape(pres.ShapeType.ellipse, {
      x: 0.7, y: y + 0.02, w: 0.68, h: 0.68, fill: { color: SAGE }, line: { width: 0 },
    });
    s3.addImage({ data: img, x: 0.86, y: y + 0.18, w: 0.36, h: 0.36 });
    s3.addText(title, {
      x: 1.6, y, w: 5.4, h: 0.4, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: INK,
    });
    s3.addText(body, {
      x: 1.6, y: y + 0.42, w: 5.5, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED, lineSpacingMultiple: 1.15,
    });
  });

  // A real month, drawn: five weekday columns, names in the taken cells.
  const CX = 7.9, CY = 2.0, CW = 0.88, CH = 0.72, G = 0.1;
  s3.addShape(pres.ShapeType.roundRect, {
    x: CX - 0.35, y: CY - 0.55, w: 5 * CW + 4 * G + 0.7, h: 4 * CH + 3 * G + 1.35,
    rectRadius: 0.14, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card(),
  });
  s3.addText('October', {
    x: CX - 0.1, y: CY - 0.42, w: 3, h: 0.32, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 15, bold: true, color: INK,
  });
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((d, i) => {
    s3.addText(d, {
      x: CX + i * (CW + G), y: CY - 0.02, w: CW, h: 0.26, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10, color: MUTED, align: 'center',
    });
  });

  const cells = [
    ['5', 'Open'], ['6', 'Open'], ['7', 'Bo'], ['8', 'Open'], ['9', 'Diya'],
    ['12', 'Closed'], ['13', 'Open'], ['14', 'Mateo'], ['15', 'Open'], ['16', 'Amelia'],
    ['19', 'Open'], ['20', 'Noor'], ['21', 'Open'], ['22', 'Open'], ['23', 'Closed'],
    ['26', 'Elif'], ['27', 'Open'], ['28', 'Open'], ['29', 'Zara'], ['30', 'Open'],
  ];
  cells.forEach(([day, label], i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const x = CX + col * (CW + G), y = CY + 0.32 + row * (CH + G);
    const closed = label === 'Closed';
    const open = label === 'Open';
    s3.addShape(pres.ShapeType.roundRect, {
      x, y, w: CW, h: CH, rectRadius: 0.08,
      fill: { color: closed ? CLAY_SOFT : open ? 'FFFFFF' : SOFT },
      line: { color: open ? LINE : closed ? 'F0D9CD' : 'CFE0D5', width: 1 },
    });
    s3.addText(day, {
      x, y: y + 0.06, w: CW, h: 0.26, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, align: 'center',
      color: closed ? CLAY : INK,
    });
    s3.addText(label, {
      x, y: y + 0.33, w: CW, h: 0.26, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9, align: 'center',
      color: closed ? CLAY : open ? MUTED : SAGE,
    });
  });

  s3.addNotes('School closures come from the published school calendar, so no snack day is ever scheduled on a day off.');

  /* ---------------------------------------------------------- slide 4 */
  const s4 = pres.addSlide();
  s4.background = { color: CREAM };
  s4.addText('And it does the chasing', {
    x: 0.7, y: 0.55, w: 8, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: INK,
  });
  s4.addText('The part a whiteboard could never do. Every message is sent once, automatically.', {
    x: 0.7, y: 1.3, w: 8.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: MUTED,
  });

  const reminders = [
    [I.sun, 'Your day is tomorrow', 'To the family who signed up, the evening before.'],
    [I.ahead, 'Your day is next week', "Enough notice to swap if it doesn't work."],
    [I.gap, 'Days still need a family', 'Only to families who have not taken a turn yet.'],
    [I.nudge, "You haven't signed up at all", 'A gentle weekly nudge, never to someone already booked.'],
  ];
  reminders.forEach(([img, title, body], i) => {
    const y = 2.05 + i * 1.15;
    s4.addShape(pres.ShapeType.ellipse, {
      x: 0.7, y: y + 0.06, w: 0.5, h: 0.5, fill: { color: SAGE }, line: { width: 0 },
    });
    s4.addImage({ data: img, x: 0.82, y: y + 0.18, w: 0.26, h: 0.26 });
    s4.addText(title, {
      x: 1.38, y, w: 5.6, h: 0.34, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK,
    });
    s4.addText(body, {
      x: 1.38, y: y + 0.36, w: 5.7, h: 0.42, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: MUTED,
    });
  });

  // A sample message, as a parent actually receives it.
  s4.addShape(pres.ShapeType.roundRect, {
    x: 7.9, y: 2.0, w: 4.7, h: 2.5, rectRadius: 0.14,
    fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, shadow: card(),
  });
  s4.addShape(pres.ShapeType.ellipse, {
    x: 8.2, y: 2.28, w: 0.42, h: 0.42, fill: { color: SAGE }, line: { width: 0 },
  });
  s4.addImage({ data: I.send, x: 8.31, y: 2.39, w: 0.2, h: 0.2 });
  s4.addText('Burlington Montessori School', {
    x: 8.75, y: 2.3, w: 3.6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: MUTED,
  });
  s4.addText(
    "Reminder — you're bringing snacks to Classroom 1 tomorrow (Wed, Oct 16): a dry snack and fruit. Thank you!",
    {
      x: 8.2, y: 2.85, w: 4.1, h: 1.1, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: INK, lineSpacingMultiple: 1.2,
    },
  );
  s4.addText('Sent by email today; by text once carrier registration clears.', {
    x: 8.2, y: 4.02, w: 4.1, h: 0.38, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, italic: true, color: MUTED,
  });

  s4.addShape(pres.ShapeType.roundRect, {
    x: 7.9, y: 4.75, w: 4.7, h: 1.5, rectRadius: 0.14,
    fill: { color: SOFT }, line: { width: 0 },
  });
  s4.addShape(pres.ShapeType.ellipse, {
    x: 8.2, y: 5.0, w: 0.5, h: 0.5, fill: { color: SAGE }, line: { width: 0 },
  });
  s4.addImage({ data: I.eye, x: 8.32, y: 5.12, w: 0.26, h: 0.26 });
  s4.addText('The office sees the gaps', {
    x: 8.85, y: 4.98, w: 3.5, h: 0.32, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 15, bold: true, color: INK,
  });
  s4.addText('Coverage per classroom, which days are still open, and which children have nothing booked.', {
    x: 8.85, y: 5.32, w: 3.5, h: 0.8, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: '4A6B57', lineSpacingMultiple: 1.1,
  });

  s4.addNotes('Nobody who has already taken a turn is ever nudged — that is what stops parents muting it.');

  /* ---------------------------------------------------------- slide 5 */
  const s5 = pres.addSlide();
  s5.background = { color: DEEP };
  s5.addText('Where it stands today', {
    x: 0.9, y: 0.75, w: 9, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF',
  });
  s5.addText('Live, with the full roster loaded from the school’s own spreadsheet.', {
    x: 0.9, y: 1.5, w: 9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, color: '9DBFAB',
  });

  const live = [
    ['81', 'parent accounts', 'imported from the contact sheet'],
    ['61', 'children', 'across three classrooms'],
    ['123', 'snack days', 'published to 6 November'],
  ];
  live.forEach(([n, label, sub], i) => {
    const x = 0.9 + i * 4.0;
    s5.addShape(pres.ShapeType.roundRect, {
      x, y: 2.25, w: 3.6, h: 1.85, rectRadius: 0.14,
      fill: { color: '31563F' }, line: { color: '406B4F', width: 1 },
    });
    s5.addText(n, {
      x: x + 0.35, y: 2.45, w: 3, h: 0.8, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 46, bold: true, color: 'FFFFFF',
    });
    s5.addText(label, {
      x: x + 0.35, y: 3.24, w: 3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, bold: true, color: SOFT,
    });
    s5.addText(sub, {
      x: x + 0.35, y: 3.54, w: 3.1, h: 0.4, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: '9DBFAB',
    });
  });

  s5.addText('Next', {
    x: 0.9, y: 4.6, w: 3, h: 0.4, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 20, bold: true, color: 'FFFFFF',
  });
  s5.addText(
    [
      { text: 'Open it to families and let the term fill itself in.', options: { bullet: true, breakLine: true } },
      { text: 'Ten families still need an email address before they can sign in.', options: { bullet: true, breakLine: true } },
      { text: 'Text messages switch on once carrier registration completes.', options: { bullet: true } },
    ],
    {
      x: 0.9, y: 5.05, w: 8.6, h: 1.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: SOFT, paraSpaceAfter: 8,
    },
  );

  s5.addNotes('Everything on this slide is live data from the running system, not a mock-up.');

  await pres.writeFile({ fileName: 'Snack Days.pptx' });
  console.log('written');
})();
