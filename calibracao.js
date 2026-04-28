/* ══════════════════════════════════════
   ELAYON · calibracao.js
   Lógica completa das 3 fases
══════════════════════════════════════ */

const FASES = [
  {
    label: 'Fase 01 · Presença',
    texto: `Bem-vindo, Piloto.\n\nVocê está entrando num espaço de percepção.\nNão há resposta certa. Há só o que é real agora.\n\nComo você chegou até aqui hoje?\nEstá bem? Há algo pesando?\n\nFale o tempo que precisar.\nO silêncio também faz parte.`
  },
  {
    label: 'Fase 02 · Intenção',
    texto: `Agora fale sobre o que te trouxe aqui.\n\nQual é o seu objetivo neste momento?\nO que você quer realizar?\nO que espera de si mesmo hoje?\n\nSeja direto. Seja honesto.\nNinguém avalia — o sistema apenas escuta.`
  },
  {
    label: 'Fase 03 · Comprometimento',
    texto: `Última etapa, Piloto.\n\nO que você está disposto a fazer diferente?\nOnde quer melhorar?\nQual compromisso você assume consigo mesmo agora?\n\nFale com intenção.\nEsse registro é seu.`
  }
];

/* ── Estado ── */
let fase      = 0;
let rec       = null;
let recAtivo  = false;
let chunks    = [];
let audios    = {};
let stream    = null;
let timerInt  = null;
let segundos  = 0;

/* ── Helpers DOM ── */
const el  = id => document.getElementById(id);
const log = (msg, cls) => {
  const b = el('logBox');
  const d = document.createElement('div');
  d.className = 'll ' + (cls || 'i');
  d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  b.appendChild(d);
  b.scrollTop = b.scrollHeight;
};

function setEstado(id) {
  ['eIniciar','eGravando','eConfirmar','eFinal'].forEach(e => {
    el(e).classList.add('hidden');
  });
  el(id).classList.remove('hidden');
}

function setPip(n) {
  [1,2,3].forEach(i => {
    const p = el('pip'+i);
    p.className = 'pip' + (i < n ? ' done' : i === n ? ' active' : '');
  });
}

function setWave(ativo) {
  document.querySelectorAll('.wave-bar').forEach(b => {
    ativo ? b.classList.add('on') : b.classList.remove('on');
  });
}

function fmt(s) {
  return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
}

/* ── Carregar fase ── */
function carregarFase(n) {
  fase = n;
  setPip(n);
  el('labelFase').textContent = FASES[n-1].label;
  el('textoFase').textContent = FASES[n-1].texto;
  el('micStatus').textContent = 'Pronto para gravar';
  el('timer').textContent     = '00:00';
  segundos = 0;
  setEstado('eIniciar');
  setWave(false);
  log('Fase ' + n + ' carregada', 'ok');
}

/* ── Iniciar gravação ── */
async function iniciar() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch(e) {
    log('Microfone negado: ' + e.message, 'er');
    return;
  }

  chunks = [];
  rec = new MediaRecorder(stream);
  rec.ondataavailable = ev => { if (ev.data.size > 0) chunks.push(ev.data); };
  rec.start(100);
  recAtivo = true;

  segundos = 0;
  timerInt = setInterval(() => {
    segundos++;
    el('timer').textContent = fmt(segundos);
  }, 1000);

  setWave(true);
  setEstado('eGravando');
  el('micStatus').textContent = 'Gravando...';
  log('Gravação iniciada — Fase ' + fase, 'ok');
}

/* ── Concluir gravação ── */
function concluir() {
  clearInterval(timerInt);
  recAtivo = false;

  rec.onstop = () => {
    audios[fase] = new Blob(chunks, { type: 'audio/webm' });
    log('Fase ' + fase + ' gravada — ' + fmt(segundos), 'ok');
  };

  rec.stop();
  stream.getTracks().forEach(t => t.stop());
  setWave(false);
  el('micStatus').textContent = 'Etapa concluída';
  setEstado('eConfirmar');
}

/* ── Confirmar ── */
function confirmar() {
  const blob = audios[fase];
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'elayon_f' + fase + '_' + Date.now() + '.webm';
    a.click();
    URL.revokeObjectURL(url);
    log('Áudio Fase ' + fase + ' salvo', 'ok');

    // ✅ AQUI É ONDE VOCÊ ADICIONA A CHAMADA
    enviarParaSupabase(fase, blob);
  }

  if (fase < 3) {
    carregarFase(fase + 1);
  } else {
    setPip(4);
    setEstado('eFinal');
    el('micStatus').textContent = 'Calibração completa';
    log('Todas as fases concluídas', 'ok');
  }
}


/* ── Refazer ── */
function refazer() {
  audios[fase] = null;
  log('Refazendo Fase ' + fase, 'i');
  carregarFase(fase);
}

/* ── Baixar todos ── */
function baixarTudo() {
  Object.entries(audios).forEach(([n, blob]) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'elayon_f' + n + '_' + Date.now() + '.webm';
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  carregarFase(1);

  el('btnIniciar').addEventListener('click', iniciar);
  el('btnConcluir').addEventListener('click', concluir);
  el('btnConfirmar').addEventListener('click', confirmar);
  el('btnRefazer').addEventListener('click', refazer);
  el('btnBaixar').addEventListener('click', baixarTudo);
  el('btnLimparLog').addEventListener('click', () => { el('logBox').innerHTML = ''; });
});

/* ── Enviar para o Supabase ── */
async function enviarParaSupabase(numeroFase, blob) {
  if (!userId) {
    log('Usuário não identificado, não foi possível enviar', 'er');
    return;
  }

  const caminho = `${userId}/fase${numeroFase}.webm`;
  log(`Enviando ${caminho}...`, 'i');

  try {
    const { data, error } = await supa.storage
      .from('calibracoes')
      .upload(caminho, blob, {
        contentType: 'audio/webm',
        upsert: true
      });

    if (error) {
      log(`Erro F${numeroFase}: ${error.message}`, 'er');
      throw error;
    }

    log(`F${numeroFase} salvo na nuvem ✅`, 'ok');

  } catch (e) {
    log(`Falha ao enviar F${numeroFase}`, 'er');
    console.error(e);
  }
}
