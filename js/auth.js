// Camada de autenticação sobre o Supabase Auth. O resto do app só conhece esta API.

import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let client;

async function sb() {
  if (!client) {
    const { createClient } = await import(SDK);
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

const MESSAGES = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com este e-mail. Tente entrar.',
  'Signup requires a valid password': 'Escolha uma senha válida.',
};

export function friendly(err) {
  const msg = err?.message ?? '';
  if (MESSAGES[msg]) return MESSAGES[msg];
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
  return 'Algo deu errado. Tente novamente.';
}

// Sessão atual (ou null). Falha de rede com sessão já salva não derruba o app.
export async function init() {
  try {
    const { data } = await (await sb()).auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

export async function signIn(email, password) {
  const { data, error } = await (await sb()).auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// Devolve { user } se já entrou, ou { needsConfirmation: true } se o projeto exige e-mail confirmado.
export async function signUp(email, password) {
  const { data, error } = await (await sb()).auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  // Com e-mail já cadastrado e confirmação ligada, o Supabase devolve user sem identidades.
  if (data.user && data.user.identities?.length === 0) throw { message: 'User already registered' };
  return data.session ? { user: data.user } : { needsConfirmation: true };
}

export async function resetPassword(email) {
  const { error } = await (await sb()).auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await (await sb()).auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  try {
    await (await sb()).auth.signOut();
  } catch {}
}

// Eventos: 'PASSWORD_RECOVERY' (clicou no link de redefinição) e 'SIGNED_OUT' (saiu em outra aba).
export async function onEvent(cb) {
  (await sb()).auth.onAuthStateChange((event) => cb(event));
}
