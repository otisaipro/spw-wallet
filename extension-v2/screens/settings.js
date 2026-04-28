// Settings: reveal mnemonic (password-gated), change password, lock, reset.
// (Custom node URL was removed in v1.0 — host_permissions is fixed to
// spw.network so a runtime-changeable URL was misleading.)

import { lock, destroyVault, revealMnemonic, changePassword } from '../lib/vault.js';
import { el, clear, toast, copy, copySensitive, confirmModal, passwordPrompt } from '../lib/ui.js';
import { invalidate } from '../lib/chainCache.js';

export function renderSettings(container, router) {
  clear(container);

  function row(label, onclick, opts = {}) {
    return el('div', {
      class: 'setting-row' + (opts.danger ? ' danger' : ''),
      onclick,
    }, [
      el('div', { class: 'label' }, [label]),
      el('div', { class: 'arrow' }, ['›']),
    ]);
  }

  container.appendChild(el('div', {}, [
    el('div', { style: 'padding:14px 14px 8px' }, [
      el('h2', { style: 'font-size:1rem' }, ['Settings']),
    ]),

    row('Show recovery phrase', () => revealPhraseFlow(container, router)),
    row('Change password', () => changePasswordView(container, router)),
    row('Lock wallet', async () => {
      await lock();
      invalidate();
      toast('Locked');
      router.reload();
    }),
    row('Reset wallet (delete from this device)', () => resetWalletFlow(router), { danger: true }),

    el('div', { style: 'padding:18px 14px;color:var(--muted);font-size:.72rem;line-height:1.6' }, [
      'Node: ',
      el('span', { style: 'font-family:ui-monospace,monospace;color:var(--text)' }, ['spw.network/api']),
      el('br'),
      'Idle lock: 15 min',
      el('br'),
      el('br'),
      el('a', { href: 'https://spw.network', target: '_blank', rel: 'noopener' }, ['spw.network']),
      ' · ',
      el('a', { href: 'https://spw.network/privacy', target: '_blank', rel: 'noopener' }, ['Privacy']),
    ]),
  ]));
}

async function revealPhraseFlow(container, router) {
  const password = await passwordPrompt({
    title: 'Show recovery phrase',
    body: 'Enter your password to display the 12-word phrase. Anyone with this phrase can take your funds — keep it private.',
    confirmText: 'Reveal',
  });
  if (password == null) return;
  let mnemonic;
  try {
    mnemonic = await revealMnemonic(password);
  } catch (e) {
    toast(e.message === 'Wrong password' ? 'Wrong password' : 'Unable to reveal');
    return;
  }
  showPhrase(container, router, mnemonic);
}

function showPhrase(container, router, mnemonic) {
  clear(container);
  const grid = el('div', { class: 'mnemonic-grid' },
    mnemonic.split(' ').map((w, i) =>
      el('div', { class: 'word' }, [
        el('span', { class: 'num' }, [String(i + 1)]),
        document.createTextNode(w),
      ])
    ));
  container.appendChild(el('div', { class: 'screen' }, [
    el('h2', {}, ['Recovery phrase']),
    el('p', {}, ['Write these 12 words down and store them safely. Do not share them.']),
    grid,
    el('div', { class: 'warn-card' }, [
      'Anyone with this phrase can drain your wallet. The clipboard auto-clears 60 seconds after copying.',
    ]),
    el('button', {
      class: 'btn btn-secondary',
      onclick: () => copySensitive(mnemonic, 60_000),
    }, ['Copy phrase (auto-clears in 60s)']),
    el('div', { style: 'height:8px' }),
    el('button', { class: 'btn', onclick: () => router.go('settings') }, ['Done']),
  ]));
}

function changePasswordView(container, router) {
  clear(container);
  const cur = el('input', { type: 'password', placeholder: 'Current password' });
  const nw1 = el('input', { type: 'password', placeholder: 'New password' });
  const nw2 = el('input', { type: 'password', placeholder: 'Confirm new password' });
  const errEl = el('div', { class: 'error hidden' });
  container.appendChild(el('div', { class: 'screen' }, [
    el('h2', {}, ['Change password']),
    el('div', { class: 'field' }, [el('label', {}, ['Current']), cur]),
    el('div', { class: 'field' }, [el('label', {}, ['New']), nw1]),
    el('div', { class: 'field' }, [el('label', {}, ['Confirm new']), nw2]),
    errEl,
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn-secondary', onclick: () => router.go('settings') }, ['Cancel']),
      el('button', {
        class: 'btn',
        onclick: async () => {
          if (nw1.value.length < 8) {
            errEl.textContent = 'New password must be at least 8 chars';
            errEl.classList.remove('hidden'); return;
          }
          if (nw1.value !== nw2.value) {
            errEl.textContent = "Passwords don't match";
            errEl.classList.remove('hidden'); return;
          }
          try {
            await changePassword(cur.value, nw1.value);
            cur.value = ''; nw1.value = ''; nw2.value = '';
            toast('Password changed');
            router.go('settings');
          } catch (e) {
            errEl.textContent = 'Failed: ' + e.message;
            errEl.classList.remove('hidden');
          }
        },
      }, ['Change']),
    ]),
  ]));
}

async function resetWalletFlow(router) {
  const ok = await confirmModal({
    title: 'Reset this wallet?',
    body: 'This will erase the wallet from this device. Your funds are NOT deleted on the chain — but to access them again you will need your 12-word recovery phrase. Do you have it?',
    confirmText: 'Reset wallet',
    danger: true,
    requireTyping: 'RESET',
  });
  if (!ok) return;
  await destroyVault();
  invalidate();
  toast('Wallet wiped');
  router.reload();
}
