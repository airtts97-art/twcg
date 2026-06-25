import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
const out = process.argv[3];
if (!src || !out) {
  console.error("usage: node extract-card-image.mjs <json> <output.jpeg>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(src, "utf8"));
const m = String(data.imageUrl || "").match(/^data:image\/jpeg;base64,(.+)$/s);
if (!m) throw new Error("no jpeg base64 in imageUrl");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(m[1], "base64"));
console.log("wrote", out, fs.statSync(out).size);
