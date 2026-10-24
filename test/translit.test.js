const test = require('node:test');
const assert = require('node:assert/strict');
const { hasArabic, simplify, fixNames, collect, moveArticle, turathBookId, parseCard, cardEntries, bookFromCard, buildGeminiRequest, buildChatRequest, parseGeminiResponse, parseChatResponse, noteHTML, readUndo } = require('../addon/translit.js');

const asText = (c) => (typeof c === 'string' ? c : JSON.stringify(c));
const gemini = (c) => ({ candidates: [{ content: { parts: [{ text: asText(c) }] } }] });
const chat = (c) => ({ choices: [{ message: { content: asText(c) } }] });

test('hasArabic', () => {
  assert.equal(hasArabic('إحياء علوم الدين'), true);
  assert.equal(hasArabic('İhyâü ulûmi\'d-dîn'), false);
  assert.equal(hasArabic(undefined), false);
});

test('collect picks Arabic fields and creators, skips abstract and extra', () => {
  const entries = collect({
    itemType: 'bookSection',
    title: 'كتاب العلم',
    bookTitle: 'إحياء علوم الدين',
    place: 'بيروت',
    date: '1990',
    abstractNote: 'نص طويل',
    extra: 'ملاحظة',
    tags: [{ tag: 'فقه' }],
    creators: [
      { creatorType: 'author', firstName: 'محمد', lastName: 'الغزالي' },
      { creatorType: 'editor', name: 'Smith' },
    ],
  });
  assert.deepEqual(entries, [
    { field: 'title', text: 'كتاب العلم' },
    { field: 'bookTitle', text: 'إحياء علوم الدين' },
    { field: 'place', text: 'بيروت' },
    { creator: 0, key: 'lastName', text: 'الغزالي' },
    { creator: 0, key: 'firstName', text: 'محمد' },
  ]);
});

test('buildGeminiRequest sends the texts as a JSON array', () => {
  const body = buildGeminiRequest(['المقدمة']);
  assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), ['المقدمة']);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('buildChatRequest sends model, system prompt and texts', () => {
  const body = buildChatRequest(['المقدمة'], 'some/model');
  assert.equal(body.model, 'some/model');
  assert.equal(body.messages[0].role, 'system');
  assert.deepEqual(JSON.parse(body.messages[1].content), ['المقدمة']);
});

test('parseGeminiResponse ignores thought parts', () => {
  const body = { candidates: [{ content: { parts: [{ thought: true, text: 'thinking' }, { text: '[" el-Mukaddime "]' }] } }] };
  assert.deepEqual(parseGeminiResponse(body, ['المقدمة']), ['el-Mukaddime']);
});

test('parseChatResponse strips think blocks and code fences', () => {
  const content = '<think>maybe [x]</think>\n```json\n["el-Mukaddime"]\n```';
  assert.deepEqual(parseChatResponse(chat(content), ['المقدمة']), ['el-Mukaddime']);
});

for (const [name, parse, wrap] of [['gemini', parseGeminiResponse, gemini], ['chat', parseChatResponse, chat]]) {
  test(`${name}: bad answers are rejected`, () => {
    assert.throws(() => parse({}, ['a']), /no content/);
    assert.throws(() => parse(wrap(['x', 'y']), ['a']), /2 results for 1/);
    assert.throws(() => parse(wrap(['المقدمة']), ['المقدمة']), /unusable/);
    assert.throws(() => parse(wrap(['']), ['المقدمة']), /unusable/);
    assert.throws(() => parse(wrap(['x'.repeat(200)]), ['ab']), /unusable/);
    assert.throws(() => parse(wrap(["İhy&acirc;&uuml; ul&ucirc;mi'd-d&icirc;n"]), ['إحياء علوم الدين']), /unusable/);
    assert.deepEqual(parse(wrap(['Ahmed & Sons']), ['أحمد']), ['Ahmed & Sons']);
    assert.throws(() => parse(wrap('not json'), ['a']), SyntaxError);
  });
}

test('simplify strips scientific transcription but keeps Turkish letters', () => {
  assert.equal(simplify("Mafâtîḥu'l-ġayb"), "Mafâtîhu'l-gayb");
  assert.equal(simplify("İrşâdü'l-ʿakli's-selîm"), "İrşâdü'l-akli's-selîm");
  assert.equal(simplify('Ḥ s̱ ẓ'), 'H s z');
  assert.equal(simplify('El-Muvatta\''), "el-Muvatta'");
  assert.equal(simplify('el-Taberî'), 'et-Taberî');
  assert.equal(simplify("Kitâbü'l-mesâHıf"), "Kitâbü'l-mesâhıf");
  assert.equal(simplify('KİTÂB'), 'KİTÂB');
  assert.equal(simplify("Bedâiu'l-zühûr"), "Bedâiu'z-zühûr");
  assert.equal(simplify("Câmiu'l-tevârîh"), "Câmiu't-tevârîh");
  for (const ok of ['el-Câbirî', "İhyâü ulûmi'd-dîn", "Câmiu'l-beyân", 'el-Kitâb', 'eş-Şifâ', 'Kādî İyâz', 'Çağ', "te'vîl", "Câmiu'l-beyân", 'Kitâb-ı Bahriyye', 'Sagīr Ukūl']) assert.equal(simplify(ok), ok);
});

