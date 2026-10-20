/* global Zotero, Services, ChromeUtils, ArabicLatin, setInterval, clearInterval */
const PREF = 'extensions.zotero-latin.';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PROVIDERS = {
  // Each Gemini model has its own free daily quota. On 150 DİA headings 3.1 Flash-Lite got 132 right in a few
  // seconds, 3.7 Flash about the same in minutes, 3.5 Flash-Lite clearly fewer; hence this order.
  gemini: { format: 'gemini', model: 'gemini-3.1-flash-lite', fallbacks: ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'] },
  openai: { url: 'https://api.openai.com/v1' },
  nvidia: { url: 'https://integrate.api.nvidia.com/v1', model: 'z-ai/glm-5.3-flash' },
  openrouter: { url: 'https://openrouter.ai/api/v1' },
  groq: { url: 'https://api.groq.com/openai/v1' },
  deepseek: { url: 'https://api.deepseek.com/v1' },
  mistral: { url: 'https://api.mistral.ai/v1' },
  ollama: { url: 'http://localhost:11434/v1' },
  custom: {},
};
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const ITEMS_PER_REQUEST = 10;
const RETRY_STATUSES = [429, 500, 503];
const RETRY_DELAY_MS = 30000;
const MENU_ID = 'zotero-latin-item-menu';
const FTL = 'zotero-latin.ftl';
const PREF_PANE_ID = 'zotero-latin-prefs';
const SPIN_MS = 120;
// Shown in the progress window, one per run in turn.
const MESSAGES = ['Dualarınızda bana da yer ayırın hocam :))', "Rasulullah'a ﷺ komşu olun inşaAllah"];

var queue = Promise.resolve();

// Problems the user can fix in the settings; the message is shown as is.
class SettingsError extends Error {}

function install() {}
function uninstall() {}

function startup({ id, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + 'translit.js');
  migrateSingleKey();
  // The settings pane script reaches the plugin through this object.
  Zotero.ZoteroLatin = { listModels, defaultModel: (name) => PROVIDERS[name]?.model || '', checkForUpdates: () => checkForUpdates(id) };
  Zotero.PreferencePanes.register({
    pluginID: id,
    id: PREF_PANE_ID,
    src: rootURI + 'prefs.xhtml',
    scripts: [rootURI + 'prefs-pane.js'],
    label: 'Arapça → Latin',
  });
  Zotero.MenuManager.registerMenu({
    menuID: MENU_ID,
    pluginID: id,
    target: 'main/library/item',
    menus: [{
      menuType: 'menuitem',
      l10nID: 'zotero-latin-menu',
      onShowing: (event, context) => context.setVisible((context.items || []).some((item) => jobFor(item))),
      onCommand: (event, context) => {
        const jobs = (context.items || []).map(jobFor).filter(Boolean);
        // Serialized so repeated clicks do not fire parallel requests into a free-tier rate limit.
        queue = queue.then(() => translate(jobs)).catch((e) => {
          Zotero.logError(e);
          notify('Beklenmeyen bir hata oluştu, kayıtlar değişmedi. Ayrıntı: Yardım → Hata Konsolu.');
        });
      },
    }, {
      menuType: 'menuitem',
      l10nID: 'zotero-latin-undo-menu',
      onShowing: (event, context) => context.setVisible((context.items || []).some((item) => undoNotes(item).length)),
      onCommand: (event, context) => {
        const items = context.items || [];
        queue = queue.then(() => undoAll(items)).catch((e) => {
          Zotero.logError(e);
          notify('Geri alınırken beklenmeyen bir hata oluştu. Ayrıntı: Yardım → Hata Konsolu.');
        });
      },
    }],
  });
  Zotero.MenuManager.registerMenu({
    menuID: 'zotero-latin-tools-menu',
    pluginID: id,
    target: 'main/menubar/tools',
    menus: [{ menuType: 'menuitem', l10nID: 'zotero-latin-settings-menu', onCommand: openSettings }],
  });
  Zotero.getMainWindows().forEach((window) => onMainWindowLoad({ window }));
}

function openSettings() {
  Zotero.Utilities.Internal.openPreferences(PREF_PANE_ID);
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded(FTL);
}

function onMainWindowUnload({ window }) {
  window.document.querySelector(`[href="${FTL}"]`)?.remove();
}

// Zotero drops the plugin's menus and preference pane on shutdown by itself.
function shutdown() {
  delete Zotero.ZoteroLatin;
  Zotero.getMainWindows().forEach((window) => onMainWindowUnload({ window }));
}

// 0.1 kept one key for every provider; move it to the provider it was used with.
function migrateSingleKey() {
  for (const name of ['apiKey', 'model']) {
    const legacy = Zotero.Prefs.get(PREF + name, true);
    if (legacy === undefined) continue;
    if (legacy && !providerPref(name)) Zotero.Prefs.set(`${PREF}${name}.${currentProvider()}`, legacy, true);
    Zotero.Prefs.clear(PREF + name, true);
  }
}

const pref = (name) => String(Zotero.Prefs.get(PREF + name, true) || '').trim();
const currentProvider = () => pref('provider') || 'gemini';
// API key and model are stored per provider, so switching providers keeps each one's settings.
const providerPref = (name, provider = currentProvider()) => pref(`${name}.${provider}`);

function jobFor(item) {
  if (!item.isRegularItem() || !item.library.editable) return null;
  const entries = ArabicLatin.collect(item.toJSON());
  return entries.length ? { item, entries } : null;
}

async function translate(jobs) {
  if (!jobs.length) return;
  let engine;
  try {
    engine = resolveEngine();
  }
  catch (e) {
    if (!(e instanceof SettingsError)) throw e;
    notify(e.message);
    openSettings();
    return;
  }

  const pw = new Zotero.ProgressWindow({ closeOnClick: false });
  pw.changeHeadline('Latin harflerine çevriliyor…');
  pw.show();
  pw.addDescription(nextMessage());
  for (const job of jobs) job.progress = new pw.ItemProgress(job.item.itemType, job.item.getDisplayTitle());
  // A cycling pie on every pending row, so a slow free-tier request still looks alive.
  let pct = 0;
  const spinner = setInterval(() => {
    pct = (pct % 95) + 5;
    for (const job of jobs) if (!job.finished) job.progress.setProgress(pct);
  }, SPIN_MS);

  let done = 0;
  const errors = new Set();
  const usedFallback = new Set();
  try {
    for (let i = 0; i < jobs.length; i += ITEMS_PER_REQUEST) {
      const batch = jobs.slice(i, i + ITEMS_PER_REQUEST);
      let latin;
      try {
        const result = await request(engine, batch.flatMap((j) => j.entries.map((e) => e.text)));
        latin = result.latin;
        if (result.model !== engine.models[0]) usedFallback.add(result.model);
      }
      catch (e) {
        Zotero.logError(e);
        errors.add(reason(e));
        for (const job of batch) finish(job, false);
        continue;
      }
      let k = 0;
      for (const job of batch) {
        await apply(job.item, job.entries, latin.slice(k, k += job.entries.length));
        finish(job, true);
        done++;
      }
    }
  }
  finally {
    clearInterval(spinner);
    for (const job of jobs) if (!job.finished) finish(job, false);
    pw.changeHeadline(done === jobs.length ? `${done} kayıt Latin harflerine çevrildi` : `${done}/${jobs.length} kayıt çevrildi`);
    for (const model of usedFallback) pw.addDescription(`İlk model kullanılamadı (kota/yoğunluk), ${model} ile çevrildi.`);
    for (const text of errors) pw.addDescription(text);
    pw.startCloseTimer(errors.size ? 15000 : 4000);
  }
}

function nextMessage() {
  const i = Number(Zotero.Prefs.get(PREF + 'messageIndex', true)) || 0;
  Zotero.Prefs.set(PREF + 'messageIndex', (i + 1) % MESSAGES.length, true);
  return MESSAGES[i % MESSAGES.length];
}

function finish(job, ok) {
  job.finished = true;
  if (ok) {
    job.progress.setText(job.item.getDisplayTitle());
    job.progress.setProgress(100);
  }
  else {
    job.progress.setError();
  }
}

function resolveEngine() {
  const name = currentProvider();
  const preset = PROVIDERS[name];
  if (!preset) throw new SettingsError('Ayarlarda sağlayıcı seçilmemiş: Ayarlar → Arapça → Latin.');
  const model = providerPref('model', name) || preset.model;
  if (!model) throw new SettingsError('Model seçilmemiş: Ayarlar → Arapça → Latin.');
  const models = [...new Set([model, preset.model, ...(preset.fallbacks || [])].filter(Boolean))];
  const apiKey = providerPref('apiKey', name);

  if (preset.format === 'gemini') {
    if (!apiKey) throw new SettingsError('API anahtarı girilmemiş: Ayarlar → Arapça → Latin.');
    return {
      models,
      url: (m) => GEMINI_API + encodeURIComponent(m) + ':generateContent',
      headers: { 'x-goog-api-key': apiKey },
      build: (texts) => ArabicLatin.buildGeminiRequest(texts),
      parse: ArabicLatin.parseGeminiResponse,
    };
  }

  const { base, local } = chatBase(preset);
  if (!apiKey && !local) throw new SettingsError('API anahtarı girilmemiş: Ayarlar → Arapça → Latin.');
  return {
    models,
    url: () => base + '/chat/completions',
    headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    build: (texts, m) => ArabicLatin.buildChatRequest(texts, m),
    parse: ArabicLatin.parseChatResponse,
  };
}

function chatBase(preset) {
  let url;
  try {
    url = new URL((preset.url || pref('baseURL')).replace(/\/+$/, ''));
  }
  catch (e) {
    throw new SettingsError('Sağlayıcı adresi geçersiz: Ayarlar → Arapça → Latin.');
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  // Never send a key over plain http to another machine.
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new SettingsError('Sağlayıcı adresi https:// ile başlamalı (bilgisayardaki yerel sunucu hariç).');
  }
  return { base: url.href.replace(/\/+$/, ''), local };
}

// Model list for the settings pane; free OpenRouter models first. Throws a user-readable Error.
async function listModels(name) {
  const preset = PROVIDERS[name];
  if (!preset) return [];
  const apiKey = providerPref('apiKey', name);
  try {
    if (preset.format === 'gemini') {
      if (!apiKey) throw new SettingsError('Modelleri görmek için önce API anahtarını girin.');
      const xhr = await Zotero.HTTP.request('GET', GEMINI_API + '?pageSize=1000', {
        headers: { 'x-goog-api-key': apiKey }, responseType: 'json', timeout: 20000,
      });
      return (xhr.response?.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), free: false }));
    }
    const { base } = chatBase(preset);
    const xhr = await Zotero.HTTP.request('GET', base + '/models', {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {}, responseType: 'json', timeout: 20000,
    });
    return (xhr.response?.data || [])
      .filter((m) => typeof m.id === 'string')
      .map((m) => ({ id: m.id, free: m.id.endsWith(':free') }))
      .sort((a, b) => b.free - a.free || a.id.localeCompare(b.id));
  }
  catch (e) {
    if (e instanceof SettingsError) throw new Error(e.message);
    Zotero.logError(e);
    throw new Error(reason(e));
  }
}

