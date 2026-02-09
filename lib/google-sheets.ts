import crypto from "crypto";

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error(
      "Missing Google Sheets credentials: " +
        (!clientEmail ? "GOOGLE_SHEETS_CLIENT_EMAIL " : "") +
        (!rawKey ? "GOOGLE_SHEETS_PRIVATE_KEY" : ""),
    );
  }

  // Extract raw base64 from the PEM, stripping all headers/whitespace/escapes
  const base64Content = rawKey
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/-----BEGIN [\w\s]+-----/g, "")
    .replace(/-----END [\w\s]+-----/g, "")
    .replace(/\s/g, "")
    .replace(/^["']|["']$/g, "");

  // Convert to DER buffer and create key object directly - bypasses PEM parsing
  const derBuffer = Buffer.from(base64Content, "base64");
  const keyObject = crypto.createPrivateKey({
    key: derBuffer,
    format: "der",
    type: "pkcs8",
  });

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign
    .sign(keyObject, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(
      `Failed to get Google access token: ${tokenRes.status} ${errorText}`,
    );
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export async function logTransactionToSheet(data: {
  memberName: string;
  memberCode: string;
  businessName: string;
  amount: number;
  description: string;
  transactionDate: string;
  balanceBefore: number;
  balanceAfter: number;
  source: string;
}) {
  try {
    const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
    if (!sheetId) {
      console.error("[GoogleSheets] Missing GOOGLE_SHEETS_SHEET_ID");
      return;
    }

    console.log(
      "[GoogleSheets] Logging transaction:",
      data.memberName,
      data.businessName,
      data.amount,
    );

    const accessToken = await getAccessToken();

    // Use ISO string with timezone info and convert to local time display
    const dateObj = new Date(data.transactionDate);
    const formattedDate = dateObj.toLocaleString("en-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    });

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:I:append?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [
          [
            data.memberName,
            data.memberCode,
            data.businessName,
            data.amount,
            data.description,
            formattedDate,
            data.balanceBefore,
            data.balanceAfter,
            data.source,
          ],
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[GoogleSheets] API error:", res.status, errorText);
    } else {
      console.log("[GoogleSheets] Transaction logged successfully");
    }
  } catch (error) {
    console.error("[GoogleSheets] Failed to log transaction:", error);
  }
}
