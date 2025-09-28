// src/utils/validators.js
export function validateEmail(s = "") {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s).trim());
}

export function validatePhone(s = "") {
  const cleaned = String(s).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  return /^(\+?\d{10,15})$/.test(cleaned) || /^(\+?\d{1,4})?\d{10,}$/.test(digits);
}

export function validateName(s = "") {
  const str = String(s).trim();
  if (!str) return false;
  const tokens = str.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (/[@\d]/.test(str)) return false;
  const caps = tokens.filter((t) => /^[A-Z][a-zA-Z'’-]*$/.test(t)).length;
  return caps >= 2;
}
