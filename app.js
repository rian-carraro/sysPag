// 1) Cole aqui os dados do seu projeto (Supabase > Project Settings > API)
const SUPABASE_URL = 'https://nibbouvcehnbqffbypmu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lYIrgCpt3ylKJoO6Ay9Upw_5uQPVIuP';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => new Date().toISOString().slice(0, 10);

const S = { user: null, me: null, profiles: [], cats: [], cards: [], pessoas: [], items: [], pags: [], mes: hoje().slice(0, 7), quem: 'todos', tab: 'lanc', tipo: 'avulsa' };

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
  const [c, k, pe] = await Promise.all([db.from('categorias').select('*').order('nome'), db.from('cartoes').select('*').order('nome'), db.from('pessoas').select('*').order('nome')]);
  S.cats = c.data || []; S.cards = k.data || []; S.pessoas = pe.data || [];
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
// Chave de "quem gastou": 'u:<login>', 'p:<pessoa sem login>' ou 'casal'
const quemKey = i => i.casal ? 'casal' : i.pessoa_id ? 'p:' + i.pessoa_id : 'u:' + i.usuario_id;
function quemInfo(key) {
  if (key === 'casal') return { nome: 'Casal', cls: 'casal' };
  const id = key.slice(2);
  if (key[0] === 'u') { const p = S.profiles.find(x => x.id === id); return { nome: p?.nome || '', cls: p?.cor || '' }; }
  return { nome: S.pessoas.find(x => x.id === id)?.nome || '', cls: 'pessoa' };
}
// Fatura do mês de cada cartão e o que é abatido: gastos do dono do cartão em cartões de OUTROS donos
function abatimentos() {
  const donoDe = id => S.cards.find(k => k.id === id)?.dono || null;
  const soma = arr => arr.reduce((t, i) => t + Number(i.valor), 0);
  return S.cards.map(k => {
    const fatura = soma(S.items.filter(i => i.cartao_id === k.id));
    const abat = k.dono ? soma(S.items.filter(i => i.cartao_id && quemKey(i) === k.dono && donoDe(i.cartao_id) && donoDe(i.cartao_id) !== k.dono)) : 0;
    return { k, fatura, abat, liquido: fatura - abat };
  });
}

// ---------- Parcelas ----------
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = iso => { const [y, m] = iso.split('-'); return MESES[m - 1] + '/' + y; };
function addMes(iso, n) {
  const [y, m, d] = iso.split('-').map(Number), t = (m - 1) + n, ny = y + Math.floor(t / 12), nm = t % 12;
  const ult = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
}
function linhasParcelas(v) {
  const n = Math.max(1, Math.min(60, parseInt(v.parcelas) || 1));
  const total = Math.round(parseFloat(v.valor) * 100), base = Math.floor(total / n);
  const grupo = n > 1 ? crypto.randomUUID() : null;
  return Array.from({ length: n }, (_, k) => ({
    descricao: v.descricao.trim(), valor: (k === n - 1 ? total - base * (n - 1) : base) / 100, data: addMes(v.data, k),
    usuario_id: v.quem.startsWith('u:') ? v.quem.slice(2) : S.me.id, casal: v.quem === 'casal', pessoa_id: v.quem.startsWith('p:') ? v.quem.slice(2) : null,
    categoria_id: v.categoria || null, cartao_id: S.tipo === 'cartao' ? v.cartao || null : null,
    ...(n > 1 ? { parcela_atual: k + 1, parcela_total: n, grupo_id: grupo } : {})
  }));
}
const parc = i => {
  if (!i.parcela_total) return '';
  const fim = mesAno(addMes(i.data, i.parcela_total - i.parcela_atual));
  return ` · <span class="parc">Parcela ${i.parcela_atual}/${i.parcela_total}</span> ${i.parcela_atual === i.parcela_total ? '· última' : '· termina em ' + fim}`;
};

