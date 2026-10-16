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

import { WorkerClock } from "./worker-clock";
import { Operations } from "./operations";
import { InvoicesPanel } from "./invoices";

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

export function Workspace() {
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<{
    me: CurrentUser;
    sites: Site[];
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^[1-9]\d*$/.test(saved) && Number(saved) <= 2147483647)
        setSelected(Number(saved));
      else if (saved) remember(null);
    } catch {
      /* Pode continuar sem persistência. */
    }
    setReady(true);
  }, []);

  const select = useCallback((id: number | null) => {
    setContext(null);
    setError(null);
    remember(id);
    setSelected(id);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setListError(null);
    listDemoUsers(controller.signal)
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((error) => {
        if (active)
          setListError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os utilizadores.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    if (!ready || selected === null) return;
    let active = true;
    const controller = new AbortController();
    setError(null);
    async function load() {
      try {
        const me = await getMe(selected!, controller.signal);
        if (!active) return;
        const sites =
          me.role === "admin" || me.role === "foreman"
            ? await getSites(selected!, controller.signal)
            : [];
        if (active) setContext({ me, sites });
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) {
          select(null);
          setError(
            "A seleção já não é válida. Escolha novamente quem está a usar.",
          );
        } else
          setError(
            failure instanceof Error
              ? failure.message
              : "Não foi possível abrir o ambiente.",
          );
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [ready, selected, attempt, select]);

  const retry = () => setAttempt((value) => value + 1);
  if (!ready)
    return (
      <main className="loading" role="status">
        A preparar o seu ambiente…
      </main>
    );
  if (selected === null)
    return (
      <Picker
        users={users}
        error={error ?? listError}
        onSelect={select}
        onRetry={retry}
      />
    );
  if (!context || context.me.id !== selected)
    return (
      <main className="loading">
        <Mark />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={retry}>
              Tentar novamente
            </button>
            <button className="quiet" onClick={() => select(null)}>
              Escolher outro utilizador
            </button>
          </>
        ) : (
          <>
            <p role="status">A abrir o ambiente…</p>
            <button className="quiet" onClick={() => select(null)}>
              Escolher outro utilizador
            </button>
          </>
        )}
      </main>
    );
  return (
    <Dashboard
      me={context.me}
      sites={context.sites}
      users={users}
      onSelect={select}
    />
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

function Dashboard({
  me,
  sites,
  users,
  onSelect,
}: {
  me: CurrentUser;
  sites: Site[];
  users: DemoUser[];
  onSelect: (id: number | null) => void;
}) {
  const home = HOME[me.role];
  const staff = me.role === "admin" || me.role === "foreman";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Mark />
        <div className="sidebar-company">
          <span className="company-icon" aria-hidden="true">
            ▦
          </span>
          <strong>{me.company_name}</strong>
        </div>
        <nav aria-label="Principal">
          <a className="nav-active" href="/" aria-current="page">
            <span aria-hidden="true">◫</span>
            {home.title}
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="demo-label">
            <span />
            Demonstração
          </span>
          <p>Gestão de equipas e horas</p>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <p className="breadcrumb">
            {me.company_name}
            <span>/</span>
            {home.title}
          </p>
          <label className="switcher">
            <span className="sr-only">Trocar de utilizador</span>
            <select
              value={me.id}
              onChange={(event) =>
                onSelect(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Escolher outro utilizador…</option>
              {companies(users).map(([id, group]) => (
                <optgroup key={id} label={group.name}>
                  {group.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {ROLE_LABEL[user.role]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </header>
        <main className="dashboard">
          <div className="dashboard-heading">
            <div>
              <p className="eyebrow">{ROLE_LABEL[me.role]}</p>
              <h1>{home.title}</h1>
              <p>{home.subtitle}</p>
            </div>
            <span className={`avatar avatar--${me.role}`} aria-hidden="true">
              {initials(me.name)}
            </span>
          </div>
          <section className="welcome">
            <div>
              <h2>Olá, {me.name.split(" ")[0]}.</h2>
              <p>
                Está no ambiente da <strong>{me.company_name}</strong>.
              </p>
            </div>
            <span className="role-badge">{ROLE_LABEL[me.role]}</span>
          </section>
          {staff ? (
            <section className="site-section" aria-labelledby="sites-title">
              <div className="section-heading">
                <h2 id="sites-title">
                  {me.role === "admin"
                    ? "Obras da empresa"
                    : "Sob a sua responsabilidade"}
                </h2>
                <span className="count-badge">{sites.length}</span>
              </div>
              {sites.length === 0 ? (
                <p className="empty">
                  Ainda não existem obras disponíveis para este perfil.
                </p>
              ) : (
                <div className="site-grid">
                  {sites.map((site) => (
                    <article className="site-card" key={site.id}>
                      <span className="site-icon" aria-hidden="true">
                        ▥
                      </span>
                      <h3>{site.name}</h3>
                      <p>{me.company_name}</p>
                      <span className="site-label">
                        <span />
                        Em acompanhamento
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : me.role === "worker" ? (
            <WorkerClock key={me.id} me={me} />
          ) : null}
          {staff && <Operations key={me.id} me={me} />}
          {(me.role === "admin" || me.role === "client") && <InvoicesPanel key={me.id} userId={me.id} role={me.role} />}
          <footer className="dashboard-footer">
            <span>FONSAT · Gestão de equipas</span>
            <button className="quiet" onClick={() => onSelect(null)}>
              Escolher outro utilizador
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
