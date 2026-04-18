(function () {
  const CRS_URL = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
  const HEALTH_URL = "https://nucleo-crs-elayon.onrender.com/health";
  const TIMEOUT_MS = 45000;

  let activeStream = null;
  let activeRecognition = null;
  let recognitionRunning = false;
  let ttsActive = false;

  // --- Utilitários Internos ---
  function log(msg) {
    try {
      const box = document.getElementById("logTech");
      if (box) {
        box.textContent += `[TUNNEL ${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
      }
    } catch {}
  }

  function withTimeout(promise, timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout da requisição")), timeoutMs);
      promise.then((res) => { clearTimeout(timer); resolve(res); }).catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  function normalizeText(txt) {
    return (txt || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,;:!?-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function stripPhrases(txt, phrases = []) {
    let out = txt || "";
    phrases.forEach((p) => {
      if (!p) return;
      const normalizedP = normalizeText(p);
      const re = new RegExp(normalizedP.replace(/\s+/g, "[\\s,.!?;:-]*"), "gi");
      out = out.replace(re, " ");
    });
    return out.replace(/\s+/g, " ").trim();
  }

  function matchAny(text, phrases) {
    const normText = normalizeText(text);
    return phrases.some(p => normText.includes(normalizeText(p)));
  }

  async function getAccessToken() {
    try {
      if (!window.ELAYON_SUPABASE?.auth?.getSession) return null;
      const { data } = await window.ELAYON_SUPABASE.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }

  // --- Módulos do Sistema ---

  const tts = {
    async speak(text, options = {}) {
      return new Promise((resolve, reject) => {
        if (!("speechSynthesis" in window)) return reject(new Error("TTS indisponível"));
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = options.lang || "pt-BR";
        utter.rate = options.rate || 0.96;
        utter.onstart = () => { ttsActive = true; };
        utter.onend = () => { ttsActive = false; resolve({ ok: true }); };
        utter.onerror = (e) => { ttsActive = false; reject(e); };
        window.speechSynthesis.speak(utter);
      });
    },
    stop() { window.speechSynthesis.cancel(); ttsActive = false; },
    isActive() { return ttsActive; }
  };

  // 🎤 MICROFONE: MODO CAPTURA TOTAL
  const mic = {
    async open() {
      if (activeStream) return { ok: true };
      activeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      log("Microfone ativo - Modo Sanctum");
      return { ok: true };
    },
    close() {
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        activeStream = null;
        log("Microfone offline");
      }
    }
  };

  const stt = {
    // --- FUNÇÃO BASE DE ESCUTA CURTA ---
    async _listenOnceInternal(silenceMs = 3000, onPartial) {
      return new Promise((resolve, reject) => {
        const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!RecognitionCtor) return reject(new Error("STT não suportado"));

        const recognition = new RecognitionCtor();
        recognition.lang = "pt-BR";
        recognition.interimResults = true;
        recognition.continuous = false; // ⚠️ Modo curto proposital

        let textoFinal = "";
        let textoParcial = "";
        let timeoutId;

        const resetTimeout = () => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            recognition.stop();
            const finalText = (textoFinal + " " + textoParcial).trim();
            resolve({ text: finalText, finished: true });
          }, silenceMs);
        };

        recognition.onstart = resetTimeout;

        recognition.onresult = (event) => {
          textoFinal = "";
          textoParcial = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const trecho = event.results[i][0].transcript;
            if (event.results[i].isFinal) textoFinal += trecho + " ";
            else textoParcial += trecho + " ";
          }
          const textoCompleto = `${textoFinal}${textoParcial}`.trim();
          if (onPartial) onPartial({ text: textoCompleto });
          resetTimeout();
        };

        recognition.onerror = (e) => { clearTimeout(timeoutId); reject(e); };
        recognition.onend = () => { clearTimeout(timeoutId); resolve({ text: textoFinal.trim(), finished: false }); };

        recognition.start();
      });
    },

    // --- 🔥 LOOP INTELIGENTE (SOLUÇÃO DO PROBLEMA) ---
    async listenForPhrase({ stopPhrases = [], onPartial, silenceMs = 4000 } = {}) {
      log("🔁 Iniciando Loop Inteligente de Escuta");
      let textoAcumulado = "";
      let rodando = true;

      while (rodando) {
        try {
          const resultado = await this._listenOnceInternal(silenceMs, (dados) => {
            // Atualiza tela com texto vivo + acumulado
            if (onPartial) {
              onPartial({ 
                text: textoAcumulado + " " + dados.text,
                cleaned_text: stripPhrases(textoAcumulado + " " + dados.text, stopPhrases)
              });
            }
          });

          // Adiciona o trecho capturado
          if (resultado.text && resultado.text.length > 0) {
            textoAcumulado += " " + resultado.text;
            textoAcumulado = textoAcumulado.trim();
            log(`Trecho capturado: "${resultado.text.substring(0, 30)}..."`);
          }

          // Verifica se deve encerrar
          if (matchAny(textoAcumulado, stopPhrases)) {
            log("🛑 Comando de parada detectado!");
            rodando = false;
          }

        } catch (err) {
          log(`⚠️ Erro no ciclo: ${err.message}`);
          await new Promise(r => setTimeout(r, 300)); // Pequena pausa antes de reiniciar
        }
      }

      // Limpeza final
      const textoLimpo = stripPhrases(textoAcumulado, stopPhrases);
      log(`✅ Captura finalizada. Total: ${textoLimpo.length} chars`);

      return {
        ok: true,
        text: textoAcumulado.trim(),
        cleaned_text: textoLimpo
      };
    },

    async listenOnce(silence = 4000) {
      const res = await this._listenOnceInternal(silence);
      return { text: res.text, cleaned_text: res.text };
    },

    stop() {
      // Função de emergência
    }
  };

  // 📦 CRS: PAYLOAD PLUGÁVEL E RICO
  const crs = {
    buildPayload: function(texto, opcoes = {}) {
      const palavras = texto.split(' ').filter(w => w.length > 0).length;
      const caracteres = texto.length;
      const tempoEstimado = palavras > 0 ? (palavras / 2.2) : 5;
      
      return {
        transcript_raw: texto,
        context: opcoes.context || "",
        source_text: opcoes.source_text || texto,
        
        duration_sec: tempoEstimado,
        word_count: palavras,
        char_count: caracteres,
        density: palavras / (tempoEstimado || 1),
        
        silence_pct: 15,
        pause_count: Math.max(1, Math.floor(palavras / 8)),
        mean_pause_ms: 250,
        oscillation_pct: 15,
        stability_pct: 85,
        noise_pct: 3,
        energy_pct: 85,
        continuity_pct: 90
      };
    },
    async analyze(payload) {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      const res = await withTimeout(fetch(CRS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      }));
      return res.json();
    }
  };

  // --- Exportação Global ---
  window.ELAYON_TUNNEL = {
    healthcheck: async () => ({
      authenticated: !!(await getAccessToken()),
      stt: "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
      tts: "speechSynthesis" in window,
      crs: true
    }),
    tts,
    mic,
    stt,
    crs,
    utils: { normalizeText, stripPhrases, getAccessToken, matchAny }
  };
})();
