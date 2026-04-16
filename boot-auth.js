(function () {
  const SUPABASE_URL = "https://eudcjihffrfmhzmfwtlg.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1ZGNqaWhmZnJmbWh6bWZ3dGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDE3MjUsImV4cCI6MjA5MDMxNzcyNX0.2tod6vvl_4SAXzSmW1wU8Mk9pLn8fvhF2xrAZOysUu0";

  const REDIRECT_IF_NOT_LOGGED = ""; 
  // Se quiser forçar login, coloca por exemplo:
  // "https://paulorobertoxavierjunior-create.github.io/elayon-presenca/login.html"

  function log(msg) {
    try {
      const box = document.getElementById("logTech");
      if (box) {
        box.textContent += `[BOOT ${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`;
      }
    } catch {}
  }

  async function init() {
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS não carregado");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.ELAYON_SUPABASE = client;

    let session = null;
    let user = null;
    let authenticated = false;

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      session = data?.session || null;
      user = session?.user || null;
      authenticated = !!session?.access_token;
    } catch (err) {
      log(`falha ao obter sessão: ${err.message || err}`);
    }

    window.ELAYON_BOOT = {
      supabase: client,
      session,
      user,
      authenticated
    };

    log(authenticated ? "sessão autenticada" : "sem sessão autenticada");

    if (!authenticated && REDIRECT_IF_NOT_LOGGED) {
      window.location.href = REDIRECT_IF_NOT_LOGGED;
      return;
    }
  }

  init().catch((err) => {
    console.error("[BOOT]", err);
    alert(`Falha no boot de autenticação: ${err.message || err}`);
  });
})();