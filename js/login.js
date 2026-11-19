// Tela de login: entrar, criar conta, recuperar senha e definir nova senha.

import * as auth from './auth.js';
import { $, h } from './dom.js';

const LOGO = 'icons/icon.svg';

// Mostra a tela e resolve com o usuário quando a pessoa entrar.
// mode: 'signin' | 'signup' | 'reset' | 'recovery' (nova senha após clicar no link do e-mail)
export function showLogin(mode = 'signin') {
  document.body.classList.add('auth');
  return new Promise((resolve) => {
    const state = { mode, busy: false, error: '', info: '', email: '' };

    const set = (patch) => { Object.assign(state, patch); draw(); };

    async function submit(e) {
      e.preventDefault();
      if (state.busy) return;
      const form = new FormData(e.target);
      const email = (form.get('email') || '').toString().trim();
      const password = (form.get('password') || '').toString();
      set({ busy: true, error: '', info: '' });
      try {
        if (state.mode === 'signin') {
          const user = await auth.signIn(email, password);
          return done(user);
        }
        if (state.mode === 'signup') {
          if (password !== form.get('password2')) return set({ busy: false, error: 'As senhas não são iguais.' });
          const res = await auth.signUp(email, password);
          if (res.user) return done(res.user);
          return set({ busy: false, mode: 'signin', info: `Enviamos um link de confirmação para ${email}. Confirme e depois entre.` });
        }
        if (state.mode === 'reset') {
          await auth.resetPassword(email);
          return set({ busy: false, mode: 'signin', info: `Se existir uma conta para ${email}, enviamos um link para redefinir a senha.` });
        }
        if (state.mode === 'recovery') {
          if (password !== form.get('password2')) return set({ busy: false, error: 'As senhas não são iguais.' });
          await auth.updatePassword(password);
          history.replaceState(null, '', location.pathname);
          return location.reload();
        }
      } catch (err) {
        set({ busy: false, error: auth.friendly(err) });
      }
    }

    function done(user) {
      document.body.classList.remove('auth');
      $('#view').replaceChildren();
      resolve(user);
    }

    const TITLES = {
      signin: ['Entrar', 'Seu armário, onde você estiver.'],
      signup: ['Criar conta', 'Leva um minuto.'],
      reset: ['Recuperar senha', 'Enviamos um link para o seu e-mail.'],
      recovery: ['Nova senha', 'Escolha uma senha nova para a sua conta.'],
    };

    function field(label, name, props) {
      return h('label', { class: 'field' }, h('span', { class: 'label' }, label),
        h('input', {
          name, required: true, disabled: state.busy, ...props,
          // o e-mail sobrevive aos redesenhos (erro, troca de modo); a senha é sempre limpa
          ...(name === 'email' && { value: state.email, onInput: (e) => { state.email = e.target.value; } }),
        }));
    }

    function draw() {
      const m = state.mode;
      const [title, sub] = TITLES[m];
      const link = (text, to) => h('button', { type: 'button', class: 'link', onClick: () => set({ mode: to, error: '', info: '' }) }, text);

      $('#view').replaceChildren(
        h('div', { class: 'auth-card' },
          h('img', { class: 'auth-logo', src: LOGO, alt: '', width: 64, height: 64 }),
          h('h2', {}, title),
          h('p', { class: 'hint' }, sub),
          h('form', { onSubmit: submit, novalidate: false },
            m !== 'recovery' && field('E-mail', 'email', { type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', placeholder: 'voce@exemplo.com' }),
            m !== 'reset' && field(m === 'recovery' ? 'Nova senha' : 'Senha', 'password', {
              type: 'password', minlength: 6, placeholder: m === 'signin' ? 'Sua senha' : 'Mínimo 6 caracteres',
              autocomplete: m === 'signin' ? 'current-password' : 'new-password' }),
            (m === 'signup' || m === 'recovery') && field('Repita a senha', 'password2', { type: 'password', minlength: 6, autocomplete: 'new-password' }),
            state.error && h('p', { class: 'msg error', role: 'alert' }, state.error),
            state.info && h('p', { class: 'msg ok', role: 'status' }, state.info),
            h('button', { class: 'btn primary block', type: 'submit', disabled: state.busy },
              state.busy ? 'Aguarde…' : { signin: 'Entrar', signup: 'Criar conta', reset: 'Enviar link', recovery: 'Salvar senha' }[m])),
          h('div', { class: 'auth-links' },
            m === 'signin' && [link('Criar conta', 'signup'), link('Esqueci a senha', 'reset')],
            (m === 'signup' || m === 'reset') && link('Voltar para entrar', 'signin'))));
    }
    draw();
  });
}
