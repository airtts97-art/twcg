import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = [
  ["c:/Users/haruk/Downloads/_虚-第四開発部：野外実験課 (2).json", "card_1782741779575"],
  ["c:/Users/haruk/Downloads/第三警備部：調査部.json", "card_1782739826805"],
];

for (const [srcPath, id] of cards) {
  const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  if (typeof src.name === "string") src.name = src.name.trim();
  const imgOut = path.join(root, "assets/cards", `${id}.jpeg`);
  const match = String(src.imageUrl || "").match(/^data:image\/jpeg;base64,(.+)$/s);
  if (match) {
    fs.mkdirSync(path.dirname(imgOut), { recursive: true });
    fs.writeFileSync(imgOut, Buffer.from(match[1], "base64"));
    console.log("wrote image", imgOut);
  }
  const deckmaker = { ...src, id, name: src.name, imageUrl: `assets/cards/${id}.jpeg` };
  fs.writeFileSync(
    path.join(root, "deckmaker_cards", `${id}.json`),
    `${JSON.stringify(deckmaker, null, 2)}\n`,
  );
  console.log("wrote deckmaker", id, deckmaker.name);
}
