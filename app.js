// 1) Cole aqui os dados do seu projeto (Supabase > Project Settings > API)
const SUPABASE_URL = 'https://nibbouvcehnbqffbypmu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lYIrgCpt3ylKJoO6Ay9Upw_5uQPVIuP';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toISOString().slice(0, 10);

const S = { user: null, me: null, profiles: [], cats: [], cards: [], items: [], pags: [], mes: hoje().slice(0, 7), quem: 'todos', tab: 'lanc', tipo: 'avulsa' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2500);
}
function mostrar(id) { ['login', 'setup', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id)); }

// ---------- Login ----------
$('#form-login').addEventListener('submit', async e => {
  e.preventDefault(); $('#l-erro').textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-senha').value });
  if (error) $('#l-erro').textContent = 'E-mail ou senha incorretos.';
});
$('#sair').addEventListener('click', () => db.auth.signOut());
db.auth.onAuthStateChange((_, session) => { S.user = session?.user || null; S.user ? iniciar() : mostrar('login'); });

$('#form-setup').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await db.from('profiles').insert({ id: S.user.id, nome: $('#s-nome').value.trim(), cor: e.target.cor.value });
  if (error) { $('#s-erro').textContent = 'Não foi possível salvar. Tente de novo.'; return; }
  iniciar();
});

// ---------- Dados ----------
async function iniciar() {
  const { data: profs, error } = await db.from('profiles').select('*');
  if (error) return toast('Erro ao conectar. Confira a URL e a chave do Supabase.');
  S.profiles = profs; S.me = profs.find(p => p.id === S.user.id);
  if (!S.me) return mostrar('setup');
  $('#eu').textContent = S.me.nome; $('#eu').className = 'chip ' + S.me.cor;
  $('#mes').value = S.mes; mostrar('app');
  const [c, k] = await Promise.all([db.from('categorias').select('*').order('nome'), db.from('cartoes').select('*').order('nome')]);
  S.cats = c.data || []; S.cards = k.data || [];
  await carregarItens();
}
async function carregarItens() {
  const [a, m] = S.mes.split('-').map(Number);
  const fim = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const { data } = await db.from('lancamentos').select('*').gte('data', S.mes + '-01').lt('data', fim).order('data', { ascending: false }).order('criado_em', { ascending: false });
  S.items = data || [];
  const { data: p } = await db.from('pagamentos').select('*').gte('data', S.mes + '-01').lt('data', fim).order('data', { ascending: false }).order('criado_em', { ascending: false });
  S.pags = p || []; render();
}
const pessoa = id => S.profiles.find(p => p.id === id);

// ---------- Telas ----------
function render() {
  const el = $('#conteudo');
  if (S.tab === 'lanc') el.innerHTML = telaLanc();
  else if (S.tab === 'pag') el.innerHTML = telaPag();
  else if (S.tab === 'cats') el.innerHTML = telaCats();
  else el.innerHTML = telaCartoes();
}

