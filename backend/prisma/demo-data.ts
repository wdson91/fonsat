import { createHash } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
function demoId(companyId: number, key: string) {
  const hex = createHash("sha256")
    .update(`fonsat-demo:${companyId}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function anchoredDemoSite(
  tx: Prisma.TransactionClient,
  companyId: number,
  index: number,
) {
  return (
    await tx.entryVersion.findFirst({
      where: {
        companyId,
        entryId: demoId(companyId, index === 0 ? "closed" : "pending"),
        number: 1,
      },
      include: { site: true },
    })
  )?.site;
}
export async function anchoredDemoTrade(
  tx: Prisma.TransactionClient,
  companyId: number,
  index: number,
) {
  return (
    await tx.entryVersion.findFirst({
      where: {
        companyId,
        entryId: demoId(companyId, index === 0 ? "closed" : "pending"),
        number: 1,
      },
      include: { trade: true },
    })
  )?.trade;
}
export async function completeDemo(
  tx: Prisma.TransactionClient,
  company: { id: number; name: string; timeZone: string },
  users: { id: number; name: string }[],
  sites: { id: number; clientId: number | null }[],
) {
  // The first immutable example anchors the scenario, so later restarts never
  // recreate facts, overwrite corrections, or move examples to a new week.
  if (
    await tx.workEntry.findUnique({
      where: { id: demoId(company.id, "closed") },
    })
  )
    return;
  const primary = await tx.worker.findUniqueOrThrow({
    where: { userId: users[0].id },
  });
  const painter = await tx.trade.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: "Pintor" } },
  });
  const extraName =
    company.name === "FONSAT" ? "Miguel Sousa" : "Nuno Ferreira";
  const extraUser = await tx.demoUser.upsert({
    where: { companyId_name: { companyId: company.id, name: extraName } },
    update: {},
    create: { companyId: company.id, name: extraName, role: "worker" },
  });
  const extra = await tx.worker.upsert({
    where: { companyId_name: { companyId: company.id, name: extraName } },
    update: {},
    create: {
      companyId: company.id,
      name: extraName,
      tradeId: painter.id,
      userId: extraUser.id,
    },
  });
  await tx.worker.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: company.name === "FONSAT" ? "Rui Santos" : "Tiago Rocha",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: company.name === "FONSAT" ? "Rui Santos" : "Tiago Rocha",
      tradeId: primary.tradeId,
    },
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`),
    weekday = (day.getUTCDay() + 6) % 7;
  const monday = new Date(+day - weekday * 86400000),
    yesterday = new Date(+day - 86400000);
  const startsOn = new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`);
  for (const site of sites)
    for (const [tradeId, cents] of [
      [primary.tradeId, 2250],
      [painter.id, 2400],
    ]) {
      if (
        site.clientId &&
        !(await tx.rate.findFirst({
          where: { clientId: site.clientId, tradeId },
        }))
      )
        await tx.rate.create({
          data: {
            companyId: company.id,
            clientId: site.clientId,
            tradeId,
            cents,
            startsOn,
          },
        });
    }
  for (let index = 0; index < 5; index++) {
    const date = new Date(+monday + index * 86400000);
    for (const [workerId, siteId] of [
      [primary.id, sites[0].id],
      [extra.id, sites[1].id],
    ])
      await tx.allocation.upsert({
        where: {
          companyId_workerId_day: {
            companyId: company.id,
            workerId,
            day: date,
          },
        },
        update: {},
        create: {
          companyId: company.id,
          workerId,
          siteId,
          day: date,
          changedBy: users[2].id,
        },
      });
  }
  for (const example of [
    {
      key: "closed",
      workerId: primary.id,
      userId: users[0].id,
      site: sites[0],
      tradeId: primary.tradeId,
      day: monday,
      minutes: 480,
    },
    {
      key: "pending",
      workerId: extra.id,
      userId: extraUser.id,
      site: sites[1],
      tradeId: painter.id,
      day: yesterday,
      minutes: null,
    },
  ]) {
    const id = demoId(company.id, example.key),
      startAt = new Date(`${example.day.toISOString().slice(0, 10)}T08:00:00Z`);
    await tx.workEntry.create({
      data: {
        id,
        companyId: company.id,
        workerId: example.workerId,
        currentVersion: 1,
      },
    });
    await tx.clockEvent.create({
      data: {
        id: demoId(company.id, `${example.key}:in`),
        companyId: company.id,
        entryId: id,
        siteId: example.site.id,
        kind: "in",
        occurredAt: startAt,
      },
    });
    const endAt =
      example.minutes === null
        ? null
        : new Date(+startAt + example.minutes * 60000);
    if (endAt)
      await tx.clockEvent.create({
        data: {
          id: demoId(company.id, `${example.key}:out`),
          companyId: company.id,
          entryId: id,
          siteId: example.site.id,
          kind: "out",
          occurredAt: endAt,
        },
      });
    await tx.entryVersion.create({
      data: {
        companyId: company.id,
        entryId: id,
        number: 1,
        siteId: example.site.id,
        tradeId: example.tradeId,
        startAt,
        endAt,
        workedOn: example.day,
        minutes: example.minutes,
        source: "clock",
        authorId: example.userId,
      },
    });
  }
}
