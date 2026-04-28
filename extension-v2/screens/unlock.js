// Password prompt shown when a vault exists but the session is locked.
// Calls onUnlock() after a successful unlock; onReset() if user wipes.

import { unlock, destroyVault } from '../lib/vault.js';
import { invalidate } from '../lib/chainCache.js';
import { el, clear, toast, confirmModal } from '../lib/ui.js';

export function renderUnlock(container, onUnlock, onReset) {
  clear(container);

  const pwInput = el('input', { type: 'password', placeholder: 'Password', autofocus: true });
  const errEl = el('div', { class: 'error hidden' });
  const submitBtn = el('button', { class: 'btn' }, ['Unlock']);

  async function attempt() {
    const pwd = pwInput.value;
    if (!pwd) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Unlocking…';
    errEl.classList.add('hidden');
    try {
      await unlock(pwd);
      pwInput.value = ''; // wipe the input field before navigating away
      onUnlock();
    } catch (e) {
      errEl.textContent = e.message || 'Wrong password';
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock';
      pwInput.focus();
      pwInput.select();
    }
  }

  submitBtn.addEventListener('click', attempt);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });

  container.appendChild(el('div', { class: 'screen center' }, [
    el('div', { class: 'logo' }, ['S']),
    el('h2', { style: 'margin-bottom:6px;text-align:center' }, ['Welcome back']),
    el('p', { style: 'text-align:center;margin-bottom:18px' }, ['Enter your password to unlock the wallet.']),
    el('div', { class: 'field' }, [pwInput]),
    errEl,
    submitBtn,
    el('div', { style: 'margin-top:20px;text-align:center' }, [
      el('a', {
        href: '#',
        style: 'font-size:.8rem',
        onclick: async (e) => {
          e.preventDefault();
          const ok = await confirmModal({
            title: 'Reset this wallet?',
            body: 'You will lose access to this wallet on this device. To restore, you will need your 12-word recovery phrase. Are you sure?',
            confirmText: 'Reset wallet',
            danger: true,
            requireTyping: 'RESET',
          });
          if (!ok) return;
          await destroyVault();
          invalidate();
          toast('Wallet wiped from this device');
          onReset();
        },
      }, ['Forgot password? Reset wallet']),
    ]),
  ]));

  setTimeout(() => pwInput.focus(), 50);
}
