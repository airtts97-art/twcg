import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = "c:/Users/haruk/Downloads/マイサータ貿易港.json";
const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));
const id = src.id;

const imgOut = path.join(root, "assets/cards", `${id}.jpeg`);
const m = String(src.imageUrl || "").match(/^data:image\/jpeg;base64,(.+)$/s);
if (m) {
  fs.mkdirSync(path.dirname(imgOut), { recursive: true });
  fs.writeFileSync(imgOut, Buffer.from(m[1], "base64"));
  console.log("wrote image", imgOut);
}

const deckmaker = {
  ...src,
  imageUrl: `assets/cards/${id}.jpeg`,
};
fs.writeFileSync(
  path.join(root, "deckmaker_cards", `${id}.json`),
  `${JSON.stringify(deckmaker, null, 2)}\n`,
);
console.log("wrote deckmaker", id);
