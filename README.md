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
| **Demucs** | Motor de IA | `pip install demucs` |

> FFmpeg viene incluido automáticamente — no necesitas instalarlo.

### Instalar dependencias

```bat
:: Backend
cd C:\stemify\backend
npm install

:: Frontend
cd "S:\Claude code\stemify\frontend"
npm install
npm run build
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
