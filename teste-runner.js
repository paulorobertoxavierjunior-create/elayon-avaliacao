async function runTunnelTests() {
  const log = (msg) => {
    const el = document.getElementById("logTech");
    el.textContent += msg + "\n";
  };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  log("🚀 INICIANDO DIAGNÓSTICO ELAYON...");
  await wait(500);

  // 1. Tunnel carregado
  if (!window.ELAYON_TUNNEL) {
    log("❌ ERRO: ELAYON_TUNNEL não carregado");
    return;
  }

  log("✅ Tunnel carregado");
  await wait(500);

  const tunnel = window.ELAYON_TUNNEL;

  // 2. Healthcheck
  try {
    log("🔍 Verificando saúde do sistema...");
    const health = await tunnel.healthcheck();
    log("✅ Healthcheck:");
    log(JSON.stringify(health, null, 2));
  } catch (e) {
    log("❌ Erro no healthcheck: " + e.message);
  }

  await wait(1000);

  // 3. Microfone
  try {
    log("🎤 Testando microfone...");
    await tunnel.mic.open();
    log("✅ Microfone OK");
  } catch (e) {
    log("❌ Erro microfone: " + e.message);
  }

  await wait(1000);

  // 4. TTS
  try {
    log("🔊 Testando voz...");
    await tunnel.tts.speak("Teste de voz Elayon ativo.");
    log("✅ TTS funcionando");
  } catch (e) {
    log("❌ Erro TTS: " + e.message);
  }

  await wait(1000);

  // 5. STT (escuta)
  try {
    log("🧠 Teste de escuta (fale algo por 4s)...");
    const result = await tunnel.stt.listenOnce({ silenceMs: 4000 });

    log("✅ STT resultado:");
    log(JSON.stringify(result, null, 2));
  } catch (e) {
    log("❌ Erro STT: " + e.message);
  }

  await wait(1000);

  // 6. CRS
  try {
    log("📡 Testando CRS...");

    const payload = tunnel.crs.buildPayload("teste de presença");

    const res = await tunnel.crs.analyze(payload);

    log("✅ CRS respondeu:");
    log(JSON.stringify(res, null, 2));
  } catch (e) {
    log("❌ CRS erro: " + e.message);
  }

  log("\n🏁 DIAGNÓSTICO FINALIZADO");
}