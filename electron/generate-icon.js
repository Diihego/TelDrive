// Ejecutar con: node electron/generate-icon.js
// Genera un icon.ico básico si no tenés uno propio
// Para un icono real, reemplazá electron/icon.ico con tu imagen 256x256

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ICO mínimo válido (16x16, color sólido acento TelDrive #6c63ff)
// Si querés usar tu propio icono simplemente reemplazá electron/icon.ico
const icoPath = path.join(__dirname, 'icon.ico')

if (fs.existsSync(icoPath)) {
  console.log('icon.ico ya existe, no se sobreescribe.')
  process.exit(0)
}

// ICO header + 16x16 BMP básico (azul-violeta)
// Este es el formato mínimo que Electron acepta
const width = 16, height = 16
const bmpDataSize = width * height * 4
const bmpSize = 40 + bmpDataSize

const buf = Buffer.alloc(6 + 16 + bmpSize)
let offset = 0

// ICO header
buf.writeUInt16LE(0, offset); offset += 2       // reserved
buf.writeUInt16LE(1, offset); offset += 2       // type: 1=icon
buf.writeUInt16LE(1, offset); offset += 2       // count: 1 image

// Directory entry
buf.writeUInt8(width, offset++);
buf.writeUInt8(height, offset++);
buf.writeUInt8(0, offset++);   // color count (0 = truecolor)
buf.writeUInt8(0, offset++);   // reserved
buf.writeUInt16LE(1, offset); offset += 2;  // planes
buf.writeUInt16LE(32, offset); offset += 2; // bit count
buf.writeUInt32LE(bmpSize, offset); offset += 4;
buf.writeUInt32LE(22, offset); offset += 4; // data offset = 6 + 16

// BMP info header
buf.writeUInt32LE(40, offset); offset += 4;
buf.writeInt32LE(width, offset); offset += 4;
buf.writeInt32LE(height * 2, offset); offset += 4; // height * 2 for ICO
buf.writeUInt16LE(1, offset); offset += 2;
buf.writeUInt16LE(32, offset); offset += 2;
buf.writeUInt32LE(0, offset); offset += 4;  // compression
buf.writeUInt32LE(bmpDataSize, offset); offset += 4;
buf.writeInt32LE(0, offset); offset += 4;
buf.writeInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;
buf.writeUInt32LE(0, offset); offset += 4;

// Pixel data BGRA — color #6c63ff (acento TelDrive)
for (let i = 0; i < width * height; i++) {
  buf.writeUInt8(0xff, offset++); // B
  buf.writeUInt8(0x63, offset++); // G
  buf.writeUInt8(0x6c, offset++); // R
  buf.writeUInt8(0xff, offset++); // A
}

fs.writeFileSync(icoPath, buf)
console.log('icon.ico generado en electron/icon.ico')
console.log('Para usar tu propio icono, reemplazalo con una imagen 256x256 en formato .ico')