// Tries the models in order: quota, overload, a missing model or an unusable answer moves on to the next one.
// Returns { latin, model }.
async function request(engine, texts) {
  for (let i = 0; i < engine.models.length; i++) {
    const model = engine.models[i];
    const last = i === engine.models.length - 1;
    for (let attempt = 1; ; attempt++) {
      try {
        const xhr = await Zotero.HTTP.request('POST', engine.url(model), {
          headers: { 'Content-Type': 'application/json', ...engine.headers },
          body: JSON.stringify(engine.build(texts, model)),
          responseType: 'json',
          timeout: 180000,
        });
        return { latin: engine.parse(xhr.response, texts), model };
      }
      catch (e) {
        // A rejected key fails the same way on every model.
        const keyProblem = e.status >= 400 && e.status < 404;
        if (!last && !keyProblem) {
          Zotero.debug(`zotero-latin: ${model} failed (${e.status || e.message}), trying ${engine.models[i + 1]}`);
          break;
        }
        if (attempt >= 2 || !RETRY_STATUSES.includes(e.status)) throw e;
        await Zotero.Promise.delay(RETRY_DELAY_MS);
      }
    }
  }
  throw new Error('No model to try');
}

function reason(e) {
  if (e instanceof Zotero.HTTP.TimeoutException) return 'Sağlayıcı zamanında cevap vermedi, biraz sonra tekrar deneyin.';
  if (e.status === 0) return 'Sağlayıcıya bağlanılamadı: internet bağlantısını ve adresi kontrol edin.';
  if (e.status === 429) return 'Sağlayıcının kotası doldu, biraz sonra tekrar deneyin.';
  if (e.status === 404) return 'Model ya da adres bulunamadı (HTTP 404): ayarları kontrol edin.';
  if (e.status >= 400 && e.status < 500) return `Sağlayıcı isteği reddetti (HTTP ${e.status}): API anahtarını ve model adını kontrol edin.`;
  if (e.status) return `Sağlayıcıda hata oluştu (HTTP ${e.status}), biraz sonra tekrar deneyin.`;
  return 'Modelin cevabı kullanılamadı, tekrar deneyin ya da başka bir model seçin.';
}

