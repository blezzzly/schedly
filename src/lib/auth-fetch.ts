"use client";

import { toast } from "sonner";

let reloginToastShown = false;

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401 && !reloginToastShown) {
    reloginToastShown = true;
    toast.error("Session expired. Please log in again.", {
      action: {
        label: "Log in",
        onClick: () => {
          reloginToastShown = false;
          window.location.href = "/login";
        },
      },
      duration: Infinity,
    });
  }

  if (res.status !== 401) {
    reloginToastShown = false;
  }

  return res;
}

export function resetReloginToast() {
  reloginToastShown = false;
}