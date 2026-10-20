/* global Zotero, document, window */
var ZoteroLatinPrefs = {
  init() {
    this.provider = document.getElementById('zotero-latin-provider');
    this.key = document.getElementById('zotero-latin-api-key');
    this.model = document.getElementById('zotero-latin-model');
    this.status = document.getElementById('zotero-latin-model-status');
    // Follows the pref rather than the menu, so a change made elsewhere (or before the pane opened) is picked up too.
    const observer = Zotero.Prefs.registerObserver('extensions.zotero-latin.provider', () => this.load(), true);
    window.addEventListener('unload', () => Zotero.Prefs.unregisterObserver(observer), { once: true });
    this.key.addEventListener('change', () => {
      this.set('apiKey', this.key.value.trim());
      this.loadModels();
    });
    this.model.addEventListener('change', () => this.set('model', this.model.value));
    document.getElementById('zotero-latin-base-url').addEventListener('change', () => this.loadModels());
    document.getElementById('zotero-latin-refresh').addEventListener('command', () => this.loadModels());
    document.getElementById('zotero-latin-update').addEventListener('command', (event) => this.checkForUpdates(event.target));
    this.load();
  },

  async checkForUpdates(button) {
    const status = document.getElementById('zotero-latin-update-status');
    button.disabled = true;
    status.textContent = 'Kontrol ediliyor…';
    try {
      status.textContent = await Zotero.ZoteroLatin.checkForUpdates();
    }
    catch (e) {
      status.textContent = e.message;
    }
    finally {
      button.disabled = false;
    }
  },

  seq: 0,

  get name() {
    return Zotero.Prefs.get('extensions.zotero-latin.provider', true) || 'gemini';
  },

  get(key) {
    return Zotero.Prefs.get(`extensions.zotero-latin.${key}.${this.name}`, true) || '';
  },

  set(key, value) {
    Zotero.Prefs.set(`extensions.zotero-latin.${key}.${this.name}`, value, true);
  },

  load() {
    this.key.value = this.get('apiKey');
    this.loadModels();
  },

  async loadModels() {
    const name = this.name;
    const token = ++this.seq;
    const current = this.get('model');
    this.status.textContent = 'Modeller yükleniyor…';
    this.model.replaceChildren();
    let models = [];
    let error = '';
    try {
      models = await Zotero.ZoteroLatin.listModels(name);
    }
    catch (e) {
      error = e.message;
    }
    // A newer load (another provider or key) started while this one was waiting.
    if (token !== this.seq) return;
    this.status.textContent = error || (models.length ? '' : 'Bu sağlayıcı model listesi vermedi.');

    const fallback = Zotero.ZoteroLatin.defaultModel(name);
    const options = [['', fallback ? `Varsayılan (${fallback})` : 'Model seçin']];
    if (current && !models.some((m) => m.id === current)) options.push([current, current]);
    for (const m of models) options.push([m.id, m.free ? `${m.id} (ücretsiz)` : m.id]);
    this.model.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElementNS('http://www.w3.org/1999/xhtml', 'option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
    this.model.value = current;
  },
};

// Pane scripts run in their own scope, so an onload attribute cannot see this object.
// Zotero dispatches a non-bubbling 'load' on the pane root after inserting it; catch it while capturing.
document.addEventListener('load', (event) => {
  if (event.target.id === 'zotero-latin-pane') ZoteroLatinPrefs.init();
}, true);
