import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test"

type CreateSiteDomainRecord = (typeof import("./site-domains"))["createSiteDomainRecord"]
type UpdateSiteDomainRecord = (typeof import("./site-domains"))["updateSiteDomainRecord"]
type WriteCreatedSiteDomain = (typeof import("./site-domains"))["writeCreatedSiteDomain"]
type WriteUpdatedSiteDomain = (typeof import("./site-domains"))["writeUpdatedSiteDomain"]
type WriteDeletedSiteDomain = (typeof import("./site-domains"))["writeDeletedSiteDomain"]

type Operation = {
  kind: string
  values?: Record<string, unknown>
  tag?: string
  profile?: string
}

let createSiteDomainRecord: CreateSiteDomainRecord
let updateSiteDomainRecord: UpdateSiteDomainRecord
let writeCreatedSiteDomain: WriteCreatedSiteDomain
let writeUpdatedSiteDomain: WriteUpdatedSiteDomain
let writeDeletedSiteDomain: WriteDeletedSiteDomain

let operations: Operation[] = []
let selectedRecord: Record<string, unknown> | null = null
let transactionCalls = 0

function makeTransactionContext() {
  return {
    update() {
      return {
        set(values: Record<string, unknown>) {
          operations.push({ kind: "update:set", values })
          return {
            where: async () => {
              operations.push({ kind: "update:where", values })
            },
          }
        },
      }
    },
    insert() {
      return {
        values: async (values: Record<string, unknown>) => {
          operations.push({ kind: "insert:values", values })
        },
      }
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                get: async () => {
                  operations.push({ kind: "select:get" })
                  return selectedRecord
                },
              }
            },
          }
        },
      }
    },
  }
}

mock.module("next/cache", () => ({
  unstable_cache: (callback: (...args: unknown[]) => unknown) => callback,
  revalidateTag: (tag: string, profile: string) => {
    operations.push({ kind: "cache:revalidateTag", tag, profile })
  },
}))

mock.module("@/lib/db", () => ({
  initDb: async () => {},
  db: {
    transaction: async (callback: (tx: ReturnType<typeof makeTransactionContext>) => Promise<unknown>) => {
      transactionCalls += 1
      return callback(makeTransactionContext())
    },
    delete() {
      return {
        where: async () => {
          operations.push({ kind: "delete:where" })
        },
      }
    },
  },
}))

beforeAll(async () => {
  ;({
    createSiteDomainRecord,
    updateSiteDomainRecord,
    writeCreatedSiteDomain,
    writeUpdatedSiteDomain,
    writeDeletedSiteDomain,
  } = await import("./site-domains"))
})

beforeEach(() => {
  operations = []
  selectedRecord = null
  transactionCalls = 0
})

describe("parseDomainHost", () => {
  it("normalizes mixed-case hosts and strips a trailing dot", async () => {
    expect((await import("./site-domains")).parseDomainHost("  ExAmPle.COM. ")).toBe("example.com")
    expect((await import("./site-domains")).parseDomainHost("xn--fsqu00a.xn--0zwm56d")).toBe("xn--fsqu00a.xn--0zwm56d")
  })

  it("rejects ports, paths, credentials, and single-label hosts", async () => {
    const { parseDomainHost } = await import("./site-domains")

    expect(parseDomainHost("example.com:3000")).toBeNull()
    expect(parseDomainHost("https://example.com/path")).toBeNull()
    expect(parseDomainHost("user@example.com")).toBeNull()
    expect(parseDomainHost("localhost")).toBeNull()
    expect(parseDomainHost("-bad.example")).toBeNull()
    expect(parseDomainHost("bad-.example")).toBeNull()
  })
})

