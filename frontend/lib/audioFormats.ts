import type { AudioFormat } from "@/types";

export interface AudioFormatOption {
  id: AudioFormat;
  label: string;
  hint: string;
  lossless: boolean;
}

/** Mirrors AUDIO_FORMATS in backend-node/src/ffmpeg.js */
export const AUDIO_FORMAT_OPTIONS: AudioFormatOption[] = [
  { id: "wav32",   label: "WAV 32-bit",  hint: "Máxima calidad · volumen exacto · archivos grandes", lossless: true },
  { id: "wav24",   label: "WAV 24-bit",  hint: "Estándar de estudio, ideal para editar",            lossless: true },
  { id: "wav16",   label: "WAV 16-bit",  hint: "Calidad CD, compatible con todo",                   lossless: true },
  { id: "flac",    label: "FLAC",        hint: "Sin pérdida y ~50% más liviano que WAV",            lossless: true },
  { id: "mp3_320", label: "MP3 320",     hint: "La mejor calidad en MP3",                           lossless: false },
  { id: "mp3_192", label: "MP3 192",     hint: "Más liviano, buena calidad",                        lossless: false },
  { id: "m4a",     label: "M4A (AAC)",   hint: "Ideal para iPhone, Mac y redes",                    lossless: false },
  { id: "ogg",     label: "OGG",         hint: "Formato libre, común en juegos y web",              lossless: false },
  { id: "opus",    label: "Opus",        hint: "Muy liviano con buena calidad (voz, web)",          lossless: false },
];
