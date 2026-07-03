import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  databaseUrl: required("DATABASE_URL"),
  nomba: {
    baseUrl: process.env.NOMBA_BASE_URL || "https://api.nomba.com",
    accountId: required("NOMBA_ACCOUNT_ID"),        // PARENT account id: always the accountId header
    subAccountId: process.env.NOMBA_SUB_ACCOUNT_ID || null, // your team's sub-account: goes in body/query params
    clientId: required("NOMBA_CLIENT_ID"),
    clientSecret: required("NOMBA_CLIENT_SECRET"),
    webhookSecret: process.env.NOMBA_WEBHOOK_SECRET || "NombaHackathon2026",
    verifyWebhooks: (process.env.WEBHOOK_VERIFY || "true") === "true",
  },
  escrow: {
    feePercent: Number(process.env.PLATFORM_FEE_PERCENT || 1.5),
    autoReleaseHours: Number(process.env.AUTO_RELEASE_HOURS || 72),
  },
};