test('parsers apply simplify', () => {
  assert.deepEqual(parseChatResponse({ choices: [{ message: { content: '["el-İḥkâm"]' } }] }, ['الإحكام']), ['el-İhkâm']);
});

test('fixNames corrects well-known names only when the Arabic has them', () => {
  assert.equal(fixNames('Ebû Hâmid Muhammed b. Muhammed el-Gazâlî', 'أبو حامد محمد بن محمد الغزالي'), 'Ebû Hâmid Muhammed b. Muhammed el-Gazzâlî');
  assert.equal(fixNames('et-Tabarî', 'الطبري'), 'et-Taberî');
  assert.equal(fixNames("Câmiu'l-beyân", 'جامع البيان'), "Câmiu'l-beyân");
  assert.equal(fixNames('el-Gazâlî', 'الغزي'), 'el-Gazâlî');
  assert.equal(fixNames("el-Hayru'l-kesir", 'الخير الكثير'), "el-Hayru'l-kesîr");
  assert.equal(fixNames('İbn Kesir', 'ابن كثير'), 'İbn Kesîr');
  assert.equal(fixNames('Fahreddin er-Razi', 'فخر الدين الرازي'), 'Fahreddin er-Râzî');
  assert.equal(fixNames("Muhammed Abdurrahmân el-Mar'aşlî", 'محمد عبد الرحمن المرعشلي'), "Muhammed Abdürrahmân el-Mar'aşlî");
  assert.equal(fixNames('Nâsırüddîn Ebû Saîd Abdullah', 'ناصر الدين أبو سعيد عبد الله'), 'Nâsıruddîn Ebû Saîd Abdullâh');
});