// ---------- Telas ----------
function render() {
  const el = $('#conteudo');
  if (S.tab === 'lanc') el.innerHTML = telaLanc();
  else if (S.tab === 'pag') el.innerHTML = telaPag();
  else if (S.tab === 'pessoas') el.innerHTML = telaPessoas();
  else if (S.tab === 'cats') el.innerHTML = telaCats();
  else el.innerHTML = telaCartoes();
}

function telaLanc() {
  const lista = S.items.filter(i => S.quem === 'todos' || quemKey(i) === S.quem);
  const soma = arr => arr.reduce((t, i) => t + Number(i.valor), 0);
  const gasto = {}; S.items.forEach(i => gasto[i.categoria_id] = (gasto[i.categoria_id] || 0) + Number(i.valor));

  const totais = `<div class="totais">
    <div class="total"><small>Total do mês${S.quem !== 'todos' ? ' (filtro)' : ''}</small><b>${brl(soma(lista))}</b></div>
    <div class="total"><small>Entradas do mês</small><b>${brl(soma(S.pags))}</b></div>
    <div class="total"><small>Saldo do mês</small><b class="${soma(S.pags) - soma(S.items) < 0 ? 'neg' : ''}">${brl(soma(S.pags) - soma(S.items))}</b></div>
    ${S.profiles.map(p => `<div class="total ${p.cor}"><small>${esc(p.nome)}</small><b>${brl(soma(S.items.filter(i => quemKey(i) === 'u:' + p.id)))}</b></div>`).join('')}
    <div class="total casal"><small>Casal</small><b>${brl(soma(S.items.filter(i => i.casal)))}</b></div>
    ${S.pessoas.length ? `<div class="total pessoa"><small>Outras pessoas</small><b>${brl(soma(S.items.filter(i => i.pessoa_id)))}</b></div>` : ''}</div>`;

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
    <label>Quem gastou <select name="quem">${S.profiles.map(p => `<option value="u:${p.id}" ${p.id === S.me.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="casal">Casal</option>${S.pessoas.map(p => `<option value="p:${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
    <label>Descrição <input name="descricao" required maxlength="60" placeholder="Ex.: Mercado"></label>
    <label>Valor total (R$) <input name="valor" type="number" step="0.01" min="0.01" required inputmode="decimal"></label>
    <label>Parcelas (1 = à vista) <input name="parcelas" type="number" min="1" max="60" value="1" inputmode="numeric"></label>
    <p id="prev" class="mudo" style="margin-top:-.4rem"></p>
    <label>Data (da 1ª parcela) <input name="data" type="date" value="${hoje()}" required></label>
    <label>Categoria <select name="categoria"><option value="">Sem categoria</option>${S.cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
    ${S.tipo === 'cartao' ? `<label>Cartão <select name="cartao" required>${S.cards.length ? S.cards.map(k => `<option value="${k.id}">${esc(k.nome)}</option>`).join('') : '<option value="">Cadastre um cartão primeiro</option>'}</select></label>` : ''}
    <button class="btn" type="submit">Salvar lançamento</button>
  </form>`;

  const filtros = `<div class="filtros">
    <button class="pill ${S.quem === 'todos' ? 'on' : ''}" data-quem="todos">Todos</button>
    ${S.profiles.map(p => `<button class="pill ${p.cor} ${S.quem === 'u:' + p.id ? 'on' : ''}" data-quem="u:${p.id}">${esc(p.nome)}</button>`).join('')}
    <button class="pill casal ${S.quem === 'casal' ? 'on' : ''}" data-quem="casal">Casal</button>${S.pessoas.map(p => `<button class="pill pessoa ${S.quem === 'p:' + p.id ? 'on' : ''}" data-quem="p:${p.id}">${esc(p.nome)}</button>`).join('')}</div>`;

  const linhas = lista.map(i => {
    const q = quemInfo(quemKey(i)), c = S.cats.find(x => x.id === i.categoria_id), k = S.cards.find(x => x.id === i.cartao_id);
    const d = i.data.split('-').reverse().slice(0, 2).join('/');
    return `<div class="item"><span class="bolinha ${q.cls}"></span>
      <div class="info"><b>${esc(i.descricao)}</b><small>${d} · ${esc(c?.nome || 'Sem categoria')} · ${k ? esc(k.nome) : 'Avulsa'} · ${esc(q.nome)}${parc(i)}</small></div>
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
  const opts = sel => `<option value="">Sem dono</option>${S.profiles.map(p => `<option value="u:${p.id}" ${sel === 'u:' + p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}${S.pessoas.map(p => `<option value="p:${p.id}" ${sel === 'p:' + p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
  const linhas = abatimentos().map(({ k, fatura, abat, liquido }) => `<div class="linha"><span>${esc(k.nome)}</span>
      <select data-dono="${k.id}" aria-label="Dono de ${esc(k.nome)}">${opts(k.dono)}</select>
      <button class="x" data-del-card="${k.id}" aria-label="Excluir">✕</button></div>
    <p class="mudo cartao-res">Fatura do mês ${brl(fatura)}${k.dono ? ` · abatido ${brl(abat)} · <b>${liquido < 0 ? 'crédito ' + brl(-liquido) : 'a pagar ' + brl(liquido)}</b>` : ''}</p>`).join('') || '<p class="vazio">Nenhum cartão cadastrado.</p>';
  return `<div class="card"><h2>Cartões</h2>
    <p class="mudo">Escolha o dono de cada cartão. Quando o dono gasta no cartão de outra pessoa, esse valor é abatido da fatura do cartão dele no mês.</p>
    <form id="form-card" class="add"><input name="nome" placeholder="Ex.: Nubank Rosa" required maxlength="30"><button class="btn">Adicionar</button></form>
    ${linhas}</div>`;
}

function telaPessoas() {
  const soma = arr => arr.reduce((t, i) => t + Number(i.valor), 0);
  const cards = S.pessoas.map(p => {
    const its = S.items.filter(i => i.pessoa_id === p.id);
    const grupo = fn => {
      const m = {}; its.forEach(i => { const n = fn(i); m[n] = (m[n] || 0) + Number(i.valor); });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div class="linha"><span>${esc(n)}</span><b>${brl(v)}</b></div>`).join('') || '<p class="vazio">Nada neste mês.</p>';
    };
    return `<div class="card"><div class="linha"><span><b>${esc(p.nome)}</b></span><b class="valor">${brl(soma(its))}</b>
      <button class="x" data-del-pessoa="${p.id}" aria-label="Excluir">✕</button></div>
      <h3>Onde gastou</h3>${grupo(i => S.cards.find(k => k.id === i.cartao_id)?.nome || 'Conta avulsa')}
      <h3>Por categoria</h3>${grupo(i => S.cats.find(c => c.id === i.categoria_id)?.nome || 'Sem categoria')}
      <p style="margin:.75rem 0 0"><button class="pill" data-ver-pessoa="${p.id}">Ver lançamentos</button></p></div>`;
  }).join('');
  return `<div class="card"><h2>Pessoas</h2>
    <p class="mudo">Pessoas sem login (mãe, amigos...) para registrar quem gastou no seu cartão. Os valores são do mês selecionado.</p>
    <form id="form-pessoa" class="add"><input name="nome" placeholder="Nome (ex.: Mãe)" required maxlength="30"><button class="btn">Adicionar</button></form></div>${cards}`;
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
    if (await acao(db.from('lancamentos').insert(linhasParcelas(v)), 'Lançamento salvo')) {
      if (v.data.slice(0, 7) !== S.mes) { S.mes = v.data.slice(0, 7); $('#mes').value = S.mes; }
      carregarItens();
    }
  } else if (f.id === 'form-pag') {
    e.preventDefault();
    if (await acao(db.from('pagamentos').insert({ descricao: v.descricao.trim(), valor: v.valor, data: v.data, usuario_id: v.quem }), 'Pagamento salvo')) {
      if (v.data.slice(0, 7) !== S.mes) { S.mes = v.data.slice(0, 7); $('#mes').value = S.mes; }
      carregarItens();
    }
  } else if (f.id === 'form-pessoa') {
    e.preventDefault();
    if (await acao(db.from('pessoas').insert({ nome: v.nome.trim() }), 'Pessoa adicionada')) { S.pessoas = (await db.from('pessoas').select('*').order('nome')).data; render(); }
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
  else if (b.dataset.delItem) {
    const it = S.items.find(x => x.id === b.dataset.delItem);
    let q = db.from('lancamentos').delete();
    if (it?.grupo_id && confirm('Compra parcelada: excluir TODAS as parcelas? (Cancelar para escolher só esta)')) q = q.eq('grupo_id', it.grupo_id);
    else if (confirm('Excluir só este lançamento?')) q = q.eq('id', b.dataset.delItem);
    else return;
    if (await acao(q, 'Lançamento excluído')) carregarItens();
  }
  else if (b.dataset.delPag && confirm('Excluir este pagamento?')) { if (await acao(db.from('pagamentos').delete().eq('id', b.dataset.delPag), 'Pagamento excluído')) carregarItens(); }
  else if (b.dataset.verPessoa) {
    S.quem = 'p:' + b.dataset.verPessoa; S.tab = 'lanc';
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'lanc')); render();
  }
  else if (b.dataset.delPessoa && confirm('Excluir esta pessoa?')) {
    const id = b.dataset.delPessoa, { error } = await db.from('pessoas').delete().eq('id', id);
    if (error) return toast('Não dá para excluir: essa pessoa tem lançamentos.');
    await db.from('cartoes').update({ dono: null }).eq('dono', 'p:' + id);
    S.pessoas = S.pessoas.filter(p => p.id !== id); S.cards.forEach(k => { if (k.dono === 'p:' + id) k.dono = null; });
    if (S.quem === 'p:' + id) S.quem = 'todos'; render();
  }
  else if (b.dataset.delCat && confirm('Excluir categoria? Os lançamentos ficam sem categoria.')) { if (await acao(db.from('categorias').delete().eq('id', b.dataset.delCat), 'Categoria excluída')) { S.cats = S.cats.filter(c => c.id !== b.dataset.delCat); render(); } }
  else if (b.dataset.delCard && confirm('Excluir cartão? Os lançamentos viram contas avulsas.')) { if (await acao(db.from('cartoes').delete().eq('id', b.dataset.delCard), 'Cartão excluído')) { S.cards = S.cards.filter(k => k.id !== b.dataset.delCard); carregarItens(); } }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'tipo') {
    const v = Object.fromEntries(new FormData(t.form)); S.tipo = t.value; render();
    const f = $('#form-lanc'); ['quem', 'descricao', 'valor', 'parcelas', 'data', 'categoria'].forEach(k => { if (v[k] !== undefined) f.elements[k].value = v[k]; });
  }
  else if (t.dataset.dono) {
    if (await acao(db.from('cartoes').update({ dono: t.value || null }).eq('id', t.dataset.dono), 'Dono do cartão salvo')) { S.cards.find(k => k.id === t.dataset.dono).dono = t.value || null; render(); }
  }
  else if (t.dataset.meta) { if (await acao(db.from('categorias').update({ meta: t.value || 0 }).eq('id', t.dataset.meta), 'Meta salva')) S.cats.find(c => c.id === t.dataset.meta).meta = Number(t.value || 0); }
  else if (t.id === 'mes' && t.value) { S.mes = t.value; carregarItens(); }
});

document.addEventListener('input', e => {
  const f = e.target.form; if (!f || f.id !== 'form-lanc') return;
  const n = parseInt(f.parcelas.value) || 1, v = parseFloat(f.valor.value) || 0;
  $('#prev').textContent = n > 1 && v ? `${n}x de ${brl(v / n)} · última em ${mesAno(addMes(f.data.value || hoje(), n - 1))}` : '';
});
