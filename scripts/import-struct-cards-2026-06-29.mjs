import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = [
  ["c:/Users/haruk/Downloads/大農園.json", "card_1782738882848"],
  ["c:/Users/haruk/Downloads/大市場.json", "card_1782736989649"],
];

for (const [srcPath, id] of cards) {
  const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const imgOut = path.join(root, "assets/cards", `${id}.jpeg`);
  const match = String(src.imageUrl || "").match(/^data:image\/jpeg;base64,(.+)$/s);
  if (match) {
    fs.mkdirSync(path.dirname(imgOut), { recursive: true });
    fs.writeFileSync(imgOut, Buffer.from(match[1], "base64"));
    console.log("wrote image", imgOut);
  }
  const deckmaker = { ...src, imageUrl: `assets/cards/${id}.jpeg` };
  fs.writeFileSync(
    path.join(root, "deckmaker_cards", `${id}.json`),
    `${JSON.stringify(deckmaker, null, 2)}\n`,
  );
  console.log("wrote deckmaker", id);
}
