// Pure logic shared by bootstrap.js (loaded with loadSubScript) and the node tests.
var ArabicLatin = (() => {
  const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  // Abstracts are prose that would need translation, not transliteration; extra is ours to leave alone.
  const SKIP_FIELDS = new Set(['abstractNote', 'extra']);
  const CREATOR_KEYS = ['name', 'lastName', 'firstName'];
  const HTML_ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/i;

  const PROMPT = `You transliterate Arabic-script bibliographic fields (titles, chapter titles, person names, publishers, places, series) written in Arabic, Persian or Ottoman Turkish into Latin script, in the simplified İSNAD style: the spelling of the TDV İslâm Ansiklopedisi (DİA) without dots.

Letters. Use only Turkish letters plus â î û ā ī ū. Never use ḥ ṣ ṭ ẓ ż ḍ ġ ḳ ḫ ʿ ʾ or any dot, hook or underline.
- ث س ص are s; ش is ş (bi-hâmişihî, Şerh); ذ ز ظ are z; ض is d (el-Beydâvî, Kādî); ح خ ه are h; ت ط are t; ق and ك are k; غ is g; پ is p; چ is ç; ژ is j; گ is g; consonantal و is v (Keykâvus, Mesnevî).
- Ayn: nothing at the start of a word (an, ilm, Ali, el-Arabî); everywhere else write ' (Sa'îd, Ca'fer, Mes'ûd, Ma'rifet, ta'rîf, el-Mar'aşlî, Şâfi'î).
- Hamza: nothing at the start of a word; between a consonant and a vowel write ' (te'vîl, Kur'ân, el-Muvatta'); next to a long vowel drop it (İhyâi, Akāid, Bedâiu, Acâib, Fevâid).

Vowels.
- Long vowels are â î û; after ق and غ write ā ī ū instead (Kādî, el-Kāmûs, Sagīr, Ukūl, Mahlûkāt, Vikāye).
- A short vowel takes its quality from the consonant before it: after ح خ ص ض ط ظ ع غ ق it is a / ı / u, after any other consonant, ر ن ت included, e / i / ü (Envârü't-tenzîl, İbnü'l-Arabî, Ahkâm, Avâlim, Fethu'l-Kadîr, Târîhu, Hadâiku, Menâzırü, Tabakātü; but Müstasfâ, Süyûtî, Şemâil, Mehâsin).
- A vowel right before ع is also a (Ma'rifet, Ma'ârif).
- Mark every long vowel, also in names that have a common Turkish spelling (Abdullâh, Abdürrahmân, Nâsıruddîn, Atâullâh).
- Fixed forms: Dâru in publisher names (Dâru İhyâi't-Turâsi'l-Arabî, Dâru'l-Fikr).

Arabic article and iḍāfa.
- The article is el-, assimilated before the sun letters ت ث د ذ ر ز س ش ص ض ط ظ ل ن (es-sahîh, eş-Şifâ, et-Taberî, ed-dîn, er-rivâye, en-Nesefî, ez-zühûr).
- In an iḍāfa chain every word but the last gets a case vowel and the article contracts onto it: the first word takes -ü/-u, the following words -i/-ı (İhyâü ulûmi'd-dîn, Câmi'u'l-beyân an te'vîli âyi'l-Kur'ân, Mukaddimetü İbni's-Salâh, Keşşâfü ıstılâhâti'l-fünûn, İrşâdü'l-akli's-selîm).
- A noun and its adjective share the ending (el-Kāmûsü'l-muhît, el-Câmi'u's-sahîh, el-Ahkâmü's-sultâniyye, Tabakātü'ş-Şâfi'iyyeti'l-kübrâ).
- tâ marbûta is -e/-a in pause and -tü/-ti in construct (er-Risâle, Vikāyetü'r-rivâye).
- و between words is ve (el-Milel ve'n-nihal, Yûsuf ve Züleyhâ); fî, an, alâ, li stay separate words (el-Fâik fî garîbi'l-hadîs); before the article fî and alâ shorten to fi and ale (el-İktisâd fi'l-i'tikād, er-Red ale'l-mantıkıyyîn).

Persian and Ottoman.
- Only a Persian or Ottoman phrase takes the Persian izafet: -ı/-i after a consonant, -yı/-yi after a vowel, also when it is not written; a final ۀ or ۂ marks it (Kitâb-ı Bahriyye, Dîvân-ı Kebîr, Hilye-i Hâkānî, Ahd-i Atîk, Fetâvâ-yı Ebüssuûd). An Arabic noun followed by another Arabic noun or a name is an Arabic iḍāfa with case vowels (Târîhu Dımaşk, Kitâbü Sîbeveyh).
- Compounds with nâme are written as one word (Siyâsetnâme, İlâhînâme, Câvîdnâme, Hıtâynâme, Menâkıbnâme).
- Turkish words keep their modern Turkish spelling (Efendi, Paşa, Gazavât-ı Hayreddin Paşa).

Faithfulness.
- Transliterate exactly the letters that are written. Never replace a name or word with a better-known similar one, and never translate.
- Every syllable has a vowel; never output a consonant cluster the Arabic word does not have.
- The last word of a title takes no case vowel (Fîhi mâ fîh, el-Câmi'u's-sagīr, Bedâiu'z-zühûr).

Names and form.
- ibn between two names is b.; at the start it is İbn (İbn Haldûn, İbn Hacer). Use the Turkish forms of names (Ebû, Abdullâh, Ömer, Mehmed).
- A string that starts with المؤلف: is an author's full name from a book card. Write it in the İSNAD bibliography form: the name he is known by (nisba, lakab or İbn X) without its article, a comma, then the rest of his name in the written order up to his father's name (leave out grandfathers, other nisbas and the death date), and last the article of the known name if it has one (Beydâvî, Nâsıruddîn Ebû Sa'îd Abdullâh b. Ömer el-; Gazzâlî, Ebû Hâmid Muhammed b. Muhammed el-; İbn Haldûn, Abdürrahmân b. Muhammed).
- Well-known places in their Turkish form (Beyrut, Kahire, Dımaşk, Bağdat).
- Capitalize the first word of a title and every proper name; the article stays lowercase (Kitâbü'l-ilm, el-Câbirî).
- Arabic-Indic digits become 0-9; text that is already in Latin script stays as is.

Input is a JSON array of strings. Output only a JSON array of the same length with the transliteration of each string, in order.`;

  const hasArabic = (s) => typeof s === 'string' && ARABIC.test(s);

  // Well-known authors in their DİA spelling, keyed by the Arabic (no article, no vowel marks). The model gets
  // these slightly wrong (Gazâlî, Tabarî); fixNames puts them right, but only when the Arabic really contains the name.
  const NAMES = [
    ['غزالي', 'Gazzâlî'], ['بخاري', 'Buhârî'], ['طبري', 'Taberî'], ['زمخشري', 'Zemahşerî'], ['رازي', 'Râzî'],
    ['قرطبي', 'Kurtubî'], ['بيضاوي', 'Beydâvî'], ['سيوطي', 'Süyûtî'], ['ترمذي', 'Tirmizî'], ['نسائي', 'Nesâî'],
    ['ماوردي', 'Mâverdî'], ['شافعي', "Şâfi'î"], ['سرخسي', 'Serahsî'], ['كاساني', 'Kâsânî'], ['نووي', 'Nevevî'],
    ['تيميه', 'Teymiyye'], ['ماتريدي', 'Mâtürîdî'], ['اشعري', "Eş'arî"], ['تفتازاني', 'Teftâzânî'], ['جرجاني', 'Cürcânî'],
    ['باقلاني', 'Bâkıllânî'], ['جويني', 'Cüveynî'], ['فارابي', 'Fârâbî'], ['كندي', 'Kindî'], ['خلدون', 'Haldûn'],
    ['سهروردي', 'Sühreverdî'], ['قشيري', 'Kuşeyrî'], ['هجويري', 'Hücvîrî'], ['حنيفه', 'Hanîfe'], ['شيباني', 'Şeybânî'],
    ['طحاوي', 'Tahâvî'], ['قدوري', 'Kudûrî'], ['مرغيناني', 'Mergīnânî'], ['عابدين', 'Âbidîn'], ['عسقلاني', 'Askalânî'],
    ['ذهبي', 'Zehebî'], ['بغوي', 'Begavî'], ['بيهقي', 'Beyhakī'], ['دارقطني', 'Dârekutnî'], ['واقدي', 'Vâkıdî'],
    ['بلاذري', 'Belâzürî'], ['مسعودي', "Mes'ûdî"], ['مقريزي', 'Makrîzî'], ['شاطبي', 'Şâtıbî'], ['قرافي', 'Karâfî'],
    ['امدي', 'Âmidî'], ['سيبويه', 'Sîbeveyhi'], ['مبرد', 'Müberred'], ['جوهري', 'Cevherî'], ['فيروزابادي', 'Fîrûzâbâdî'],
    ['زبيدي', 'Zebîdî'], ['منظور', 'Manzûr'], ['نسفي', 'Nesefî'], ['بزدوي', 'Pezdevî'], ['شوكاني', 'Şevkânî'],
    ['الوسي', 'Âlûsî'], ['ثعلبي', "Sa'lebî"], ['واحدي', 'Vâhidî'], ['سمرقندي', 'Semerkandî'], ['شهرستاني', 'Şehristânî'],
    ['سينا', 'Sînâ'], ['رشد', 'Rüşd'], ['كثير', 'Kesîr'], ['حجر', 'Hacer'], ['حزم', 'Hazm'], ['اثير', 'Esîr'],
    ['ماجه', 'Mâce'], ['مسلم', 'Müslim'], ['جوزي', 'Cevzî'], ['جوزيه', 'Cevziyye'], ['عطاء الله', 'Atâullâh'],
    // Spelled as the professor corrected them (long vowels marked).
    ['عبد الله', 'Abdullâh'], ['عبد الرحمن', 'Abdürrahmân'], ['ناصر الدين', 'Nâsıruddîn'],
  ];
  const normArabic = (s) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  // Spelling skeletons: one ignores marks and doubled letters (Gazâlî ~ Gazzâlî), the other also vowels (Tabarî ~ Taberî).
  const skeleton = (w) => w.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/'/g, '').replace(/(.)\1+/g, '$1');
  const consonants = (w) => skeleton(w).replace(/[aeiou]/g, '');
  const NAME_SKELETONS = NAMES.map(([ar, dia]) => ({ ar: normArabic(ar), dia, full: skeleton(dia), cons: consonants(dia) }));

  function fixNames(latin, arabic) {
    const source = normArabic(arabic);
    const names = NAME_SKELETONS.filter((n) => source.includes(n.ar));
    if (!names.length) return latin;
    return latin.replace(/\p{L}[\p{L}']*/gu, (word) => {
      const full = skeleton(word);
      const cons = consonants(word);
      const hit = names.find((n) => n.full === full || (n.cons.length >= 3 && n.cons === cons));
      if (!hit || word === hit.dia) return word;
      // Keep a lower-case word lower case: كثير in a title is often just "much" (el-hayru'l-kesîr).
      return word[0] === word[0].toLocaleUpperCase('tr') ? hit.dia : hit.dia.toLocaleLowerCase('tr');
    });
  }

  // Models sometimes slip into the dotted scientific transcription; the DİA heading style has none of it.
  const SCIENTIFIC = { ḥ: 'h', ḫ: 'h', ẖ: 'h', ṣ: 's', ṭ: 't', ẓ: 'z', ż: 'z', ḍ: 'z', ẕ: 'z', ġ: 'g', ḳ: 'k', ʿ: "'", ʾ: "'" };
  function simplify(s) {
    const plain = s.replace(/[ḥḫẖṣṭẓżḍẕġḳʿʾ]/gi, (c) => {
      const r = SCIENTIFIC[c.toLowerCase()];
      return c === c.toLowerCase() ? r : r.toUpperCase();
    });
    // Drop dots below, underlines and hooks (s̱, ḏ, Ẻ) but keep what Turkish needs: İ's dot above, ş/ç cedilla, â, ā.
    return plain.normalize('NFD').replace(/[\u0309\u0323\u0324\u0325\u032E\u0331]/g, '').normalize('NFC')
      // An ayn or hamza never starts a word (el-akli, not el-'akli).
      .replace(/(^|[\s-])'+/g, '$1')
      // The article is lower case and assimilates to a following sun letter: el-Taberî -> et-Taberî, 'l-zühûr -> 'z-zühûr.
      .replace(/(^|[\s(])El-/g, '$1el-')
      .replace(/(^|[\s(])el-([TtSsŞşDdZzRrNn])/g, (m, pre, c) => `${pre}e${c.toLowerCase()}-${c}`)
      .replace(/'l-([TtSsŞşDdZzRrNn])/g, (m, c) => `'${c.toLowerCase()}-${c}`)
      // A capital in the middle of a word is a slip (mesâHıf).
      .replace(/([a-zçğıöşüâîûāīū])([A-ZÇĞİÖŞÜÂÎÛĀĪŪ])/g, (m, a, b) => a + b.toLocaleLowerCase('tr'));
  }

  // item.toJSON() -> [{ field, text } | { creator, key, text }]
  function collect(json) {
    const entries = [];
    for (const [field, text] of Object.entries(json)) {
      if (!SKIP_FIELDS.has(field) && hasArabic(text)) entries.push({ field, text });
    }
    (json.creators || []).forEach((c, creator) => {
      for (const key of CREATOR_KEYS) {
        if (hasArabic(c[key])) entries.push({ creator, key, text: c[key] });
      }
    });
    return entries;
  }

  // İSNAD sorts Arab authors by the name they are known by, so the article goes to the end of the first name:
  // el-Gazzâlî, Ebû Hâmid -> Gazzâlî, Ebû Hâmid el- (the notes still read "Ebû Hâmid el-Gazzâlî").
  function moveArticle(lastName, firstName) {
    const m = /^(e[lştsdzrn])-(.+)$/u.exec(lastName);
    return m ? [m[2], `${firstName} ${m[1]}-`.trim()] : [lastName, firstName];
  }

  const turathBookId = (url) => /^https:\/\/app\.turath\.io\/book\/(\d+)/.exec(url || '')?.[1] || null;

  const ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
  const latinDigits = (s) => s.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);

  // api.turath.io/book response -> the book's fields from its card: text fields in Arabic, date as the card gives it
  // ("1418", "1998" or "1407/1987"; no year is computed), edition (empty for the first) and numberOfVolumes in Latin digits.
  function parseCard(body) {
    const info = body?.meta?.info;
    if (typeof info !== 'string') throw new Error('Türâs returned no book card');
    const lines = {};
    for (const line of info.split('\n')) {
      const i = line.indexOf(':');
      const key = line.slice(0, i).trim();
      if (i > 0 && !(key in lines)) lines[key] = line.slice(i + 1).trim();
    }
    const get = (re) => Object.entries(lines).find(([k, v]) => re.test(k) && v)?.[1] || '';
    const [publisher, place = ''] = get(/^الناشر$/).split(/\s+-\s+(?=[^-]*$)/);
    const printing = latinDigits(`${get(/^الطبعة$/)} ${get(/^سنة النشر$/)}`);
    const hijri = /(\d{3,4})\s*هـ/.exec(printing)?.[1];
    const greg = /(\d{4})\s*م(?![؀-ۿ])/.exec(printing)?.[1];
    const ordinal = ORDINALS.findIndex((o) => printing.includes(o)) + 1;
    const volumes = Array.isArray(body.indexes?.volumes) ? body.indexes.volumes.length : 0;
    return {
      title: get(/^الكتاب$/) || body.meta.name || '',
      // "(ت ٦٨٥هـ)", "(المتوفى: 685هـ)": the death date is no part of the name.
      author: get(/^المؤلف$/).replace(/\s*[([]\s*(?:ت\s|المتوفى)[^)\]]*[)\]]/g, '').trim(),
      editor: get(/^(المحقق|تحقيق|حققه|دراسة وتحقيق)$/),
      publisher: publisher.trim(),
      place: place.trim(),
      date: [hijri, greg].filter(Boolean).join('/'),
      edition: ordinal > 1 ? String(ordinal) : '',
      numberOfVolumes: /\d+/.exec(latinDigits(get(/^عدد الأجزاء$/)))?.[0] || (volumes > 1 ? String(volumes) : ''),
    };
  }

  // Texts of a card that go to the model; the author is marked so the prompt writes it in İSNAD order.
  const cardEntries = (card) => ['title', 'author', 'editor', 'publisher', 'place'].filter((k) => hasArabic(card[k]))
    .map((k) => ({ card: k, text: k === 'author' ? `المؤلف: ${card[k]}` : card[k] }));

  // Zotero fields and creators of the book, from a card and the model's latin for its cardEntries.
  function bookFromCard(card, entries, latin) {
    const t = { ...card };
    entries.forEach((e, i) => {
      t[e.card] = latin[i];
    });
    const creators = [];
    if (t.author) {
      const i = t.author.indexOf(', ');
      if (i > 0) {
        const [lastName, firstName] = moveArticle(t.author.slice(0, i), t.author.slice(i + 2));
        creators.push({ creatorType: 'author', lastName, firstName });
      }
      else creators.push({ creatorType: 'author', name: t.author });
    }
    // İSNAD's Zotero style prints the series editor as "thk.", so the muhakkik goes there.
    if (t.editor) creators.push({ creatorType: 'seriesEditor', name: t.editor });
    const { title, publisher, place, date, edition, numberOfVolumes } = t;
    // The page's address, access date and site description are not part of the book's citation.
    const fields = { title, publisher, place, date, edition, numberOfVolumes, url: '', accessDate: '', abstractNote: '', shortTitle: '' };
    return { fields, creators };
  }

  // Gemini generateContent body.
  function buildGeminiRequest(texts) {
    return {
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(texts) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    };
  }

  // OpenAI-compatible chat completions body (OpenAI, OpenRouter, Groq, NVIDIA, Ollama…).
  function buildChatRequest(texts, model) {
    return {
      model,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      temperature: 0,
    };
  }

  function parseGeminiResponse(body, texts) {
    const parts = body?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) throw new Error('Model returned no content');
    return validate(parts.filter((p) => !p.thought).map((p) => p.text || '').join(''), texts);
  }

  function parseChatResponse(body, texts) {
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Model returned no content');
    return validate(content, texts);
  }

  // Throws instead of returning partial results: a bad answer must leave the item untouched.
  function validate(content, texts) {
    // Reasoning models may prepend <think>…</think> or wrap the array in a code fence.
    const text = content.replace(/<think>[\s\S]*?<\/think>/g, '');
    const out = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    if (!Array.isArray(out) || out.length !== texts.length) {
      throw new Error(`Model returned ${Array.isArray(out) ? out.length : 'no'} results for ${texts.length} inputs`);
    }
    return out.map((s, i) => {
      // HTML entities (&acirc;) have been seen in real answers; they must never reach the item.
      if (typeof s !== 'string' || !s.trim() || hasArabic(s) || HTML_ENTITY.test(s) || s.length > texts[i].length * 4 + 50) {
        throw new Error(`Model returned an unusable result for input ${i + 1}`);
      }
      return fixNames(simplify(s.trim()), texts[i]);
    });
  }

  const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  const UNDO_ATTR = /\bdata-zotero-latin="([^"]*)"/;

  // rows: [[label, arabicText]]; undo: the applied entries with their latin, kept machine-readable for undo().
  function noteHTML(rows, undo) {
    const body = rows.map(([label, text]) => `<tr><th>${escapeHTML(label)}</th><td dir="rtl">${escapeHTML(text)}</td></tr>`);
    return `<h2 data-zotero-latin="${escapeHTML(JSON.stringify(undo))}">Arapça orijinal</h2><table>${body.join('')}</table>`;
  }

  // { field, text, latin } (field may be 'itemType'), { creator, key, text, latin }, or { creators: true, text, latin }
  // with the whole creator list as JSON.
  const validUndoEntry = (e) => typeof e?.text === 'string' && typeof e.latin === 'string'
    && (typeof e.field === 'string' || e.creators === true
      || (Number.isInteger(e.creator) && e.creator >= 0 && CREATOR_KEYS.includes(e.key)));

  // Undo entries stored by noteHTML, or null for any other note (or one whose data the note editor dropped).
  // Throws on data that is there but damaged.
  function readUndo(html) {
    const m = UNDO_ATTR.exec(html || '');
    if (!m) return null;
    const undo = JSON.parse(m[1].replace(/&#(\d+);/g, (s, code) => String.fromCharCode(code)));
    if (!Array.isArray(undo) || !undo.length || !undo.every(validUndoEntry)) throw new Error('Damaged zotero-latin undo data');
    return undo;
  }

  return { hasArabic, simplify, fixNames, collect, moveArticle, turathBookId, parseCard, cardEntries, bookFromCard, buildGeminiRequest, buildChatRequest, parseGeminiResponse, parseChatResponse, noteHTML, readUndo };
})();

if (typeof module === 'object') module.exports = ArabicLatin;
