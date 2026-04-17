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
          echoCancellation: false,   // ❌ DESLIGADO - Captura natural
          noiseSuppression: false,   // ❌ DESLIGADO - Mantém energia real
          autoGainControl: false    // ❌ DESLIGADO - Mantém dinâmica original
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
    async listenForPhrase({
      stopPhrases = [],
      onPartial,
      interimResults = true,
      continuous = true,
      silenceFailsafeMs = 999999999 // ♾️ TEMPO INFINITO - Só fecha na frase
    } = {}) {
      if (recognitionRunning) this.stop();

      return new Promise((resolve, reject) => {
        const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!RecognitionCtor) return reject(new Error("STT não suportado"));

        if (activeRecognition) {
          try { activeRecognition.stop(); } catch {}
        }

        const recognition = new RecognitionCtor();
        let textoFinal = "";
        let textoParcial = "";
        let finished = false;
        let failsafeTimer = null;

        const finish = (result) => {
          if (finished) return;
          finished = true;
          recognitionRunning = false;
          clearTimeout(failsafeTimer);
          try { recognition.stop(); } catch {}
          
          let textoLimpo = result.text || "";
          textoLimpo = textoLimpo.replace(/\b(\w+)\s+\1\b/gi, "$1");
          textoLimpo = textoLimpo.replace(/\s+/g, " ").trim();
          
          result.text = textoLimpo;
          result.cleaned_text = stripPhrases(textoLimpo, stopPhrases);
          
          resolve(result);
        };

        const refreshFailsafe = () => {
          clearTimeout(failsafeTimer);
          failsafeTimer = setTimeout(() => {
            const txtCompleto = (textoFinal + " " + textoParcial).trim();
            finish({ ok: true, text: txtCompleto, timed_out: true });
          }, silenceFailsafeMs);
        };

        recognition.lang = "pt-BR";
        recognition.interimResults = interimResults;
        recognition.continuous = continuous; // 🔁 CONTINUOUS ATIVO

        recognition.onstart = () => { 
          recognitionRunning = true; 
          refreshFailsafe(); 
        };
        
        recognition.onresult = (event) => {
          textoFinal = "";
          textoParcial = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const trecho = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              textoFinal += trecho + " ";
            } else {
              textoParcial += trecho + " ";
            }
          }

          const textoCompleto = `${textoFinal}${textoParcial}`.trim();
          
          if (onPartial) {
            let textoTela = textoCompleto.replace(/\b(\w+)\s+\1\b/gi, "$1");
            textoTela = textoTela.replace(/\s+/g, " ").trim();
            
            onPartial({ 
              text: textoTela, 
              cleaned_text: stripPhrases(textoTela, stopPhrases) 
            });
          }
          
          refreshFailsafe();

          const norm = normalizeText(textoCompleto);
          const matched = stopPhrases.find(p => norm.includes(normalizeText(p)));
          if (matched) {
            finish({ 
              ok: true, 
              text: textoCompleto, 
              matched_phrase: matched
            });
          }
        };

        recognition.onerror = (e) => { 
          recognitionRunning = false; 
          reject(e); 
        };
        
        recognition.onend = () => { 
          if (!finished) {
            const txtCompleto = (textoFinal + " " + textoParcial).trim();
            finish({ ok: true, text: txtCompleto });
          }
        };

        activeRecognition = recognition;
        recognition.start();
      });
    },

    async listenForAnyPhrase(phrases = [], silence = 15000) {
      return this.listenForPhrase({ stopPhrases: phrases, silenceFailsafeMs: silence });
    },

    async listenOnce(silence = 4000) {
      return this.listenForPhrase({ stopPhrases: [], silenceFailsafeMs: silence });
    },

    stop() {
      if (activeRecognition) { try { activeRecognition.stop(); } catch {} }
      recognitionRunning = false;
    }
  };

  // 📦 CRS: PAYLOAD PLUGÁVEL E RICO
  const crs = {
    buildPayload: function(texto, opcoes = {}) {
      // Análise básica para estruturar os dados
      const palavras = texto.split(' ').filter(w => w.length > 0).length;
      const caracteres = texto.length;
      const tempoEstimado = palavras > 0 ? (palavras / 2.2) : 5;
      
      // Métricas que servem para QUALQUER domínio
      return {
        transcript_raw: texto,
        context: opcoes.context || "",
        source_text: opcoes.source_text || texto,
        
        // Dados Temporais e Estruturais
        duration_sec: tempoEstimado,
        word_count: palavras,
        char_count: caracteres,
        density: palavras / (tempoEstimado || 1), // Palavras por segundo
        
        // Indicadores de Ritmo e Energia
        silence_pct: 15,       // Ajustável
        pause_count: Math.max(1, Math.floor(palavras / 8)),
        mean_pause_ms: 250,
        oscillation_pct: 15,   // Variação
        stability_pct: 85,     // Confiabilidade
        noise_pct: 3,          // Ruído de fundo
        energy_pct: 85,        // Intensidade média
        continuity_pct: 90     // Fluxo contínuo
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
    utils: { normalizeText, stripPhrases, getAccessToken }
  };
})();
