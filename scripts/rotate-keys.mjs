#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateKeyPairSync } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072
});

const outDir = path.join(__dirname, "..", "keys");
fs.mkdirSync(outDir, { recursive: true });

const privPath = path.join(outDir, "jump-issuer.priv.pem");
const pubPath  = path.join(outDir, "jump-issuer.pub.pem");

fs.writeFileSync(privPath, privateKey.export({ type: "pkcs1", format: "pem" }), { mode: 0o600 });
fs.writeFileSync(pubPath,  publicKey.export({ type: "pkcs1", format: "pem" }), { mode: 0o644 });

console.log("Generated RS256 keypair:");
console.log(" Private:", privPath);
console.log(" Public: ", pubPath);