async function apply(item, entries, latin) {
  if (item.deleted) return;
  const original = item.getCreatorsJSON();
  const creators = item.getCreatorsJSON();
  const rows = [];
  const applied = [];
  const changedCreators = new Set();

  entries.forEach((e, n) => {
    // Skip anything the user edited while the request was in flight.
    if (e.field) {
      if (item.getField(e.field) !== e.text) return;
      item.setField(e.field, latin[n]);
      rows.push([Zotero.ItemFields.getLocalizedString(e.field), e.text]);
      applied.push(e);
    }
    else if (creators[e.creator]?.[e.key] === e.text) {
      creators[e.creator][e.key] = latin[n];
      changedCreators.add(e.creator);
      applied.push(e);
    }
  });
  for (const i of changedCreators) {
    const c = original[i];
    rows.push([Zotero.CreatorTypes.getLocalizedString(c.creatorType), c.name || [c.lastName, c.firstName].filter(Boolean).join(', ')]);
  }
  if (!rows.length) return;

  item.setCreators(creators);
  // Read the latin back from the item: Zotero normalizes values on set, and undo compares against what is stored.
  const saved = item.getCreatorsJSON();
  const undo = applied.map((e) => ({ ...e, latin: e.field ? item.getField(e.field) : saved[e.creator][e.key] }));
  await Zotero.DB.executeTransaction(async () => {
    await item.save();
    const note = new Zotero.Item('note');
    note.libraryID = item.libraryID;
    note.parentID = item.id;
    note.setNote(ArabicLatin.noteHTML(rows, undo));
    await note.save();
  });
}

