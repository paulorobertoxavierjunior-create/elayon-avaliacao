(function () {
  const CRS_URL = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
  const HEALTH_URL = "https://nucleo-crs-elayon.onrender.com/health";
  const TIMEOUT_MS = 20000;

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

  const mic = {
    async open() {
      if (activeStream) return { ok: true };
      activeStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      log("Microfone ativo");
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
      silenceFailsafeMs = 60000
    } = {}) {
      if (recognitionRunning) this.stop();

      return new Promise((resolve, reject) => {
        const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!RecognitionCtor) return reject(new Error("STT não suportado"));

        const recognition = new RecognitionCtor();
        const resultsMap = new Map();
        let finished = false;
        let failsafeTimer = null;

        const finish = (result) => {
          if (finished) return;
          finished = true;
          recognitionRunning = false;
          clearTimeout(failsafeTimer);
          try { recognition.stop(); } catch {}
          resolve(result);
        };

        const refreshFailsafe = () => {
          clearTimeout(failsafeTimer);
          failsafeTimer = setTimeout(() => {
            const txt = compose();
            finish({ ok: true, text: txt, cleaned_text: stripPhrases(txt, stopPhrases), timed_out: true });
          }, silenceFailsafeMs);
        };

        const compose = () => {
          const raw = [...resultsMap.entries()].sort((a, b) => a[0] - b[0]).map(v => v[1].text).join(" ");
          const clean = raw.replace(/\s+/g, " ").trim();
          return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
        };

        recognition.lang = "pt-BR";
        recognition.interimResults = interimResults;
        recognition.continuous = continuous;

        recognition.onstart = () => { recognitionRunning = true; refreshFailsafe(); };
        
        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            resultsMap.set(i, { text: event.results[i][0].transcript, isFinal: event.results[i].isFinal });
          }
          const currentText = compose();
          if (onPartial) onPartial({ text: currentText, cleaned_text: stripPhrases(currentText, stopPhrases) });
          
          refreshFailsafe();

          const norm = normalizeText(currentText);
          const matched = stopPhrases.find(p => norm.includes(normalizeText(p)));
          if (matched) finish({ ok: true, text: currentText, matched_phrase: matched, cleaned_text: stripPhrases(currentText, stopPhrases) });
        };

        recognition.onerror = (e) => { recognitionRunning = false; reject(e); };
        recognition.onend = () => { if (!finished) finish({ ok: true, text: compose() }); };

        activeRecognition = recognition;
        recognition.start();
      });
    },

    // --- Métodos de Conveniência (Com as vírgulas corrigidas) ---
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

  const crs = {
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

