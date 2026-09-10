const recoveryMessage = document.getElementById("recovery-msg");
const forgotForm = document.getElementById("forgot-password-form");
const resetForm = document.getElementById("reset-password-form");
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
  await submitRecovery(forgotForm, "/api/auth/forgot-password", { email: new FormData(forgotForm).get("email") });
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
