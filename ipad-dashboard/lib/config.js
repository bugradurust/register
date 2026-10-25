// Ayarlar: config.default.json (surumle gelir, guncellemede degisir) uzerine
// isteğe bağlı config.json (yalniz degistirmek istediginiz alanlar) binmesi.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Nesneler alan alan birlestirilir; diziler (haber paketleri gibi) kullanicininkiyle tamamen degisir.
function merge(base, over) {
  if (over === undefined) return base;
  if (!isObject(base) || !isObject(over)) return over;
  const out = { ...base };
  for (const key of Object.keys(over)) out[key] = merge(base[key], over[key]);
  return out;
}

async function readJson(name, optional) {
  let text;
  try {
    text = await fs.readFile(path.join(ROOT, name), 'utf8');
  } catch (err) {
    if (optional && err.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    console.error(`\n${name} dosyasi okunamadi: ${err.message}\nVirgul, tirnak ya da suslu parantezlerde hata olabilir.\n`);
    process.exit(1);
  }
}

export const config = merge(await readJson('config.default.json'), await readJson('config.json', true));
if (process.env.PORT) config.port = Number(process.env.PORT);
