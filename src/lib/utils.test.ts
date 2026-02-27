import { expect, test, describe } from "bun:test"
import { cn, formatDate } from "./utils"

describe("cn", () => {
    test("merges tailwind classes", () => {
        expect(cn("p-2 text-red", "bg-blue")).toBe("p-2 text-red bg-blue")
    })

    test("handles object syntax", () => {
        expect(cn("p-2", { "text-red": true, "bg-blue": false })).toBe("p-2 text-red")
    })

    test("deduplicates tailwind classes", () => {
        expect(cn("p-2 p-4")).toBe("p-4")
        expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
    })
})

describe("formatDate", () => {
    test("formats null Date correctly", () => {
        expect(formatDate(null)).toBe("—")
        expect(formatDate(undefined)).toBe("—")
    })

    test("formats invalid Date correctly", () => {
        expect(formatDate("Invalid-Date-String")).toBe("Invalid Date")
    })
})
