import { AppError } from "../errors/app-error.js";

export function normalizeNigeriaPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("234") && digits.length >= 13) {
    return `+${digits}`;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+234${digits}`;
  }

  throw new AppError(
    400,
    "Enter a valid Nigerian phone number in +234, 234, 0, or local 10-digit format.",
    "INVALID_PHONE_NUMBER"
  );
}
