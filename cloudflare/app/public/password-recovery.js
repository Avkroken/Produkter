const recoveryMessage = document.getElementById("recovery-msg");
const forgotForm = document.getElementById("forgot-password-form");
const resetForm = document.getElementById("reset-password-form");
let recoveryTurnstileId = null;

/**
 * Registrerar callbacken när Turnstile finns och låter biblioteket invänta beredskap.
 * attempts anger återstående kontroller med 100 ms fördröjning; när de är slut
 * och biblioteket fortfarande saknas avslutas väntan utan att callbacken körs.
 */
function whenTurnstileReady(callback, attempts = 50) {
  if (window.turnstile) {
    window.turnstile.ready(callback);
    return;
  }
  if (attempts > 0) setTimeout(() => whenTurnstileReady(callback, attempts - 1), 100);
}

/**
 * Skapar en Turnstile-widget för lösenordsåterställning med behållarens sitekey och
 * action (standard: password_recovery). Gör inget om widgeten redan finns eller
 * om behållaren, sitekey eller Turnstile saknas.
 */
function renderRecoveryTurnstile() {
  const container = document.getElementById("recovery-turnstile");
  if (!container || recoveryTurnstileId !== null || !window.turnstile) return;
  const sitekey = container.dataset.sitekey;
  if (!sitekey) return;
  recoveryTurnstileId = window.turnstile.render(container, {
    sitekey,
    action: container.dataset.action || "password_recovery",
  });
}

/** Återställer widgeten för lösenordsåterställning om både dess id och Turnstile finns. */
function resetRecoveryTurnstile() {
  if (recoveryTurnstileId !== null && window.turnstile) {
    window.turnstile.reset(recoveryTurnstileId);
  }
}

if (forgotForm) whenTurnstileReady(renderRecoveryTurnstile);
let resetToken = new URLSearchParams(location.hash.slice(1)).get("token") || "";
if (resetForm) {
  history.replaceState(null, "", location.pathname);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(resetToken)) {
    resetForm.hidden = true;
    recoveryMessage.textContent = "Länken är ogiltig. Begär en ny återställningslänk.";
  }
}
async function submitRecovery(form, endpoint, body) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  recoveryMessage.textContent = "Arbetar…";
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Tjänsten är tillfälligt otillgänglig. Försök igen senare.");
    recoveryMessage.textContent = data.message;
    if (form === resetForm) { resetToken = ""; form.reset(); form.hidden = true; }
  } catch (err) {
    recoveryMessage.textContent = err instanceof TypeError || err.name === "TimeoutError"
      ? "Kunde inte nå tjänsten. Kontrollera anslutningen och försök igen."
      : err.message;
  } finally { button.disabled = false; }
}
forgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(forgotForm);
  const turnstileToken = recoveryTurnstileId !== null && window.turnstile
    ? window.turnstile.getResponse(recoveryTurnstileId)
    : "";
  if (!turnstileToken) {
    recoveryMessage.textContent = "Slutför säkerhetskontrollen och försök igen.";
    return;
  }
  await submitRecovery(forgotForm, "/api/auth/forgot-password", {
    email: values.get("email"),
    turnstileToken,
  });
  resetRecoveryTurnstile();
});
resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(resetForm);
  if (values.get("password") !== values.get("confirm")) {
    recoveryMessage.textContent = "Lösenorden matchar inte.";
    return;
  }
  await submitRecovery(resetForm, "/api/auth/reset-password", { token: resetToken, password: values.get("password") });
});