test('noteHTML escapes markup', () => {
  const html = noteHTML([['Başlık', '<img src=x onerror=alert(1)> & "q"']], [{ field: 'title', text: '"><img>', latin: 'x' }]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&#60;img src=x onerror=alert(1)&#62; &#38; &#34;q&#34;'));
  assert.match(html, /^<h2 data-zotero-latin="[^"<>]*">Arapça orijinal<\/h2>/);
});

test('readUndo round-trips the entries stored by noteHTML', () => {
  const undo = [
    { field: 'title', text: 'إحياء "علوم" الدين & <x>', latin: "İhyâü ulûmi'd-dîn" },
    { creator: 1, key: 'lastName', text: 'الغزالي', latin: 'el-Gazzâlî' },
  ];
  assert.deepEqual(readUndo(noteHTML([['Başlık', 'x']], undo)), undo);
});

test('readUndo ignores other notes and rejects damaged data', () => {
  assert.equal(readUndo('<h2>Arapça orijinal</h2><table></table>'), null);
  assert.equal(readUndo(''), null);
  assert.throws(() => readUndo('<h2 data-zotero-latin="not json">'), SyntaxError);
  assert.throws(() => readUndo(noteHTML([], [])), /Damaged/);
  assert.throws(() => readUndo(noteHTML([], [{ creator: 0, key: 'creatorType', text: 'a', latin: 'b' }])), /Damaged/);
  assert.throws(() => readUndo(noteHTML([], [{ field: 'title', text: 'a' }])), /Damaged/);
});

test('moveArticle puts the article at the end of the first name, as İSNAD sorts', () => {
  assert.deepEqual(moveArticle('el-Gazzâlî', 'Ebû Hâmid Muhammed'), ['Gazzâlî', 'Ebû Hâmid Muhammed el-']);
  assert.deepEqual(moveArticle('eş-Şâtıbî', ''), ['Şâtıbî', 'eş-']);
  assert.deepEqual(moveArticle('İbn Haldûn', 'Abdürrahmân'), ['İbn Haldûn', 'Abdürrahmân']);
  assert.deepEqual(moveArticle('Elmalılı', 'Hamdi'), ['Elmalılı', 'Hamdi']);
});

test('turathBookId reads only app.turath.io book pages', () => {
  assert.equal(turathBookId('https://app.turath.io/book/23588?page=582'), '23588');
  assert.equal(turathBookId('https://app.turath.io/search?mode=ai'), null);
  assert.equal(turathBookId('https://evil.example/app.turath.io/book/1'), null);
  assert.equal(turathBookId(''), null);
});

const BEYDAVI = {
  meta: {
    name: 'تفسير البيضاوي = أنوار التنزيل وأسرار التأويل',
    info: 'الكتاب: أنوار التنزيل وأسرار التأويل\nالمؤلف: ناصر الدين أبو سعيد عبد الله بن عمر بن محمد الشيرازي البيضاوي (ت ٦٨٥هـ)\nالمحقق: محمد عبد الرحمن المرعشلي\nالناشر: دار إحياء التراث العربي - بيروت\nالطبعة: الأولى - ١٤١٨ هـ\n[ترقيم الكتاب موافق للمطبوع]',
  },
  indexes: { volumes: ['1', '2', '3', '4', '5'] },
};

test('parseCard reads a Türâs book card', () => {
  assert.deepEqual(parseCard(BEYDAVI), {
    title: 'أنوار التنزيل وأسرار التأويل',
    author: 'ناصر الدين أبو سعيد عبد الله بن عمر بن محمد الشيرازي البيضاوي',
    editor: 'محمد عبد الرحمن المرعشلي',
    publisher: 'دار إحياء التراث العربي',
    place: 'بيروت',
    date: '1418',
    edition: '',
    numberOfVolumes: '5',
  });
  const lisan = parseCard({ meta: { info: 'الكتاب: لسان العرب\nالمؤلف: محمد بن مكرم بن على، أبو الفضل، جمال الدين ابن منظور الأنصاري الرويفعى الإفريقى (ت ٧١١هـ)\nالحواشي: لليازجي وجماعة من اللغويين\nالناشر: دار صادر - بيروت\nالطبعة: الثالثة - ١٤١٤ هـ\nعدد الأجزاء: ١٥' } });
  assert.equal(lisan.author, 'محمد بن مكرم بن على، أبو الفضل، جمال الدين ابن منظور الأنصاري الرويفعى الإفريقى');
  assert.deepEqual([lisan.date, lisan.edition, lisan.numberOfVolumes, lisan.editor], ['1414', '3', '15', '']);
  const keshshaf = parseCard({ meta: { name: 'x', info: 'الكتاب: الكشاف\nالمؤلف: محمود بن عمر بن أحمد الزمخشري [ت ٥٣٨ هـ]\n• وبهامشه أربعة كتب:\nالناشر: دار الكتاب العربي - بيروت\nالطبعة: الثالثة - ١٤٠٧ هـ - ١٩٨٧ م' } });
  assert.deepEqual([keshshaf.author, keshshaf.date, keshshaf.numberOfVolumes], ['محمود بن عمر بن أحمد الزمخشري', '1407/1987', '']);
  assert.equal(parseCard({ meta: { info: 'الطبعة: الأولى، ١٩٩٨ م' } }).date, '1998');
  const fath = parseCard({ meta: { info: 'الناشر: دار ابن كثير، دار الكلم الطيب - دمشق، بيروت' } });
  assert.deepEqual([fath.publisher, fath.place, fath.date], ['دار ابن كثير، دار الكلم الطيب', 'دمشق، بيروت', '']);
  assert.throws(() => parseCard({}), /no book card/);
});

test('cardEntries marks the author; bookFromCard builds the İSNAD book', () => {
  const card = parseCard(BEYDAVI);
  const entries = cardEntries(card);
  assert.deepEqual(entries.map((e) => e.card), ['title', 'author', 'editor', 'publisher', 'place']);
  assert.ok(entries[1].text.startsWith('المؤلف: '));
  const latin = ["Envârü't-tenzîl ve esrârü't-te'vîl", "Beydâvî, Nâsıruddîn Ebû Sa'îd Abdullâh b. Ömer el-",
    "Muhammed Abdürrahmân el-Mar'aşlî", "Dâru İhyâi't-Turâsi'l-Arabî", 'Beyrut'];
  assert.deepEqual(bookFromCard(card, entries, latin), {
    fields: {
      title: "Envârü't-tenzîl ve esrârü't-te'vîl", publisher: "Dâru İhyâi't-Turâsi'l-Arabî", place: 'Beyrut', date: '1418',
      edition: '', numberOfVolumes: '5', url: '', accessDate: '', abstractNote: '', shortTitle: '',
    },
    creators: [
      { creatorType: 'author', lastName: 'Beydâvî', firstName: "Nâsıruddîn Ebû Sa'îd Abdullâh b. Ömer el-" },
      { creatorType: 'seriesEditor', name: "Muhammed Abdürrahmân el-Mar'aşlî" },
    ],
  });
  // Without the comma the model's answer is kept whole, an article still moves when it does come split.
  assert.deepEqual(bookFromCard(card, entries, [latin[0], 'el-Beydâvî', ...latin.slice(2)]).creators[0], { creatorType: 'author', name: 'el-Beydâvî' });
  assert.deepEqual(bookFromCard(card, entries, [latin[0], 'el-Beydâvî, Abdullâh', ...latin.slice(2)]).creators[0],
    { creatorType: 'author', lastName: 'Beydâvî', firstName: 'Abdullâh el-' });
});

test('readUndo accepts book conversion entries', () => {
  const undo = [
    { field: 'itemType', text: 'webpage', latin: 'book' },
    { field: 'url', text: 'https://app.turath.io/book/23588?page=582', latin: '' },
    { creators: true, text: '[]', latin: '[{"creatorType":"author","lastName":"Beydâvî","firstName":"x el-"}]' },
  ];
  assert.deepEqual(readUndo(noteHTML([['Türâs', 'x']], undo)), undo);
  assert.throws(() => readUndo(noteHTML([], [{ creators: 1, text: '[]', latin: '[]' }])), /Damaged/);
});
