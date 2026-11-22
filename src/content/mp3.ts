/** Mono MP3 (128 kbps) as base64, for AnkiConnect's `audio.data`. */
export function mp3Base64(samples: Float32Array, sr: number): string {
  const enc = new lamejs.Mp3Encoder(1, sr, 128);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const parts: Int8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) parts.push(b);
  }
  parts.push(enc.flush());
  let bin = "";
  for (const p of parts) {
    const u = new Uint8Array(p.buffer, p.byteOffset, p.length);
    for (let i = 0; i < u.length; i += 0x8000)
      bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
