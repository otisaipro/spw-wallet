// First-run flow: welcome → create | import → set password → done.
//
// On exit, calls onDone() with no args; the parent router reads vault state
// fresh and transitions to the unlocked main app.

import { generateMnemonic, validateMnemonic, mnemonicToKeys, keysToAccount, bip39Wordlist } from '../lib/spw.js';
import { createVault, unlock } from '../lib/vault.js';
import { $, el, clear, toast, copySensitive } from '../lib/ui.js';

const MIN_PWD = 8;

export function renderOnboarding(container, onDone) {
  function go(view) { clear(container); view(); }

  // ── Welcome ──
  function welcome() {
    container.appendChild(el('div', { class: 'screen center' }, [
      el('div', { class: 'logo' }, ['S']),
      el('h1', { style: 'margin-bottom:6px' }, ['SPW Wallet']),
      el('p', { style: 'margin-bottom:24px' }, ['Self-custody wallet for the SPW network. Your keys are encrypted on this device with your password — they never leave the browser.']),
      el('button', { class: 'btn', onclick: () => go(createIntro) }, ['Create a new wallet']),
      el('div', { style: 'height:10px' }),
      el('button', { class: 'btn btn-secondary', onclick: () => go(importIntro) }, ['Import existing wallet']),
    ]));
  }

  // ── Create flow ──
  let pendingMnemonic = null;
  let pendingAccount = null;

  function createIntro() {
    pendingMnemonic = generateMnemonic(bip39Wordlist, 128);
    const grid = el('div', { class: 'mnemonic-grid' },
      pendingMnemonic.split(' ').map((w, i) =>
        el('div', { class: 'word' }, [
          el('span', { class: 'num' }, [String(i + 1)]),
          document.createTextNode(w),
        ])
      ));
    container.appendChild(el('div', { class: 'screen' }, [
      el('h2', {}, ['Save your recovery phrase']),
      el('p', {}, ['These 12 words are the only way to restore your wallet. Anyone with them can access your funds. Write them down and store them somewhere safe.']),
      grid,
      el('div', { class: 'warn-card' }, ['⚠ Never share this phrase. SPW staff will never ask for it. Clipboard auto-clears 60 s after copying.']),
      el('button', {
        class: 'btn btn-secondary',
        style: 'margin-bottom:10px',
        onclick: () => copySensitive(pendingMnemonic, 60_000),
      }, ['Copy phrase (auto-clears in 60s)']),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => go(welcome) }, ['Back']),
        el('button', { class: 'btn', onclick: () => go(confirmMnemonic) }, ['I saved it']),
      ]),
    ]));
  }

  // Confirmation: pick 3 random word positions and ask the user to click the
  // correct word for each (with two random decoys). Beats the previous
  // "paste it all back" prompt — that one was trivially bypassable by
  // copy-paste, so it didn't actually confirm the user wrote anything down.
  function confirmMnemonic() {
    const words = pendingMnemonic.split(' ');
    const positions = pickThreeUniqueIndices(words.length);
    const challenges = positions.map(idx => ({
      idx,
      correct: words[idx],
      options: shuffle([
        words[idx],
        randomDifferentWord(bip39Wordlist, words[idx]),
        randomDifferentWord(bip39Wordlist, words[idx]),
      ]),
      picked: null,
    }));

    function render() {
      container.replaceChildren();
      container.appendChild(el('div', { class: 'screen' }, [
        el('h2', {}, ['Confirm your phrase']),
        el('p', {}, ['Click the correct word for each position. This proves you actually wrote the phrase down — copy-paste won\'t help here.']),
        ...challenges.map((c, i) => el('div', { class: 'field' }, [
          el('label', {}, [`Word #${c.idx + 1}`]),
          el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px' },
            c.options.map(opt => el('button', {
              class: 'btn ' + (c.picked === opt ? '' : 'btn-secondary'),
              style: 'padding:10px 8px;font-size:.84rem;font-weight:600',
              onclick: () => { c.picked = opt; render(); },
            }, [opt]))
          ),
        ])),
        el('div', { class: 'btn-row', style: 'margin-top:6px' }, [
          el('button', { class: 'btn btn-secondary', onclick: () => go(createIntro) }, ['Back']),
          el('button', {
            class: 'btn',
            disabled: challenges.every(c => c.picked) ? false : 'true',
            onclick: async () => {
              const allRight = challenges.every(c => c.picked === c.correct);
              if (!allRight) {
                toast('At least one word is wrong. Check your phrase and try again.');
                challenges.forEach(c => c.picked = null);
                render();
                return;
              }
              await deriveAndSetPassword(pendingMnemonic);
            },
          }, ['Continue']),
        ]),
      ]));
    }
    render();
  }

  function pickThreeUniqueIndices(n) {
    const set = new Set();
    while (set.size < 3) set.add(Math.floor(Math.random() * n));
    return [...set].sort((a, b) => a - b);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function randomDifferentWord(list, exclude) {
    while (true) {
      const w = list[Math.floor(Math.random() * list.length)];
      if (w !== exclude) return w;
    }
  }

  // ── Import flow ──
  function importIntro() {
    const inp = el('textarea', { placeholder: '12 or 24 words separated by spaces' });
    const errEl = el('div', { class: 'error hidden' });
    container.appendChild(el('div', { class: 'screen' }, [
      el('h2', {}, ['Import wallet']),
      el('p', {}, ['Enter your existing recovery phrase. Words must be in BIP-39 wordlist order, separated by single spaces.']),
      el('div', { class: 'field' }, [inp]),
      errEl,
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => go(welcome) }, ['Back']),
        el('button', {
          class: 'btn',
          onclick: async () => {
            const phrase = inp.value.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!validateMnemonic(phrase, bip39Wordlist)) {
              errEl.textContent = 'Phrase is not valid BIP-39. Check spelling and word count (12 or 24).';
              errEl.classList.remove('hidden');
              return;
            }
            await deriveAndSetPassword(phrase);
          }
        }, ['Continue']),
      ]),
    ]));
  }

  // ── Common: derive then ask for password ──
  async function deriveAndSetPassword(phrase) {
    container.appendChild(
      el('div', { class: 'screen', style: 'text-align:center;padding-top:60px' },
        [el('div', { class: 'spinner', style: 'transform:scale(2)' }), el('p', { style: 'margin-top:24px' }, ['Deriving keys…'])])
    );
    try {
      const { spendKey, viewKey } = await mnemonicToKeys(phrase);
      pendingAccount = keysToAccount(spendKey, viewKey, phrase);
    } catch (e) {
      go(welcome);
      toast('Key derivation failed: ' + e.message);
      return;
    }
    go(setPassword);
  }

  function setPassword() {
    const pw1 = el('input', { type: 'password', placeholder: 'New password (min 8 chars)' });
    const pw2 = el('input', { type: 'password', placeholder: 'Confirm password' });
    const errEl = el('div', { class: 'error hidden' });
    container.appendChild(el('div', { class: 'screen' }, [
      el('h2', {}, ['Set a password']),
      el('p', {}, ['Your wallet is encrypted with this password. We cannot recover it — if you forget it, you must restore from your recovery phrase.']),
      el('div', { class: 'field' }, [el('label', {}, ['Password']), pw1]),
      el('div', { class: 'field' }, [el('label', {}, ['Confirm']), pw2]),
      errEl,
      el('button', {
        class: 'btn',
        onclick: async (ev) => {
          const a = pw1.value, b = pw2.value;
          if (a.length < MIN_PWD) { errEl.textContent = `Password must be at least ${MIN_PWD} characters.`; errEl.classList.remove('hidden'); return; }
          if (a !== b) { errEl.textContent = "Passwords don't match."; errEl.classList.remove('hidden'); return; }
          ev.target.disabled = true;
          ev.target.textContent = 'Encrypting…';
          try {
            await createVault(pendingAccount, a);
            await unlock(a);
            toast('Wallet created');
            onDone();
          } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            errEl.classList.remove('hidden');
            ev.target.disabled = false;
            ev.target.textContent = 'Create wallet';
          }
        },
      }, ['Create wallet']),
    ]));
  }

  go(welcome);
}
