# Stemify — AI Audio Stem Separator

Separa voces, instrumentos, batería y bajo de canciones y videos usando IA.
Funciona completamente **offline**, sin suscripciones ni APIs externas.

## Inicio rápido

Haz doble clic en **`start.bat`** y abre http://localhost:3000

---

## Instalación (primera vez)

### Requisitos previos

| Herramienta | Para qué | Cómo instalar |
|-------------|----------|---------------|
| **Node.js 18+** | Ejecutar backend y frontend | https://nodejs.org |
| **Python 3.10+** | Separación por IA con Demucs | https://python.org (marcar "Add to PATH") |
| **Demucs + RoFormer** | Motores de IA | `instalar_ia.bat` (ver abajo) |

> FFmpeg viene incluido automáticamente — no necesitas instalarlo.

### Instalar los motores de IA (y activar la GPU)

Doble clic en **`instalar_ia.bat`**. Crea/usa la carpeta `venv` e instala:

- **PyTorch con CUDA** si tienes una tarjeta **NVIDIA** (la IA corre en la GPU, mucho más rápido). Si no, la versión para CPU.
- **Demucs** y **audio-separator** (BS-RoFormer, el motor de Ultimate Vocal Remover).

Al arrancar, la ventana del backend muestra `Aceleración: GPU <tu tarjeta>` o `CPU`.
La primera separación con RoFormer descarga el modelo (~640 MB) en la carpeta `models/`.

### Instalar dependencias de Node

`start.bat` ejecuta `npm install` solo si falta `node_modules`. Para hacerlo a mano:

```bat
cd backend-node && npm install
cd ..\frontend && npm install
```

### Primer inicio

Haz doble clic en `start.bat`

---

## Uso diario

1. Doble clic en **`start.bat`**
2. Se abre automáticamente http://localhost:3000
3. Elige **Music Mode** o **Video Mode**
4. Sube tu archivo
5. Selecciona el tipo de separación
6. Clic en **Separar Audio**
7. Descarga cada pista

Para cerrar la app: cierra las dos ventanas de consola que se abren minimizadas.

---

## Qué hace cada modo

### Music Mode (MP3, WAV, M4A, AAC, FLAC, OGG)
- **2 pistas**: Vocals + Instrumental
- **4 pistas**: Vocals + Drums + Bass + Other Instruments
- **Motor / calidad**:
  - **RoFormer** — la voz más limpia (BS-RoFormer). En 4 pistas, Demucs divide el instrumental.
  - **Demucs Máxima precisión** — `htdemucs_ft` con doble pasada.
  - **Demucs Estándar** — `htdemucs`, una pasada, el más rápido.
- **Formato de descarga**: WAV 32/24/16-bit, FLAC, MP3 320/192, M4A (AAC), OGG u Opus.
  Siempre con **el mismo volumen que el original**. En WAV 32-bit es exacto:
  sumadas, las pistas reconstruyen la canción. En los demás formatos, si algún
  pico pasa del máximo se suaviza en vez de distorsionar.

### Convertidor de Audio (cualquier audio o vídeo)
- Convierte a WAV, FLAC, MP3, M4A, OGG u Opus. Si subes un vídeo, extrae y convierte su audio.
- Conserva el volumen y los datos (título, artista); no copia la carátula.

### Video Mode (MP4, MOV, MKV, WEBM, AVI)
- **Extraer audio completo** → WAV
- **Video sin audio** → MP4 mudo
- **Separar voces/música** → usa IA (requiere Demucs)
- **Separación 4 pistas** → usa IA (requiere Demucs)

---

## Estructura del proyecto

```
stemify/
├── start.bat                  ← Ejecutar para iniciar todo
├── backend-node/              ← Código fuente del backend
│   ├── src/
│   │   ├── routes.js          ← API endpoints
│   │   ├── processing.js      ← Lógica de procesamiento
│   │   ├── ffmpeg.js          ← Operaciones FFmpeg
│   │   ├── demucs.js          ← Integración Demucs
│   │   ├── jobs.js            ← Estado de los trabajos
│   │   └── cleanup.js         ← Limpieza automática
│   └── server.js              ← Servidor Express
├── frontend/                  ← Código fuente del frontend
│   ├── app/                   ← Next.js App Router
│   ├── components/            ← Componentes React
│   └── lib/                   ← Utilidades y API client
└── C:\stemify\                ← Archivos de ejecución (sin espacios en ruta)
    ├── backend/               ← Backend compilado/ejecutable
    ├── uploads/               ← Archivos subidos (temporales)
    ├── outputs/               ← Archivos procesados (temporales)
    └── demucs_wrapper.py      ← Parche para compatibilidad Windows
```

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Node.js, Express |
| Procesamiento de video | FFmpeg (incluido vía ffmpeg-static) |
| Separación de audio IA | Demucs 4.0 (htdemucs model) |

---

## Publicar en GitHub (open source)

```bash
git init
git add .
git commit -m "feat: initial release - AI audio stem separator"
gh repo create stemify --public --source=. --push
```

O desde GitHub Desktop: File → Add Local Repository → `S:\Claude code\stemify`

---

## Limitaciones conocidas

- La separación por IA es aproximada — puede haber mezcla entre pistas
- Archivos largos tardan más (una canción de 4 min ≈ 15-30 seg en CPU)
- Los archivos procesados se eliminan automáticamente después de 60 minutos
- Demucs requiere Python; las operaciones de FFmpeg funcionan sin él

---

## Licencia

MIT — libre para usar, modificar y distribuir.
