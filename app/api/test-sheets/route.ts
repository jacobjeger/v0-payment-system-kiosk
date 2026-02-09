import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const steps: Record<string, unknown> = {};

  // Step 1: Check env vars exist
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;

  steps["1_env_vars"] = {
    hasClientEmail: !!clientEmail,
    clientEmail: clientEmail || "NOT SET",
    hasPrivateKey: !!rawKey,
    privateKeyLength: rawKey?.length || 0,
    sheetId: sheetId || "NOT SET",
  };

  if (!clientEmail || !rawKey || !sheetId) {
    return NextResponse.json({ steps, error: "Missing env vars" });
  }

  // Step 2: Analyze raw key format
  steps["2_raw_key_analysis"] = {
    first80chars: rawKey.substring(0, 80),
    last40chars: rawKey.substring(rawKey.length - 40),
    hasLiteralBackslashN: rawKey.includes("\\n"),
    hasRealNewlines: rawKey.includes("\n"),
    hasBeginPrivateKey: rawKey.includes("-----BEGIN PRIVATE KEY-----"),
    hasEndPrivateKey: rawKey.includes("-----END PRIVATE KEY-----"),
    hasBeginRSA: rawKey.includes("-----BEGIN RSA PRIVATE KEY-----"),
    startsWithDash: rawKey.startsWith("-"),
    startsWithQuote: rawKey.startsWith('"') || rawKey.startsWith("'"),
  };

  // Step 3: Try cleaning the key
  let cleaned = rawKey;
  cleaned = cleaned.replace(/\\n/g, "\n");
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  steps["3_after_newline_replace"] = {
    first80chars: cleaned.substring(0, 80),
    hasBeginMarker: cleaned.includes("-----BEGIN"),
    lineCount: cleaned.split("\n").length,
  };

  // Step 4: Extract base64 content
  const base64Content = cleaned
    .replace(/-----BEGIN [\w\s]+-----/g, "")
    .replace(/-----END [\w\s]+-----/g, "")
    .replace(/[\s\n\r]/g, "");

  steps["4_base64_extraction"] = {
    base64Length: base64Content.length,
    first20chars: base64Content.substring(0, 20),
    last20chars: base64Content.substring(base64Content.length - 20),
    isValidBase64: /^[A-Za-z0-9+/=]+$/.test(base64Content),
  };

  // Step 5: Try DER buffer conversion
  try {
    const derBuffer = Buffer.from(base64Content, "base64");
    steps["5_der_buffer"] = {
      success: true,
      bufferLength: derBuffer.length,
      firstBytes: Array.from(derBuffer.slice(0, 10)).map(b => b.toString(16).padStart(2, "0")).join(" "),
    };

    // Step 6: Try creating key object with PKCS8
    try {
      const keyObject = crypto.createPrivateKey({
        key: derBuffer,
        format: "der",
        type: "pkcs8",
      });
      steps["6_pkcs8_key"] = {
        success: true,
        keyType: keyObject.type,
        asymmetricKeyType: keyObject.asymmetricKeyType,
      };
    } catch (e: unknown) {
      const err = e as Error;
      steps["6_pkcs8_key"] = {
        success: false,
        error: err.message,
      };

      // Step 6b: Try PKCS1 format instead
      try {
        const keyObject = crypto.createPrivateKey({
          key: derBuffer,
          format: "der",
          type: "pkcs1",
        });
        steps["6b_pkcs1_key"] = {
          success: true,
          keyType: keyObject.type,
          asymmetricKeyType: keyObject.asymmetricKeyType,
        };
      } catch (e2: unknown) {
        const err2 = e2 as Error;
        steps["6b_pkcs1_key"] = {
          success: false,
          error: err2.message,
        };
      }

      // Step 6c: Try PEM format directly after rebuilding
      try {
        const lines = base64Content.match(/.{1,64}/g) || [];
        const pemKey = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;

        const keyObject = crypto.createPrivateKey({
          key: pemKey,
          format: "pem",
        });
        steps["6c_rebuilt_pem"] = {
          success: true,
          keyType: keyObject.type,
          asymmetricKeyType: keyObject.asymmetricKeyType,
        };
      } catch (e3: unknown) {
        const err3 = e3 as Error;
        steps["6c_rebuilt_pem"] = {
          success: false,
          error: err3.message,
        };
      }

      // Step 6d: Try as RSA PRIVATE KEY PEM
      try {
        const lines = base64Content.match(/.{1,64}/g) || [];
        const rsaPem = `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;

        const keyObject = crypto.createPrivateKey({
          key: rsaPem,
          format: "pem",
        });
        steps["6d_rsa_pem"] = {
          success: true,
          keyType: keyObject.type,
          asymmetricKeyType: keyObject.asymmetricKeyType,
        };
      } catch (e4: unknown) {
        const err4 = e4 as Error;
        steps["6d_rsa_pem"] = {
          success: false,
          error: err4.message,
        };
      }

      // Step 6e: Try passing the cleaned PEM string directly
      try {
        const keyObject = crypto.createPrivateKey(cleaned);
        steps["6e_direct_pem"] = {
          success: true,
          keyType: keyObject.type,
          asymmetricKeyType: keyObject.asymmetricKeyType,
        };
      } catch (e5: unknown) {
        const err5 = e5 as Error;
        steps["6e_direct_pem"] = {
          success: false,
          error: err5.message,
        };
      }
    }
  } catch (e: unknown) {
    const err = e as Error;
    steps["5_der_buffer"] = {
      success: false,
      error: err.message,
    };
  }

  return NextResponse.json(steps, { status: 200 });
}
