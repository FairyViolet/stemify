"use client";

import { useEffect, useState } from "react";
import { fetchBackendStatus } from "./api";
import type { BackendStatus } from "@/types";

export type BackendState =
  | { state: "checking" }
  | { state: "unreachable" }
  | { state: "partial"; ffmpeg: boolean; demucs: boolean; roformer: boolean; gpu: string | null }   // backend up but missing deps
  | { state: "ok"; roformer: boolean; gpu: string | null };

export function useBackendStatus(): BackendState {
  const [result, setResult] = useState<BackendState>({ state: "checking" });

  useEffect(() => {
    fetchBackendStatus()
      .then((status) => {
        const ai = { roformer: Boolean(status.roformer), gpu: status.gpu ?? null };
        if (status.ffmpeg && status.demucs) {
          setResult({ state: "ok", ...ai });
        } else {
          setResult({ state: "partial", ffmpeg: status.ffmpeg, demucs: status.demucs, ...ai });
        }
      })
      .catch(() => {
        setResult({ state: "unreachable" });
      });
  }, []);

  return result;
}