describe("site domain default switching", () => {
  it("creates a default domain inside one transaction after clearing prior defaults", async () => {
    selectedRecord = {
      id: "domain_new",
      host: "new.example",
      isDefaultShortDomain: true,
    }

    const createdAt = new Date("2026-04-05T12:00:00.000Z")
    const result = await createSiteDomainRecord({
      id: "domain_new",
      host: "new.example",
      supportsShortLinks: true,
      supportsTempEmail: false,
      isActive: true,
      isDefaultShortDomain: true,
      isDefaultEmailDomain: false,
      createdAt,
    })

    expect(result).toEqual(selectedRecord)
    expect(transactionCalls).toBe(1)
    expect(operations).toEqual([
      { kind: "update:set", values: { isDefaultShortDomain: false } },
      { kind: "update:where", values: { isDefaultShortDomain: false } },
      {
        kind: "insert:values",
        values: {
          id: "domain_new",
          host: "new.example",
          supportsShortLinks: true,
          supportsTempEmail: false,
          isActive: true,
          isDefaultShortDomain: true,
          isDefaultEmailDomain: false,
          createdAt,
        },
      },
      { kind: "select:get" },
    ])
  })

  it("updates a domain to default inside one transaction after clearing prior defaults", async () => {
    selectedRecord = {
      id: "domain_target",
      host: "target.example",
      isDefaultEmailDomain: true,
    }

    const result = await updateSiteDomainRecord("domain_target", {
      host: "target.example",
      supportsShortLinks: false,
      supportsTempEmail: true,
      isActive: true,
      isDefaultShortDomain: false,
      isDefaultEmailDomain: true,
    })

    expect(result).toEqual(selectedRecord)
    expect(transactionCalls).toBe(1)
    expect(operations).toEqual([
      { kind: "update:set", values: { isDefaultEmailDomain: false } },
      { kind: "update:where", values: { isDefaultEmailDomain: false } },
      {
        kind: "update:set",
        values: {
          host: "target.example",
          supportsShortLinks: false,
          supportsTempEmail: true,
          isActive: true,
          isDefaultShortDomain: false,
          isDefaultEmailDomain: true,
        },
      },
      {
        kind: "update:where",
        values: {
          host: "target.example",
          supportsShortLinks: false,
          supportsTempEmail: true,
          isActive: true,
          isDefaultShortDomain: false,
          isDefaultEmailDomain: true,
        },
      },
      { kind: "select:get" },
    ])
  })

  it("skips clearing defaults when an update does not promote the domain", async () => {
    selectedRecord = {
      id: "domain_plain",
      host: "plain.example",
      isDefaultShortDomain: false,
      isDefaultEmailDomain: false,
    }

    await updateSiteDomainRecord("domain_plain", {
      host: "plain.example",
      supportsShortLinks: true,
      supportsTempEmail: false,
      isActive: true,
      isDefaultShortDomain: false,
      isDefaultEmailDomain: false,
    })

    expect(transactionCalls).toBe(1)
    expect(operations).toEqual([
      {
        kind: "update:set",
        values: {
          host: "plain.example",
          supportsShortLinks: true,
          supportsTempEmail: false,
          isActive: true,
          isDefaultShortDomain: false,
          isDefaultEmailDomain: false,
        },
      },
      {
        kind: "update:where",
        values: {
          host: "plain.example",
          supportsShortLinks: true,
          supportsTempEmail: false,
          isActive: true,
          isDefaultShortDomain: false,
          isDefaultEmailDomain: false,
        },
      },
      { kind: "select:get" },
    ])
  })
})

describe("site domain cache invalidation", () => {
  it("revalidates cache after creating a domain through the shared write entrypoint", async () => {
    selectedRecord = { id: "domain_new", host: "new.example" }

    await writeCreatedSiteDomain({
      id: "domain_new",
      host: "new.example",
      supportsShortLinks: true,
      supportsTempEmail: false,
      isActive: true,
      isDefaultShortDomain: false,
      isDefaultEmailDomain: false,
      createdAt: new Date("2026-04-05T12:00:00.000Z"),
    })

    expect(operations.at(-1)).toEqual({ kind: "cache:revalidateTag", tag: "site-domains", profile: "max" })
  })

  it("revalidates cache after updating a domain through the shared write entrypoint", async () => {
    selectedRecord = { id: "domain_target", host: "target.example" }

    await writeUpdatedSiteDomain("domain_target", {
      host: "target.example",
      supportsShortLinks: true,
      supportsTempEmail: false,
      isActive: true,
      isDefaultShortDomain: false,
      isDefaultEmailDomain: false,
    })

    expect(operations.at(-1)).toEqual({ kind: "cache:revalidateTag", tag: "site-domains", profile: "max" })
  })

  it("revalidates cache after deleting a domain through the shared write entrypoint", async () => {
    await writeDeletedSiteDomain("domain_old")

    expect(operations).toEqual([{ kind: "delete:where" }, { kind: "cache:revalidateTag", tag: "site-domains", profile: "max" }])
  })
})
