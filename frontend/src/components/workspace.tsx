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


function Picker({
  users,
  error,
  onSelect,
  onRetry,
}: {
  users: DemoUser[];
  error: string | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  return (
    <main className="picker">
      <header className="picker-top">
        <Mark />
        <span className="demo-label">
          <span />
          Ambiente de demonstração
        </span>
      </header>
      <div className="picker-intro">
        <p className="eyebrow">GESTÃO DE EQUIPAS</p>
        <h1>Quem está a usar?</h1>
        <p>Escolha uma empresa e o seu perfil para continuar.</p>
      </div>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="quiet" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}
      {!error && users.length === 0 && (
        <p role="status">A carregar os utilizadores…</p>
      )}
      {companies(users).map(([id, group]) => (
        <section
          className="company-group"
          key={id}
          aria-labelledby={`company-${id}`}
        >
          <div className="company-heading">
            <span className="company-icon" aria-hidden="true">
              ▦
            </span>
            <h2 id={`company-${id}`}>{group.name}</h2>
            <span className="company-count">
              {group.users.length} utilizadores
            </span>
          </div>
          <div className="people-grid">
            {group.users.map((user) => (
              <button
                className="person-card"
                key={user.id}
                onClick={() => onSelect(user.id)}
              >
                <span
                  className={`avatar avatar--${user.role}`}
                  aria-hidden="true"
                >
                  {initials(user.name)}
                </span>
                <span className="person-info">
                  <strong>{user.name}</strong>
                  <span>{ROLE_LABEL[user.role]}</span>
                </span>
                <span className="person-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <footer className="picker-footer">
        Um espaço para cada empresa. Uma visão para cada pessoa.
      </footer>
    </main>
  );
}
