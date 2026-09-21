const { getSignedUrl } = require("@aws-sdk/cloudfront-signer");
const fs = require("fs");
const path = require("path");

const [, , filePath, minutes = "15"] = process.argv;
const domain = process.env.CLOUDFRONT_DOMAIN;
const keyPairId = process.env.KEY_PAIR_ID;

if (!filePath || !domain || !keyPairId) {
  console.error("Uso:");
  console.error(
    "  CLOUDFRONT_DOMAIN=<dominio> KEY_PAIR_ID=<id> node scripts/sign-url.js <ruta> [minutos]",
  );
  console.error("Ejemplo:");
  console.error(
    "  CLOUDFRONT_DOMAIN=d1234abcd.cloudfront.net KEY_PAIR_ID=K2ABC node scripts/sign-url.js private/bruno/index.html 15",
  );
  process.exit(1);
}

const url = `https://${domain}/${filePath}`;
const privateKey = fs.readFileSync(
  path.join(__dirname, "../keys/private_key.pem"),
  "utf8",
);

const signedUrl = getSignedUrl({
  url,
  keyPairId,
  privateKey,
  dateLessThan: new Date(
    Date.now() + Number(minutes) * 60 * 1000,
  ).toISOString(),
});

console.log(signedUrl);
