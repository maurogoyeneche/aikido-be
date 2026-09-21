const rateLimit = require("express-rate-limit");

const mailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos, intenta de nuevo más tarde" },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()+-]{6,20}$/;

const vowelRatio = (str) => {
  const letters = str.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 1;
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  return vowels / letters.length;
};

const caseSwitchCount = (str) => {
  let switches = 0;
  for (let i = 1; i < str.length; i++) {
    const prevIsUpper = str[i - 1] >= "A" && str[i - 1] <= "Z";
    const currIsUpper = str[i] >= "A" && str[i] <= "Z";
    if (
      /[a-zA-Z]/.test(str[i - 1]) &&
      /[a-zA-Z]/.test(str[i]) &&
      prevIsUpper !== currIsUpper
    ) {
      switches++;
    }
  }
  return switches;
};

// Detects random-looking bot filler such as "lJZOUStVJiRvOFmGaOqwy":
// no spaces, low vowel ratio and/or lots of random case switching.
const looksLikeGibberish = (str) => {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.length < 8) return false;
  if (trimmed.includes(" ")) return false;

  const ratio = vowelRatio(trimmed);
  const switches = caseSwitchCount(trimmed);

  if (ratio < 0.25) return true;
  if (switches >= Math.floor(trimmed.length / 4)) return true;

  return false;
};

const reject = (req, res, status, reason, publicMessage) => {
  console.warn(`[mail-validation] rejected (${reason})`, {
    bodyKeys: Object.keys(req.body || {}),
    nameLen: req.body?.name?.length,
    emailLen: req.body?.email?.length,
    phoneLen: req.body?.phone?.length,
    messageLen: req.body?.message?.length,
  });
  return res.status(status).json({ message: publicMessage });
};

const validateMailInput = (req, res, next) => {
  const { name, email, phone, message, surname } = req.body;

  // Honeypot: real users never fill this hidden field.
  // Respond with a fake success so bots don't learn to skip it.
  if (surname) {
    return reject(req, res, 200, "honeypot", "Mensaje enviado");
  }

  if (!name || !email || !message) {
    return reject(req, res, 400, "missing-fields", "Faltan campos requeridos");
  }

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string" ||
    (phone !== undefined && typeof phone !== "string")
  ) {
    return reject(req, res, 400, "bad-types", "Formato de datos inválido");
  }

  if (name.length > 100 || message.length > 3000 || email.length > 200) {
    return reject(req, res, 400, "too-long", "Datos demasiado largos");
  }

  if (!EMAIL_REGEX.test(email)) {
    return reject(req, res, 400, "bad-email", "Email inválido");
  }

  if (phone && !PHONE_REGEX.test(phone)) {
    return reject(req, res, 400, "bad-phone", "Teléfono inválido");
  }

  // Header injection guard: newlines in fields that end up in mail headers/body.
  if (/[\r\n]/.test(name) || /[\r\n]/.test(email)) {
    return reject(req, res, 400, "header-injection", "Datos inválidos");
  }

  if (looksLikeGibberish(name) || looksLikeGibberish(message)) {
    // Pretend success so the bot doesn't adapt its payload.
    return reject(req, res, 200, "gibberish", "Mensaje enviado");
  }

  next();
};

const verifyCaptcha = async (req, res, next) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Captcha not configured yet — skip without blocking mail sending.
    return next();
  }

  const token = req.body.captchaToken;
  if (!token) {
    console.warn("[mail-validation] rejected (missing-captcha-token)", {
      bodyKeys: Object.keys(req.body || {}),
    });
    return res.status(400).json({ message: "Falta verificación captcha" });
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: token,
          remoteip: req.ip,
        }),
      }
    );
    const data = await response.json();
    if (!data.success) {
      console.warn(
        "[mail-validation] rejected (captcha-verification-failed)",
        data["error-codes"]
      );
      return res.status(400).json({ message: "Verificación captcha fallida" });
    }
    next();
  } catch (err) {
    console.error("[mail-validation] captcha verification errored", err);
    return res.status(502).json({ message: "No se pudo verificar el captcha" });
  }
};

module.exports = { mailRateLimiter, validateMailInput, verifyCaptcha };
