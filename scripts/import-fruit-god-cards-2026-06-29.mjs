import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = [
  ["c:/Users/haruk/Downloads/怒れる摘果神.json", "card_1782802249493"],
  ["c:/Users/haruk/Downloads/つなたい召喚儀式.json", "card_1782803110038"],
  ["c:/Users/haruk/Downloads/名前のない神.json", "card_1782804595225"],
  ["c:/Users/haruk/Downloads/バベル社三等社員 (1).json", "card_1782810886587"],
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
