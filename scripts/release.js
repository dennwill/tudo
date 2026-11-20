/*
 * release.js - `npm run release`, without having to hand electron-builder a token.
 *
 * electron-builder uploads a release to GitHub, and finds the key to do it in the
 * GH_TOKEN environment variable. Rather than keep a token of its own in a file or
 * in the system's settings, this borrows the one the GitHub CLI (`gh`) already
 * holds in the system keyring, for the length of this one run. So the only setup
 * is being signed in to `gh` (`gh auth login`), which also keeps the token fresh.
 *
 * A GH_TOKEN that is already set wins, which is also how a build server, which
 * has no `gh`, would give it one.
 *
 * Anything after the script's name replaces the usual arguments, so
 * `node scripts/release.js --win nsis --publish never` builds without uploading.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_ARGS = ['--win', 'nsis', '--publish', 'always'];

// The token to publish with, or an Error saying how to get one. Never printed.
// `exec` is how `gh` is run; it is a parameter only so that a test can stand in.
function findToken(env = process.env, exec = execFileSync) {
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    if (env[name] && env[name].trim()) return env[name].trim();
  }

  let token;
  try {
    token = exec('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'No GitHub token: GH_TOKEN is not set and the GitHub CLI (gh) is not installed.\n' +
          'Install it from https://cli.github.com and run `gh auth login`, or set GH_TOKEN.'
      );
    }
    throw new Error(
      'No GitHub token: GH_TOKEN is not set and `gh` is not signed in.\n' +
        'Run `gh auth login`, or set GH_TOKEN.'
    );
  }

  if (!token) {
    throw new Error('No GitHub token: `gh auth token` gave nothing. Run `gh auth login`.');
  }
  return token;
}

function run(argv) {
  const token = findToken();
  const args = argv.length ? argv : DEFAULT_ARGS;
  const builder = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');

  // The token goes to electron-builder through its environment, not its arguments,
  // which anyone on the machine could read from the process list.
  const result = spawnSync(process.execPath, [builder, ...args], {
    stdio: 'inherit',
    env: { ...process.env, GH_TOKEN: token },
  });
  if (result.error) throw result.error;
  return result.status === null ? 1 : result.status;
}

if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (err) {
    console.error(`release: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { findToken };
