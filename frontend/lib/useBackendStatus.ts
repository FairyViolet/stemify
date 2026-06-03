"use client";

import { useEffect, useState } from "react";
import { fetchBackendStatus } from "./api";
import type { BackendStatus } from "@/types";

export type BackendState =
  | { state: "checking" }
  | { state: "unreachable" }
  | { state: "partial"; ffmpeg: boolean; demucs: boolean }   // backend up but missing deps
  | { state: "ok" };

export function useBackendStatus(): BackendState {
  const [result, setResult] = useState<BackendState>({ state: "checking" });

  useEffect(() => {
    fetchBackendStatus()
      .then((status) => {
        if (status.ffmpeg && status.demucs) {
          setResult({ state: "ok" });
        } else {
          setResult({ state: "partial", ffmpeg: status.ffmpeg, demucs: status.demucs });
        }
      })
      .catch(() => {
        setResult({ state: "unreachable" });
      });
  }, []);

  return result;
}