function telaLanc() {
  const lista = S.items.filter(i => S.quem === 'todos' || (S.quem === 'casal' ? i.casal : !i.casal && i.usuario_id === S.quem));
  const soma = arr => arr.reduce((t, i) => t + Number(i.valor), 0);
  const gasto = {}; S.items.forEach(i => gasto[i.categoria_id] = (gasto[i.categoria_id] || 0) + Number(i.valor));

  const totais = `<div class="totais">
    <div class="total"><small>Total do mês${S.quem !== 'todos' ? ' (filtro)' : ''}</small><b>${brl(soma(lista))}</b></div>
    <div class="total"><small>Entradas do mês</small><b>${brl(soma(S.pags))}</b></div>
    <div class="total"><small>Saldo do mês</small><b class="${soma(S.pags) - soma(S.items) < 0 ? 'neg' : ''}">${brl(soma(S.pags) - soma(S.items))}</b></div>
    ${S.profiles.map(p => `<div class="total ${p.cor}"><small>${esc(p.nome)}</small><b>${brl(soma(S.items.filter(i => !i.casal && i.usuario_id === p.id)))}</b></div>`).join('')}
    <div class="total casal"><small>Casal</small><b>${brl(soma(S.items.filter(i => i.casal)))}</b></div></div>`;

  const metas = S.cats.filter(c => c.meta > 0).map(c => {
    const g = gasto[c.id] || 0, pct = Math.min(100, g / c.meta * 100);
    return `<div class="meta"><div class="meta-topo"><span>${esc(c.nome)}</span><span>${brl(g)} de ${brl(c.meta)}</span></div>
      <div class="barra"><i class="${g > c.meta ? 'es' : pct >= 80 ? 'al' : ''}" style="width:${pct}%"></i></div></div>`;
  }).join('') || '<p class="vazio">Defina metas na aba Categorias e metas.</p>';

  const form = `<form id="form-lanc" class="card">
    <h2>Novo lançamento</h2>
    <div class="tipo">
      <label><input type="radio" name="tipo" value="avulsa" ${S.tipo === 'avulsa' ? 'checked' : ''}>Conta avulsa</label>
      <label><input type="radio" name="tipo" value="cartao" ${S.tipo === 'cartao' ? 'checked' : ''}>Cartão</label>
    </div>
    <label>Quem gastou <select name="quem">${S.profiles.map(p => `<option value="${p.id}" ${p.id === S.me.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="casal">Casal</option></select></label>
    <label>Descrição <input name="descricao" required maxlength="60" placeholder="Ex.: Mercado"></label>
    <label>Valor (R$) <input name="valor" type="number" step="0.01" min="0.01" required inputmode="decimal"></label>
    <label>Data <input name="data" type="date" value="${hoje()}" required></label>
    <label>Categoria <select name="categoria"><option value="">Sem categoria</option>${S.cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
    ${S.tipo === 'cartao' ? `<label>Cartão <select name="cartao" required>${S.cards.length ? S.cards.map(k => `<option value="${k.id}">${esc(k.nome)}</option>`).join('') : '<option value="">Cadastre um cartão primeiro</option>'}</select></label>` : ''}
    <button class="btn" type="submit">Salvar lançamento</button>
  </form>`;

  const filtros = `<div class="filtros">
    <button class="pill ${S.quem === 'todos' ? 'on' : ''}" data-quem="todos">Todos</button>
    ${S.profiles.map(p => `<button class="pill ${p.cor} ${S.quem === p.id ? 'on' : ''}" data-quem="${p.id}">${esc(p.nome)}</button>`).join('')}
    <button class="pill casal ${S.quem === 'casal' ? 'on' : ''}" data-quem="casal">Casal</button></div>`;

  const linhas = lista.map(i => {
    const p = pessoa(i.usuario_id), c = S.cats.find(x => x.id === i.categoria_id), k = S.cards.find(x => x.id === i.cartao_id);
    const d = i.data.split('-').reverse().slice(0, 2).join('/');
    return `<div class="item"><span class="bolinha ${i.casal ? 'casal' : p?.cor || ''}"></span>
      <div class="info"><b>${esc(i.descricao)}</b><small>${d} · ${esc(c?.nome || 'Sem categoria')} · ${k ? esc(k.nome) : 'Avulsa'} · ${i.casal ? 'Casal' : esc(p?.nome || '')}</small></div>
      <span class="valor">${brl(i.valor)}</span><button class="x" data-del-item="${i.id}" aria-label="Excluir">✕</button></div>`;
  }).join('') || '<p class="vazio">Nenhum lançamento neste filtro.</p>';

  return `${totais}<div class="duas"><div class="stack">${form}<div class="card"><h2>Metas do mês</h2>${metas}</div></div>
    <div class="card"><h2>Lançamentos</h2>${filtros}${linhas}</div></div>`;
}

function telaPag() {
  const soma = arr => arr.reduce((t, i) => t + Number(i.valor), 0);
  const entradas = soma(S.pags), gastos = soma(S.items), saldo = entradas - gastos;
  const totais = `<div class="totais">
    <div class="total"><small>Entradas do mês</small><b>${brl(entradas)}</b></div>
    <div class="total"><small>Gastos do mês</small><b>${brl(gastos)}</b></div>
    <div class="total"><small>Saldo do mês</small><b class="${saldo < 0 ? 'neg' : ''}">${brl(saldo)}</b></div>
    ${S.profiles.map(p => `<div class="total ${p.cor}"><small>${esc(p.nome)} recebeu</small><b>${brl(soma(S.pags.filter(x => x.usuario_id === p.id)))}</b></div>`).join('')}</div>`;
  const form = `<form id="form-pag" class="card"><h2>Novo pagamento recebido</h2>
    <label>Descrição <input name="descricao" required maxlength="60" value="Salário"></label>
    <label>Valor (R$) <input name="valor" type="number" step="0.01" min="0.01" required inputmode="decimal"></label>
    <label>Data <input name="data" type="date" value="${hoje()}" required></label>
    <label>Quem recebeu <select name="quem">${S.profiles.map(p => `<option value="${p.id}" ${p.id === S.me.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
    <button class="btn" type="submit">Salvar pagamento</button></form>`;
  const linhas = S.pags.map(i => {
    const p = pessoa(i.usuario_id), d = i.data.split('-').reverse().slice(0, 2).join('/');
    return `<div class="item"><span class="bolinha ${p?.cor || ''}"></span>
      <div class="info"><b>${esc(i.descricao)}</b><small>${d} · ${esc(p?.nome || '')}</small></div>
      <span class="valor ent">+ ${brl(i.valor)}</span><button class="x" data-del-pag="${i.id}" aria-label="Excluir">✕</button></div>`;
  }).join('') || '<p class="vazio">Nenhum pagamento neste mês. Cadastre o salário ao lado.</p>';
  return `${totais}<div class="duas">${form}<div class="card"><h2>Pagamentos recebidos</h2>${linhas}</div></div>`;
}

function telaCats() {
  return `<div class="card"><h2>Categorias e metas mensais</h2>
    <p class="mudo">A meta vale para o casal todo. Deixe 0 para uma categoria sem meta.</p>
    <form id="form-cat" class="add"><input name="nome" placeholder="Nova categoria (ex.: Food)" required maxlength="30"><input name="meta" type="number" step="0.01" min="0" placeholder="Meta R$"><button class="btn">Adicionar</button></form>
    ${S.cats.map(c => `<div class="linha"><span>${esc(c.nome)}</span>
      <input type="number" step="0.01" min="0" value="${c.meta}" data-meta="${c.id}" aria-label="Meta de ${esc(c.nome)}">
      <button class="x" data-del-cat="${c.id}" aria-label="Excluir">✕</button></div>`).join('') || '<p class="vazio">Crie sua primeira categoria.</p>'}</div>`;
}

function telaCartoes() {
  return `<div class="card"><h2>Cartões</h2>
    <form id="form-card" class="add"><input name="nome" placeholder="Ex.: Nubank Rosa" required maxlength="30"><button class="btn">Adicionar</button></form>
    ${S.cards.map(k => `<div class="linha"><span>${esc(k.nome)}</span><button class="x" data-del-card="${k.id}" aria-label="Excluir">✕</button></div>`).join('') || '<p class="vazio">Nenhum cartão cadastrado.</p>'}</div>`;
}

// ---------- Ações ----------
async function acao(promessa, ok) {
  const { error } = await promessa;
  if (error) { toast('Algo deu errado. Tente novamente.'); return false; }
  if (ok) toast(ok); return true;
}

document.addEventListener('submit', async e => {
  const f = e.target, v = Object.fromEntries(new FormData(f));
  if (f.id === 'form-lanc') {
    e.preventDefault();
    if (await acao(db.from('lancamentos').insert({ descricao: v.descricao.trim(), valor: v.valor, data: v.data, usuario_id: v.quem === 'casal' ? S.me.id : v.quem, casal: v.quem === 'casal', categoria_id: v.categoria || null, cartao_id: S.tipo === 'cartao' ? v.cartao || null : null }), 'Lançamento salvo')) {
      if (v.data.slice(0, 7) !== S.mes) { S.mes = v.data.slice(0, 7); $('#mes').value = S.mes; }
      carregarItens();
    }
  } else if (f.id === 'form-pag') {
    e.preventDefault();
    if (await acao(db.from('pagamentos').insert({ descricao: v.descricao.trim(), valor: v.valor, data: v.data, usuario_id: v.quem }), 'Pagamento salvo')) {
      if (v.data.slice(0, 7) !== S.mes) { S.mes = v.data.slice(0, 7); $('#mes').value = S.mes; }
      carregarItens();
    }
  } else if (f.id === 'form-cat') {
    e.preventDefault();
    if (await acao(db.from('categorias').insert({ nome: v.nome.trim(), meta: v.meta || 0 }), 'Categoria criada')) { S.cats = (await db.from('categorias').select('*').order('nome')).data; render(); }
  } else if (f.id === 'form-card') {
    e.preventDefault();
    if (await acao(db.from('cartoes').insert({ nome: v.nome.trim() }), 'Cartão adicionado')) { S.cards = (await db.from('cartoes').select('*').order('nome')).data; render(); }
  }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) { S.tab = b.dataset.tab; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); render(); }
  else if (b.dataset.quem) { S.quem = b.dataset.quem; render(); }
  else if (b.dataset.delItem && confirm('Excluir este lançamento?')) { if (await acao(db.from('lancamentos').delete().eq('id', b.dataset.delItem), 'Lançamento excluído')) carregarItens(); }
  else if (b.dataset.delPag && confirm('Excluir este pagamento?')) { if (await acao(db.from('pagamentos').delete().eq('id', b.dataset.delPag), 'Pagamento excluído')) carregarItens(); }
  else if (b.dataset.delCat && confirm('Excluir categoria? Os lançamentos ficam sem categoria.')) { if (await acao(db.from('categorias').delete().eq('id', b.dataset.delCat), 'Categoria excluída')) { S.cats = S.cats.filter(c => c.id !== b.dataset.delCat); render(); } }
  else if (b.dataset.delCard && confirm('Excluir cartão? Os lançamentos viram contas avulsas.')) { if (await acao(db.from('cartoes').delete().eq('id', b.dataset.delCard), 'Cartão excluído')) { S.cards = S.cards.filter(k => k.id !== b.dataset.delCard); carregarItens(); } }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'tipo') {
    const v = Object.fromEntries(new FormData(t.form)); S.tipo = t.value; render();
    const f = $('#form-lanc'); ['quem', 'descricao', 'valor', 'data', 'categoria'].forEach(k => { if (v[k] !== undefined) f.elements[k].value = v[k]; });
  }
  else if (t.dataset.meta) { if (await acao(db.from('categorias').update({ meta: t.value || 0 }).eq('id', t.dataset.meta), 'Meta salva')) S.cats.find(c => c.id === t.dataset.meta).meta = Number(t.value || 0); }
  else if (t.id === 'mes' && t.value) { S.mes = t.value; carregarItens(); }
});
