import crypto from "crypto";

const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = crypto;

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.CARD_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CARD_ENCRYPTION_KEY environment variable is not set");
  }
  // Use scrypt to derive a 32-byte key from the provided key
  const salt = Buffer.from("pdca-card-encryption-salt", "utf8");
  return scryptSync(key, salt, 32);
}

/**
 * Encrypts sensitive card data using AES-256-GCM
 * Returns a string in format: iv:authTag:encryptedData (all base64)
 */
export function encryptCardData(plaintext: string): string {
  if (!plaintext) return "";
  
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts card data encrypted with encryptCardData
 */
export function decryptCardData(encryptedData: string): string {
  if (!encryptedData || !encryptedData.includes(":")) return encryptedData;
  
  try {
    const key = getEncryptionKey();
    const [ivBase64, authTagBase64, encrypted] = encryptedData.split(":");
    
    if (!ivBase64 || !authTagBase64 || !encrypted) {
      // Data is not in encrypted format, return as-is (for backward compatibility)
      return encryptedData;
    }
    
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    // If decryption fails, data might not be encrypted (legacy data)
    // Return as-is for backward compatibility
    console.error("Card decryption failed, returning raw data:", error);
    return encryptedData;
  }
}

/**
 * Checks if a string appears to be encrypted (has our format)
 */
export function isEncrypted(data: string): boolean {
  if (!data) return false;
  const parts = data.split(":");
  return parts.length === 3 && parts[0].length > 10;
}

/**
 * Masks a card number for display (shows last 4 digits)
 */
export function maskCardNumber(cardNumber: string | null): string {
  if (!cardNumber) return "";
  
  // If encrypted, we can't show any digits safely
  if (isEncrypted(cardNumber)) {
    return "**** **** **** ****";
  }
  
  // Show last 4 digits
  const last4 = cardNumber.slice(-4);
  return `**** **** **** ${last4}`;
}

/**
 * Gets the last 4 digits of a card number (decrypts if needed)
 */
export function getCardLast4(cardNumber: string | null): string {
  if (!cardNumber) return "";
  
  const decrypted = isEncrypted(cardNumber) ? decryptCardData(cardNumber) : cardNumber;
  return decrypted.slice(-4);
}
