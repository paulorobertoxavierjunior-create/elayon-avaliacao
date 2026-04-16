(function () {
  const CRS_URL = "https://nucleo-crs-elayon.onrender.com/api/crs/analisar";
  const HEALTH_URL = "https://nucleo-crs-elayon.onrender.com/health";
  const TIMEOUT_MS = 20000;

  let activeStream = null;
  let activeRecognition = null;
  let recognitionRunning = false;
  let ttsActive = false;

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
      const timer = setTimeout(() => {
        reject(new Error("timeout da requisição"));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function normalizeText(txt) {
    return (txt || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,;:!?-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripPhrase(txt, phrase) {
    if (!phrase) return (txt || "").trim();

    const normalizedPhrase = normalizeText(phrase);
    const variants = [
      normalizedPhrase,
      normalizedPhrase.replace(/\s+/g, ""),
      normalizedPhrase.replace(/\s+/g, "[\\s,.!?;:-]*")
    ];

    let out = txt || "";

    variants.forEach((variant) => {
      try {
        const re = new RegExp(variant, "gi");
        out = out.replace(re, " ");
      } catch {}
    });

    return out.replace(/\s+/g, " ").trim();
  }

  function stripPhrases(txt, phrases = []) {
    let out = txt || "";
    phrases.forEach((p) => {
      out = stripPhrase(out, p);
    });
    return out.trim();
  }

  async function getAccessToken() {
    try {
      if (!window.ELAYON_SUPABASE?.auth?.getSession) return null;
      const { data, error } = await window.ELAYON_SUPABASE.auth.getSession();
      if (error) throw error;
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function healthcheck() {
    const base = {
      tts: "speechSynthesis" in window,
      mic: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      crs: false,
      streamOpen: !!activeStream,
      ttsActive,
      recognitionRunning,
      authenticated: false
    };

    try {
      const token = await getAccessToken();
      base.authenticated = !!token;
    } catch {
      base.authenticated = false;
    }

    try {
      const res = await withTimeout(fetch(HEALTH_URL, { method: "GET" }));
      base.crs = res.ok;
    } catch {
      base.crs = false;
    }

    return base;
  }

  const tts = {
    async speak(text, options = {}) {
      return new Promise((resolve, reject) => {
        try {
          if (!("speechSynthesis" in window)) {
            reject(new Error("TTS não disponível"));
            return;
          }

          const {
            lang = "pt-BR",
            rate = 0.96,
            pitch = 1,
            volume = 1,
            cancelPrevious = true
          } = options;

          if (cancelPrevious) {
            try { window.speechSynthesis.cancel(); } catch {}
          }

          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = lang;
          utter.rate = rate;
          utter.pitch = pitch;
          utter.volume = volume;

          utter.onstart = () => {
            ttsActive = true;
          };

          utter.onend = () => {
            ttsActive = false;
            resolve({ ok: true, text });
          };

          utter.onerror = (e) => {
            ttsActive = false;
            reject(new Error(e.error || "erro no TTS"));
          };

          window.speechSynthesis.speak(utter);
        } catch (err) {
          ttsActive = false;
          reject(err);
        }
      });
    },

    async stop() {
      try {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      ttsActive = false;
      return { ok: true };
    },

    isActive() {
      return ttsActive;
    }
  };

  const mic = {
    async open() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("microfone não disponível");
      }

      if (activeStream) {
        return {
          ok: true,
          tracks: activeStream.getAudioTracks().length,
          labels: activeStream.getAudioTracks().map((t) => t.label || "Padrão")
        };
      }

      activeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      log("microfone aberto");

      return {
        ok: true,
        tracks: activeStream.getAudioTracks().length,
        labels: activeStream.getAudioTracks().map((t) => t.label || "Padrão")
      };
    },

    async close() {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
        log("microfone fechado");
      }
      return { ok: true };
    },

    isOpen() {
      return !!activeStream;
    }
  };

  function stopRecognitionInternal() {
    try {
      activeRecognition && activeRecognition.stop();
    } catch {}
    recognitionRunning = false;
    activeRecognition = null;
  }

  function createRecognition() {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      throw new Error("SpeechRecognition não disponível");
    }
    return new RecognitionCtor();
  }

  const stt = {
    async listenForPhrase({
  stopPhrases = [],
  onPartial,
  interimResults = true,
  continuous = true,
  silenceFailsafeMs = 60000
} = {}) {
  if (recognitionRunning) {
    stopRecognitionInternal();
  }

  return new Promise((resolve, reject) => {
    try {
      const recognition = createRecognition();

      let finished = false;
      let failsafeTimer = null;

      const resultsMap = new Map();
      const normalizedStops = stopPhrases
        .map((s) => normalizeText(s))
        .filter(Boolean);

      function capitalizeFirst(text) {
        const clean = String(text || "").replace(/\s+/g, " ").trim();
        if (!clean) return "";
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }

      function composeText() {
        const ordered = [...resultsMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, value]) => value?.text || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        return capitalizeFirst(ordered);
      }

      function finish(result) {
        if (finished) return;
        finished = true;
        recognitionRunning = false;
        clearTimeout(failsafeTimer);

        try {
          recognition.stop();
        } catch {}

        activeRecognition = null;
        resolve(result);
      }

      function refreshFailsafe() {
        clearTimeout(failsafeTimer);
        failsafeTimer = setTimeout(() => {
          const fullText = composeText();

          finish({
            ok: true,
            text: fullText,
            final: fullText,
            partial: "",
            matched_phrase: null,
            timed_out: true,
            cleaned_text: stripPhrases(fullText, stopPhrases)
          });
        }, silenceFailsafeMs);
      }

      activeRecognition = recognition;
      recognition.lang = "pt-BR";
      recognition.interimResults = interimResults;
      recognition.continuous = continuous;

      recognition.onstart = () => {
        recognitionRunning = true;
        refreshFailsafe();
      };

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trecho = (event.results[i][0]?.transcript || "")
            .replace(/\s+/g, " ")
            .trim();

          resultsMap.set(i, {
            text: trecho,
            isFinal: event.results[i].isFinal
          });
        }

        const currentText = composeText();
        const cleaned = stripPhrases(currentText, stopPhrases);

        if (typeof onPartial === "function") {
          onPartial({
            ok: true,
            text: currentText,
            final: currentText,
            partial: "",
            cleaned_text: cleaned
          });
        }

        refreshFailsafe();

        const normalizedCurrent = normalizeText(currentText);
        const matched = normalizedStops.find((phrase) =>
          normalizedCurrent.includes(phrase)
        );

        if (matched) {
          finish({
            ok: true,
            text: currentText,
            final: currentText,
            partial: "",
            matched_phrase: matched,
            cleaned_text: cleaned
          });
        }
      };

      recognition.onerror = (event) => {
        recognitionRunning = false;
        clearTimeout(failsafeTimer);
        activeRecognition = null;
        reject(new Error(event.error || "erro no reconhecimento"));
      };

      recognition.onend = () => {
        if (!finished) {
          recognitionRunning = false;
          clearTimeout(failsafeTimer);

          const fullText = composeText();

          finish({
            ok: true,
            text: fullText,
            final: fullText,
            partial: "",
            matched_phrase: null,
            cleaned_text: stripPhrases(fullText, stopPhrases)
          });
        }
      };

      recognition.start();
    } catch (err) {
      recognitionRunning = false;
      activeRecognition = null;
      reject(err);
    }
  });
}

    async listenForAnyPhrase({
      phrases = [],
      onPartial,
      silenceFailsafeMs = 15000
    } = {}) {
      return this.listenForPhrase({
        stopPhrases: phrases,
        onPartial,
        silenceFailsafeMs
      });
    },

    async listenOnce({ silenceMs = 4000, onPartial } = {}) {
      return this.listenForPhrase({
        stopPhrases: [],
        onPartial,
        silenceFailsafeMs: silenceMs
      });
    },

    async stop() {
      stopRecognitionInternal();
      return { ok: true };
    },

    isRunning() {
      return recognitionRunning;
    }
  };

  const crs = {
    buildPayload(transcript, extra = {}) {
      const text = (transcript || "").trim();

      return {
        context: extra.context || "",
        transcript_raw: text,
        duration_sec: extra.duration_sec ?? Math.max(1, Math.ceil(text.length / 12)),
        silence_pct: extra.silence_pct ?? 15,
        pause_count: extra.pause_count ?? 2,
        mean_pause_ms: extra.mean_pause_ms ?? 180,
        source_text: extra.source_text || "",
        timeline_events: extra.timeline_events || [],
        uploaded_file_name: extra.uploaded_file_name || ""
      };
    },

    async analyze(payload) {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        throw new Error("acesso negado: usuário não autenticado no Supabase");
      }

      const res = await withTimeout(
        fetch(CRS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        })
      );

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`CRS HTTP ${res.status}: ${text}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error("CRS respondeu sem JSON válido");
      }
    }
  };

  window.ELAYON_TUNNEL = {
    healthcheck,
    tts,
    mic,
    stt,
    crs,
    utils: {
      normalizeText,
      stripPhrase,
      stripPhrases,
      getAccessToken
    }
  };
})();