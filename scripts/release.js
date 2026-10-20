// Publishes a new version to GitHub. Installed copies pick it up through manifest.json's update_url on Zotero's
// next update check (about once a day, or Tools → Plugins → gear → Check for Updates).
// Usage: npm run release -- 0.2.0
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'musstafasnn/zotero-latin';
const XPI = 'zotero-latin.xpi';
const root = path.join(__dirname, '..');
const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
const file = (f) => path.join(root, f);
const readJSON = (f) => JSON.parse(fs.readFileSync(file(f), 'utf8'));
const writeJSON = (f, data) => fs.writeFileSync(file(f), JSON.stringify(data, null, 2) + '\n');
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  const i = x.findIndex((n, k) => n !== y[k]);
  return i >= 0 && x[i] > y[i];
};

const version = process.argv[2] || '';
const manifest = readJSON('addon/manifest.json');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Usage: npm run release -- <x.y.z>');
// Zotero ignores an update that is not newer than what is installed.
if (!newer(version, manifest.version)) throw new Error(`${version} is not newer than ${manifest.version}`);

run('npm', 'test');
manifest.version = version;
writeJSON('addon/manifest.json', manifest);
const pkg = readJSON('package.json');
pkg.version = version;
writeJSON('package.json', pkg);
run('npm', 'run', 'build');

run('git', 'add', 'addon/manifest.json', 'package.json');
run('git', 'commit', '-m', `Release v${version}`);
run('git', 'push');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
run('gh', 'release', 'create', `v${version}`, XPI, '--repo', REPO, '--target', sha, '--title', `v${version}`, '--generate-notes');

// Only now point updates.json at the release, so Zotero never sees a link whose file is not uploaded yet.
const { strict_min_version, strict_max_version } = manifest.applications.zotero;
const hash = createHash('sha256').update(fs.readFileSync(file(XPI))).digest('hex');
writeJSON('updates.json', {
  addons: {
    [manifest.applications.zotero.id]: {
      updates: [{
        version,
        update_link: `https://github.com/${REPO}/releases/download/v${version}/${XPI}`,
        update_hash: `sha256:${hash}`,
        applications: { zotero: { strict_min_version, strict_max_version } },
      }],
    },
  },
});
run('git', 'add', 'updates.json');
run('git', 'commit', '-m', `Point updates.json at v${version}`);
run('git', 'push');