// [{ note, undo }] for the item's "Arapça orijinal" notes that still carry undo data.
function undoNotes(item) {
  if (!item.isRegularItem() || !item.library.editable) return [];
  return Zotero.Items.get(item.getNotes()).map((note) => ({ note, undo: undoData(note) })).filter((n) => n.undo);
}

function undoData(note) {
  try {
    return ArabicLatin.readUndo(note.getNote());
  }
  catch (e) {
    Zotero.logError(e);
    return null;
  }
}

async function undoAll(items) {
  let done = 0;
  let partial = 0;
  for (const item of items) {
    const notes = undoNotes(item);
    if (!notes.length) continue;
    if (await revert(item, notes)) done++;
    else partial++;
  }
  const lines = [];
  if (done) lines.push(`${done} kayıt Arapça haline döndürüldü.`);
  if (partial) lines.push(`${partial} kayıtta bazı alanlar çeviriden sonra değiştirildiği için olduğu gibi bırakıldı; "Arapça orijinal" notu duruyor.`);
  notify(lines.join(' '));
}

// Puts the Arabic back only where the field still holds our latin, so later edits by the user survive.
// The note goes to the trash only when every value came back. Returns true then.
async function revert(item, notes) {
  let complete = true;
  await Zotero.DB.executeTransaction(async () => {
    for (const { note, undo } of notes) {
      const creators = item.getCreatorsJSON();
      let all = true;
      for (const e of undo) {
        if (e.field) {
          if (item.getField(e.field) === e.latin) item.setField(e.field, e.text);
          else all = false;
        }
        else if (creators[e.creator]?.[e.key] === e.latin) creators[e.creator][e.key] = e.text;
        else all = false;
      }
      item.setCreators(creators);
      if (all) {
        note.deleted = true;
        await note.save();
      }
      complete = complete && all;
    }
    await item.save();
  });
  return complete;
}

// Asks manifest.json's update_url now instead of waiting for Zotero's daily check, and installs a newer version.
// Returns a message for the settings pane; throws a user-readable Error.
async function checkForUpdates(id) {
  try {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID(id);
    const install = await new Promise((resolve, reject) => {
      let found = null;
      addon.findUpdates({
        onUpdateAvailable: (a, i) => {
          found = i;
        },
        onUpdateFinished: (a, status) => (status === AddonManager.UPDATE_STATUS_NO_ERROR
          ? resolve(found)
          : reject(new Error(`zotero-latin update check failed with status ${status}`))),
      }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
    });
    if (!install) return `En güncel sürüm kurulu (${addon.version}).`;
    // Resolves once the new version has started, which also reloads this settings pane.
    await install.install();
    return `${install.version} sürümü kuruldu.`;
  }
  catch (e) {
    Zotero.logError(e);
    throw new Error('Güncelleme denetlenemedi: internet bağlantısını kontrol edip tekrar deneyin.');
  }
}

function notify(text) {
  const pw = new Zotero.ProgressWindow({ closeOnClick: true });
  pw.changeHeadline('Arapça → Latin');
  pw.addDescription(text);
  pw.show();
  pw.startCloseTimer(8000);
}
