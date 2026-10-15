"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getMe,
  getSites,
  listDemoUsers,
  type CurrentUser,
  type DemoUser,
  type Role,
  type Site,
} from "../lib/api";

const STORAGE_KEY = "fonsat.userId";
export const ROLE_LABEL: Record<Role, string> = {
  worker: "Trabalhador",
  foreman: "Encarregado",
  admin: "Administrativo",
  client: "Cliente",
};
const HOME: Record<Role, { title: string; subtitle: string }> = {
  worker: { title: "O meu dia", subtitle: "O seu trabalho, num só lugar." },
  foreman: {
    title: "As minhas obras",
    subtitle: "Uma visão das obras sob a sua responsabilidade.",
  },
  admin: {
    title: "Visão geral",
    subtitle: "Acompanhe a operação da sua empresa.",
  },
  client: {
    title: "As minhas faturas",
    subtitle: "Consulte os documentos emitidos para a sua empresa.",
  },
};
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}
function companies(users: DemoUser[]) {
  const groups = new Map<number, { name: string; users: DemoUser[] }>();
  for (const user of users) {
    if (!groups.has(user.company_id))
      groups.set(user.company_id, { name: user.company_name, users: [] });
    groups.get(user.company_id)!.users.push(user);
  }
  return [...groups.entries()];
}
function remember(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* A seleção continua a funcionar em memória quando o armazenamento está indisponível. */
  }
}
function Mark() {
  return (
    <span className="brand">
      <span className="brand-symbol" aria-hidden="true">
        F
      </span>
      FONSAT
      <span className="brand-dot" aria-hidden="true">
        .
      </span>
    </span>
  );
}

